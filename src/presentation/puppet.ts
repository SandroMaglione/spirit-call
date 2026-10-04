/**
 * Models in the scene. `copyModel` makes an independent copy of a loaded
 * model (its own skeleton and, when asked, its own materials, so a hit
 * flash lights only that one). A `Puppet` is a copy that moves: it faces a
 * direction, plays its loops by how its body moves, and plays one-shot
 * moments over them (see `animation.ts`).
 */
import { AnimationMixer, Bone, Color, LoopRepeat, Mesh, MeshStandardMaterial, SkinnedMesh } from "three"
import type { AnimationAction, Material, Object3D, Quaternion, Skeleton, Vector3 } from "three"
import { clone } from "three/addons/utils/SkeletonUtils.js"

import type { Vec2 } from "../math/vec.ts"
import { advanceLocomotion, freshLocomotion, oneShotPose, shotBlend } from "./animation.ts"
import type { Locomotion, OneShot } from "./animation.ts"
import { keepRim } from "./glow.ts"
import type { Moments, Shot } from "./looks.ts"
import type { ModelSource } from "./models.ts"

/** A copy's materials that are its own, with their colors before any tint, and their own glow (glowing eyes) before any flash. */
export type OwnMaterials = ReadonlyArray<{ readonly material: MeshStandardMaterial; readonly base: Color; readonly glow: Color }>

/** A copy of `source`; with `ownMaterials`, its materials are copies too (to tint or fade it alone). */
export const copyModel = (source: ModelSource, ownMaterials: boolean): { readonly object: Object3D; readonly materials: OwnMaterials } => {
  const object = clone(source.scene)
  const materials: Array<{ material: MeshStandardMaterial; base: Color; glow: Color }> = []
  if (ownMaterials) {
    const copies = new Map<Material, MeshStandardMaterial>()
    // Parts sharing a material keep sharing the copy.
    const own = (material: Material): Material => {
      if (!(material instanceof MeshStandardMaterial)) return material
      const known = copies.get(material)
      if (known !== undefined) return known
      const copy = material.clone()
      keepRim(copy)
      copies.set(material, copy)
      materials.push({ material: copy, base: copy.color.clone(), glow: copy.emissive.clone().multiplyScalar(copy.emissiveIntensity) })
      return copy
    }
    object.traverse((part) => {
      if (part instanceof Mesh) part.material = Array.isArray(part.material) ? part.material.map(own) : own(part.material)
    })
  }
  return { object, materials }
}

/** Frees what a copy owns: its materials and skeletons (geometry and textures stay with the loaded model). */
export const disposeCopy = (object: Object3D, materials: OwnMaterials): void => {
  for (const { material } of materials) material.dispose()
  const skeletons = new Set<Skeleton>()
  object.traverse((part) => {
    if (part instanceof SkinnedMesh) skeletons.add(part.skeleton)
  })
  for (const skeleton of skeletons) skeleton.dispose()
}

const tinted = new Color()
const flash = new Color()

/**
 * Colors `materials` multiplied by `tint` (white for none), lit by `glow`
 * (0..1) of `glowColor` over their own glow, and see-through below
 * `opacity` 1.
 */
export const paintMaterials = (materials: OwnMaterials, tint: number, glowColor: number, glow: number, opacity: number): void => {
  tinted.setHex(tint)
  flash.setHex(glowColor).multiplyScalar(glow)
  const seeThrough = opacity < 1
  for (const { material, base, glow: own } of materials) {
    material.color.copy(base).multiply(tinted)
    material.emissive.copy(own).add(flash)
    material.emissiveIntensity = 1
    material.opacity = opacity
    if (material.transparent !== seeThrough) {
      material.transparent = seeThrough
      material.needsUpdate = true
    }
  }
}

export class Puppet {
  /** The model, scaled to its body; it turns to face. */
  readonly object: Object3D
  readonly moments: Moments | null
  private readonly materials: Array<OwnMaterials[number]>
  private readonly mixer: AnimationMixer
  private readonly actions = new Map<string, AnimationAction>()
  private readonly locomotion: Locomotion = freshLocomotion()
  private shot: OneShot | null = null
  private readonly source: ModelSource
  /** A frozen outgoing pose lets a cut start from a run or another cut without snapping to idle. */
  private readonly joints: Array<{
    bone: Bone; position: Vector3; rotation: Quaternion; scale: Vector3
    targetPosition: Vector3; targetRotation: Quaternion; targetScale: Vector3
  }> = []
  private transition: { elapsed: number; seconds: number } | null = null
  private restorePose = false

  constructor(source: ModelSource, height: number, moments: Moments | null) {
    this.source = source
    const copy = copyModel(source, true)
    this.object = copy.object
    if (source.spec.height === null) throw new Error(`Model ${source.id} has no height: it cannot be a body`)
    this.object.scale.setScalar(height / source.spec.height)
    this.materials = [...copy.materials]
    this.moments = moments
    this.mixer = new AnimationMixer(this.object)
    this.object.traverse((bone) => {
      if (bone instanceof Bone) this.joints.push({
        bone, position: bone.position.clone(), rotation: bone.quaternion.clone(), scale: bone.scale.clone(),
        targetPosition: bone.position.clone(), targetRotation: bone.quaternion.clone(), targetScale: bone.scale.clone()
      })
    })
  }

  /** Turns to face `direction` on the floor (models face +Z, the floor's y). */
  face(direction: Vec2): void {
    if (direction.x !== 0 || direction.y !== 0) this.object.rotation.y = Math.atan2(direction.x, direction.y)
  }

