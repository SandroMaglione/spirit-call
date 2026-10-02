import { Object3D } from "three"
import { atlasFrame } from "./animation-atlas.ts"
import { advanceLocomotion, freshLocomotion } from "./animation.ts"
import { Instance } from "./batch.ts"
import type { ActorBody } from "./bodies.ts"
import type { RenderAssets } from "./host-types.ts"
import type { BodyLook } from "./looks.ts"
import { mixColor } from "./draw.ts"

/** One transform and pose cursor per enemy; geometry, material and bones are shared. */
export const instancedBody = (assets: RenderAssets, look: Extract<BodyLook, { kind: "model" }>, radius: number, height: number): ActorBody => {
  const { batch, atlas } = assets.animated(look.model)
  const instance = new Instance(batch)
  const object = new Object3D()
  object.add(instance.object)
  const reference = assets.model(look.model).spec.height
  if (reference === null) throw new Error(`${look.model} needs a body height`)
  instance.object.scale.setScalar(height / reference)
  const moments = look.moments ?? null
  const locomotion = freshLocomotion()
  let shot: { clip: string; elapsed: number; seconds: number } | null = atlas.clips.has("Spawn") ? { clip: "Spawn", elapsed: 0, seconds: atlas.clips.get("Spawn")!.seconds } : null
  const pose = (name: string, seconds: number) => {
    const clip = atlas.clips.get(name)
    if (clip === undefined) return
    const [a, b, weight] = atlasFrame(clip, seconds)
    instance.pose[0] = a; instance.pose[1] = b; instance.pose[2] = weight
  }
  return {
    object, radius, height, instances: [instance], moments,
    shield(angle) { instance.pose[3] = angle },
    face(direction) { if (direction.x !== 0 || direction.y !== 0) object.rotation.y = Math.atan2(direction.x, direction.y) },
    paint(tint, glowColor, glow) { instance.color.setHex(mixColor(tint, glowColor, glow)) },
    play(spec, seconds) {
      const clip = typeof spec === "string" ? spec : spec.clip
      const info = atlas.clips.get(clip)
      if (info !== undefined) shot = { clip, elapsed: 0, seconds: seconds ?? info.seconds }
    },
    sample(clip, progress) {
      const info = atlas.clips.get(clip)
      if (info !== undefined) pose(clip, progress * info.seconds)
    },
    animate(position, facing, seconds, holding) {
      if (moments === null) return
      const idle = atlas.clips.get(moments.idle)
      const run = atlas.clips.get(moments.run.clip)
      advanceLocomotion(locomotion, { idleSeconds: idle?.seconds ?? 2, runDistance: moments.run.distance }, position, facing, seconds, holding)
      if (shot !== null) {
        shot.elapsed += seconds
        if (shot.elapsed >= shot.seconds) shot = null
      }
      if (shot !== null) pose(shot.clip, shot.elapsed / shot.seconds * atlas.clips.get(shot.clip)!.seconds)
      else if (locomotion.running > .5 && run !== undefined) pose(moments.run.clip, locomotion.run * run.seconds)
      else pose(moments.idle, locomotion.idle * (idle?.seconds ?? 2))
    },
    dispose() {}
  }
}
