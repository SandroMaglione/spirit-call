import { Object3D } from "three"
import { atlasFrame } from "./animation-atlas.ts"
import { advanceLocomotion, freshLocomotion } from "./animation.ts"
import { Instance } from "./batch.ts"
import type { ActorBody } from "./bodies.ts"
import type { AnimationAtlas } from "./animation-atlas.ts"
import type { Batch } from "./batch.ts"
import type { BodyLook } from "./looks.ts"
import type { ModelId, ModelSource } from "./models.ts"

/** What an instanced body reads from the render assets (`RenderAssets` is one). */
export interface BodyAssets {
  animated(id: ModelId): { readonly batch: Batch; readonly atlas: Pick<AnimationAtlas, "clips"> }
  model(id: ModelId): { readonly spec: Pick<ModelSource["spec"], "height"> }
}

let idlePhase = 0

/** One transform and pose cursor per enemy; geometry, material and bones are shared. */
export const instancedBody = (assets: BodyAssets, look: Extract<BodyLook, { kind: "model" }>, radius: number, height: number): ActorBody => {
  const { batch, atlas } = assets.animated(look.model)
  const instance = new Instance(batch)
  const object = new Object3D()
  object.add(instance.object)
  const reference = assets.model(look.model).spec.height
  if (reference === null) throw new Error(`${look.model} needs a body height`)
  instance.object.scale.setScalar(height / reference)
  const moments = look.moments ?? null
  const locomotion = freshLocomotion()
  // A repeatable phase sequence spreads a crowd across its breathing loop.
  idlePhase = (idlePhase + .61803398875) % 1
  locomotion.idle = idlePhase
  let shot: { clip: string; elapsed: number; seconds: number } | null = atlas.clips.has("Spawn") ? { clip: "Spawn", elapsed: 0, seconds: atlas.clips.get("Spawn")!.seconds } : null
  let selected: string | null = null
  let previous: string | null = null
  const previousPose = [0, 0, 0]
  let transition = look.transitionSeconds ?? 0
  let yaw: number | null = null
  let shieldAngle = 0
  const pose = (name: string, seconds: number) => {
    const clip = atlas.clips.get(name)
    if (clip === undefined) return
    selected = name
    const [a, b, weight] = atlasFrame(clip, seconds)
    instance.pose[0] = a; instance.pose[1] = b; instance.pose[2] = weight
  }
  return {
    object, radius, height, instances: [instance], moments,
    shield(angle) {
      shieldAngle = angle
      instance.pose[3] = angle + (yaw ?? object.rotation.y) - object.rotation.y
    },
    face(direction) {
      if (direction.x === 0 && direction.y === 0) return
      const next = Math.atan2(direction.x, direction.y)
      if (yaw === null) object.rotation.y = next
      yaw = next
    },
    paint(tint, glowColor, glow) {
      instance.color.setHex(tint)
      instance.glow.setHex(glowColor)
      instance.glowAmount = glow
    },
    play(spec, seconds) {
      const clip = typeof spec === "string" ? spec : spec.clip
      const info = atlas.clips.get(clip)
      if (info !== undefined) shot = { clip, elapsed: 0, seconds: seconds ?? info.seconds }
    },
    sample(clip, progress) {
      const info = atlas.clips.get(clip)
      if (info !== undefined) {
        // An aimed attack must agree with its simulation telegraph immediately.
        if (yaw !== null) object.rotation.y = yaw
        instance.pose[3] = shieldAngle
        pose(clip, progress * info.seconds)
      }
    },
    animate(position, facing, seconds, holding) {
      if (yaw !== null && seconds > 0) {
        const delta = Math.atan2(Math.sin(yaw - object.rotation.y), Math.cos(yaw - object.rotation.y))
        object.rotation.y += Math.sign(delta) * Math.min(Math.abs(delta), 14 * seconds)
        instance.pose[3] = shieldAngle + yaw - object.rotation.y
      }
      if (moments === null) return
      const idle = atlas.clips.get(moments.idle)
      const run = atlas.clips.get(moments.run.clip)
      advanceLocomotion(locomotion, { idleSeconds: idle?.seconds ?? 2, runDistance: moments.run.distance }, position, facing, seconds, holding)
      if (shot !== null) {
        shot.elapsed += seconds
        if (shot.elapsed >= shot.seconds) shot = null
      }
      if (shot !== null) pose(shot.clip, shot.elapsed / shot.seconds * atlas.clips.get(shot.clip)!.seconds)
      else if (locomotion.running > .5 && run !== undefined) pose(moments.run.clip, (moments.run.timeBased ? locomotion.idle : locomotion.run) * run.seconds)
      else pose(moments.idle, locomotion.idle * (idle?.seconds ?? 2))
    },
    ...(look.transitionSeconds === undefined ? {} : { finishAnimation(seconds: number) {
      if (seconds <= 0 || selected === null) return
      const duration = look.transitionSeconds!
      if (previous !== null && selected !== previous) {
        // Only loop boundaries blend. Windup → hit → recovery keeps the
        // exact sampled contact poses, including a zero-length active phase.
        if (atlas.clips.get(previous)?.loop || atlas.clips.get(selected)?.loop) {
          for (let i = 0; i < 3; i++) instance.blendPose[i] = previousPose[i]!
          transition = 0
        } else transition = duration
      }
      const progress = duration <= 0 ? 1 : Math.min(1, transition / duration)
      instance.blendPose[3] = progress * progress * (3 - 2 * progress)
      transition += seconds
      previous = selected
      for (let i = 0; i < 3; i++) previousPose[i] = instance.pose[i]!
    } }),
    dispose() {}
  }
}
