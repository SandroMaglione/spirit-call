/**
 * The crow on the field: the Blender model (see `assets/crow.ts`), loaded
 * once and copied for each character that comes in, with its own materials
 * (so a hit flash lights only her) and its own animation, posed every frame
 * from `CrowMotion`.
 */
import { AnimationMixer, Color, LoopRepeat, Mesh, MeshStandardMaterial, SkinnedMesh } from "three"
import type { AnimationAction, AnimationClip, Material, Object3D, Skeleton } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { clone } from "three/addons/utils/SkeletonUtils.js"

import { crowModel } from "./assets/crow.ts"
import type { CrowClip } from "./assets/crow.ts"
import { freshMotion } from "./crow-animation.ts"
import type { CrowMotion } from "./crow-animation.ts"

export interface CrowSource {
  readonly scene: Object3D
  readonly clips: ReadonlyMap<CrowClip, AnimationClip>
}

/**
 * glTF has no looping clips: the export stops at the last pose before the
 * loop closes, which would skip the last stretch back to the first pose.
 * This puts the first pose back at `loopSeconds`, as one more key (no
 * pause: the stretch is interpolated like any other).
 */
export const closeLoop = (source: AnimationClip, timing: { readonly lastKeySeconds: number; readonly loopSeconds: number | null }): AnimationClip => {
  const clip = source.clone()
  if (timing.loopSeconds === null) return clip
  for (const track of clip.tracks) {
    const last = track.times[track.times.length - 1]!
    if (Math.abs(last - timing.loopSeconds) < 1e-6) continue
    if (Math.abs(last - timing.lastKeySeconds) > 1e-6 || Math.abs(track.times[0]!) > 1e-6) {
      throw new Error(`Unexpected timing in ${source.name}/${track.name}`)
    }
    const stride = track.getValueSize()
    const times = new Float32Array(track.times.length + 1)
    times.set(track.times)
    times[times.length - 1] = timing.loopSeconds
    const values = new Float32Array(track.values.length + stride)
    values.set(track.values)
    values.set(track.values.subarray(0, stride), track.values.length)
    track.times = times
    track.values = values
  }
  clip.duration = timing.loopSeconds
  return clip
}

export const loadCrow = async (): Promise<CrowSource> => {
  const gltf = await new GLTFLoader().loadAsync(crowModel.url)
  const clips = new Map<CrowClip, AnimationClip>()
  for (const animation of gltf.animations) {
    if (!(animation.name in crowModel.clips)) throw new Error(`The crow has an unknown clip: ${animation.name}`)
    const name = animation.name as CrowClip
    clips.set(name, closeLoop(animation, crowModel.clips[name]))
  }
  return { scene: gltf.scene, clips }
}

/** One crow on the field. `model` faces the aim; the rest is hers alone. */
export interface Crow {
  readonly model: Object3D
  /** Her materials, with their own colors to tint from. */
  readonly materials: ReadonlyArray<{ readonly material: MeshStandardMaterial; readonly base: Color }>
  readonly mixer: AnimationMixer
  readonly idle: AnimationAction
  readonly run: AnimationAction
  readonly motion: CrowMotion
}

/** A copy of the crow, `height` world units tall. */
export const makeCrow = (source: CrowSource, height: number): Crow => {
  const model = clone(source.scene)
  model.scale.setScalar(height / crowModel.heightMeters)
  const materials: Array<{ material: MeshStandardMaterial; base: Color }> = []
  const copies = new Map<Material, MeshStandardMaterial>()
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return
    // Parts sharing a material keep sharing her copy of it.
    const own = (material: Material): Material => {
      if (!(material instanceof MeshStandardMaterial)) return material
      const known = copies.get(material)
      if (known !== undefined) return known
      const copy = material.clone()
      copies.set(material, copy)
      materials.push({ material: copy, base: copy.color.clone() })
      return copy
    }
    object.material = Array.isArray(object.material) ? object.material.map(own) : own(object.material)
  })
  const mixer = new AnimationMixer(model)
  const action = (name: CrowClip): AnimationAction => {
    const clip = source.clips.get(name)
    if (clip === undefined) throw new Error(`The crow has no ${name} clip`)
    return mixer.clipAction(clip).setLoop(LoopRepeat, Infinity).play()
  }
  return { model, materials, mixer, idle: action("Idle"), run: action("Run"), motion: freshMotion() }
}

/** Poses her from her motion, facing `aim` (a direction on the floor). */
export const poseCrow = (crow: Crow, aim: { readonly x: number; readonly y: number }): void => {
  // The model faces +Z, the floor's y.
  crow.model.rotation.y = Math.atan2(aim.x, aim.y)
  const { motion } = crow
  crow.idle.time = motion.idle * crowModel.clips.Idle.loopSeconds
  crow.run.time = motion.run * crowModel.clips.Run.loopSeconds
  crow.idle.setEffectiveWeight(1 - motion.running)
  crow.run.setEffectiveWeight(motion.running)
  crow.mixer.update(0)
}

const tinted = new Color()

/**
 * Her look this frame: colors multiplied by `tint` (a state, white for
 * none), lit by `glow` of `glowColor` (a hit flash, a dash, a charge), and
 * see-through below `opacity` 1.
 */
export const lightCrow = (crow: Crow, tint: number, glowColor: number, glow: number, opacity: number): void => {
  tinted.setHex(tint)
  const seeThrough = opacity < 1
  for (const { material, base } of crow.materials) {
    material.color.copy(base).multiply(tinted)
    material.emissive.setHex(glowColor)
    material.emissiveIntensity = glow
    material.transparent = seeThrough
    material.opacity = opacity
  }
}

export const disposeCrow = (crow: Crow): void => {
  crow.mixer.stopAllAction()
  crow.mixer.uncacheRoot(crow.model)
  // Geometry and textures are shared with the loaded model; her materials and skeletons (their bone textures) are her own.
  for (const { material } of crow.materials) material.dispose()
  const skeletons = new Set<Skeleton>()
  crow.model.traverse((object) => {
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton)
  })
  for (const skeleton of skeletons) skeleton.dispose()
}