  /** Puts a copy of `source` in its `bone` as it is (a weapon in hand); it is lit and tinted with the body. */
  hold(source: ModelSource, bone: string): void {
    const grip = this.object.getObjectByName(bone)
    if (grip === undefined) throw new Error(`Model ${this.source.id} has no ${bone} to hold ${source.id} in`)
    const copy = copyModel(source, true)
    grip.add(copy.object)
    // Its materials are freed with the body's.
    this.materials.push(...copy.materials)
  }

  /**
   * Plays `shot` once over `seconds` of game time (its own length when
   * `null`), over the loops; a new one replaces the last. `hitAt` is when
   * its blow lands in the simulation (see `OneShot`).
   */
  play(shot: Shot, seconds: number | null, hitAt: number | null): void {
    this.start(shot, seconds, hitAt, true)
  }

  private start(shot: Shot, seconds: number | null, hitAt: number | null, blendIn: boolean): OneShot | undefined {
    const part = typeof shot === "string" ? { clip: shot } : shot
    const action = this.action(part.clip)
    if (action === undefined) return
    const from = part.from ?? 0
    const to = part.to ?? action.getClip().duration
    const length = seconds ?? to - from
    if (length <= 0) return
    const blendSeconds = blendIn ? Math.min(shotBlend.in, length * 0.25, hitAt ?? Infinity) : 0
    this.transition = blendSeconds > 0 ? { elapsed: 0, seconds: blendSeconds } : null
    if (this.transition !== null) {
      for (const joint of this.joints) {
        joint.position.copy(joint.bone.position)
        joint.rotation.copy(joint.bone.quaternion)
        joint.scale.copy(joint.bone.scale)
      }
    }
    this.shot = {
      clip: part.clip,
      from,
      to,
      contact: part.contact ?? null,
      hitAt,
      seconds: length,
      next: part.next ?? null,
      // The outgoing pose is blended below, reaching full strength by contact.
      blendIn: false,
      elapsed: 0
    }
    return this.shot
  }

  /**
   * Moves the animation on by a frame and poses the model: `position` is
   * where the body is drawn, `facing` where it faces, `seconds` the frame
   * (0 while the world is frozen); `holding` keeps the loops still (a dash).
   */
  animate(position: Vec2, facing: Vec2, seconds: number, holding: boolean): void {
    const moments = this.moments
    if (moments === null) return
    const idle = this.action(moments.idle)
    const run = this.action(moments.run.clip)
    const pace = { idleSeconds: idle?.getClip().duration ?? 1, runDistance: moments.run.distance }
    advanceLocomotion(this.locomotion, pace, position, facing, seconds, holding)
    if (this.shot !== null) {
      this.shot.elapsed += seconds
      // Done: what follows it carries on from its last pose, or the loops take over.
      const after = this.shot.next
      if (this.shot.elapsed >= this.shot.seconds) {
        const overflow = this.shot.elapsed - this.shot.seconds
        this.shot = null
        if (after !== null) {
          const following = this.start(after, null, null, false)
          if (following !== undefined) following.elapsed = overflow
        }
      }
    }
    const pose = this.shot === null ? null : oneShotPose(this.shot)
    const shot = this.shot === null ? undefined : this.action(this.shot.clip)
    const over = pose === null ? 0 : pose.weight
    const { idle: idlePhase, run: runPhase, running } = this.locomotion
    for (const action of this.actions.values()) action.setEffectiveWeight(0)
    if (idle !== undefined) {
      idle.time = idlePhase * idle.getClip().duration
      idle.setEffectiveWeight((1 - running) * (1 - over))
    }
    if (run !== undefined) {
      run.time = runPhase * run.getClip().duration
      run.setEffectiveWeight(running * (1 - over))
    }
    if (shot !== undefined && pose !== null) {
      shot.time = pose.time
      shot.setEffectiveWeight(over)
    }
    // Three skips writing unchanged tracks. Restore its last output first,
    // otherwise a held target would blend repeatedly from our modified pose.
    if (this.restorePose) {
      for (const joint of this.joints) {
        joint.bone.position.copy(joint.targetPosition)
        joint.bone.quaternion.copy(joint.targetRotation)
        joint.bone.scale.copy(joint.targetScale)
      }
    }
    this.restorePose = false
    this.mixer.update(0)
    if (this.transition !== null) {
      this.transition.elapsed += seconds
      const weight = Math.min(1, this.transition.elapsed / this.transition.seconds)
      for (const joint of this.joints) {
        joint.targetPosition.copy(joint.bone.position)
        joint.targetRotation.copy(joint.bone.quaternion)
        joint.targetScale.copy(joint.bone.scale)
        joint.bone.position.lerpVectors(joint.position, joint.bone.position, weight)
        joint.bone.quaternion.slerpQuaternions(joint.rotation, joint.bone.quaternion, weight)
        joint.bone.scale.lerpVectors(joint.scale, joint.bone.scale, weight)
      }
      this.restorePose = weight < 1
      if (weight === 1) this.transition = null
    }
  }

  paint(tint: number, glowColor: number, glow: number, opacity: number): void {
    paintMaterials(this.materials, tint, glowColor, glow, opacity)
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.object)
    disposeCopy(this.object, this.materials)
  }

  /** The action playing `clip`, made on first use; `undefined` when the model has no such clip. */
  private action(clip: string): AnimationAction | undefined {
    const known = this.actions.get(clip)
    if (known !== undefined) return known
    const source = this.source.clips.get(clip)
    if (source === undefined) return undefined
    // Times are set every frame: the mixer only blends.
    const action = this.mixer.clipAction(source).setLoop(LoopRepeat, Infinity).play()
    action.setEffectiveWeight(0)
    this.actions.set(clip, action)
    return action
  }
}
