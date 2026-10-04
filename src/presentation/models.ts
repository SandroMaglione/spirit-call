/**
 * 3D models (glTF binary files from Blender), registered by id. A model is
 * an asset, not content: which character, enemy, or wall uses which model
 * is in `looks.ts`. See `docs/models.md` for what a model file must be.
 *
 * The files live in `art/`, next to their Blender sources; each model's
 * numbers (`ModelSpec`) are copied from its export's metadata by a module in
 * `assets/`.
 */
import { Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Texture } from "three"
import type { AnimationClip, Material, Object3D } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

import { courtyardModels } from "./assets/courtyard.ts"
import { cisternModels } from "./assets/cistern.ts"
import { kilnworksModels } from "./assets/kilnworks.ts"
import { sanctuaryModels } from "./assets/sanctuary.ts"
import { citadelModels } from "./assets/citadel.ts"
import { harborModels } from "./assets/harbor.ts"
import { necropolisModels } from "./assets/necropolis.ts"
import { monasteryModels } from "./assets/monastery.ts"
import { enemyModels } from "./assets/enemies.ts"
import { fireSpiritModel, thunderSpiritModel, waterSpiritModel, windSpiritModel } from "./assets/spirits.ts"
import { addGlow } from "./glow.ts"
import type { GlowSpec } from "./glow.ts"

/** How a clip ends: loops name the time their first pose comes back (`closeLoop`); one-shots have `null`. */
export interface ClipTiming {
  /** The time of the clip's last key as exported. */
  readonly lastKeySeconds: number
  readonly loopSeconds: number | null
}

export interface ModelSpec {
  readonly url: string
  /** Rest-pose height in the file's units (meters), to scale it to a body; `null` for a part held by another model (it takes that model's scale). */
  readonly height: number | null
  /** Its footprint on the floor (meters, X × Z), for pieces fitted to the arena's walls and floor. */
  readonly footprint?: readonly [number, number]
  /** Its animation clips by name; a model without animation has none. */
  readonly clips: Readonly<Record<string, ClipTiming>>
  /** A glow from within (rim, halo, glowing eyes; see `glow.ts`). */
  readonly glow?: GlowSpec
}

/** The water spirit's glow, after its sheet: cyan edges, a soft blue halo, haloed eyes. */
const waterGlow: GlowSpec = {
  rim: { color: 0x8eebff, strength: 0.9, power: 2.5 },
  halo: { color: 0x2e7bff, opacity: 0.35, size: 1.6 },
  eyes: { nodes: ["Eye.L", "Eye.R"], color: 0xcff6ff, opacity: 0.6, size: 0.3 }
}

/** The fire spirit's glow, after its sheet: a warm yellow heart, ember red edges, an orange halo; its eyes stay dark. */
const fireGlow: GlowSpec = {
  rim: { color: 0xe6391f, strength: 1.1, power: 1.8 },
  core: { color: 0xffd54a, strength: 0.8, power: 2.2 },
  halo: { color: 0xff8a3d, opacity: 0.4, size: 1.6 },
  eyes: { nodes: ["Eye.L", "Eye.R"], color: 0, opacity: 0, size: 0 }
}

/** The wind spirit's glow, after its sheet: teal edges and a teal halo, kept low (its colors are pale: more washes them out); its eyes stay dark. */
const windGlow: GlowSpec = {
  rim: { color: 0x4cc7a7, strength: 0.45, power: 2.5 },
  halo: { color: 0x4cc7a7, opacity: 0.22, size: 1.5 },
  eyes: { nodes: ["Eye.L", "Eye.R"], color: 0, opacity: 0, size: 0 }
}

/** Violet edges and soft gold eye glows; the electrical ring is part of the model. */
const thunderGlow: GlowSpec = {
  rim: { color: 0xc9b8ff, strength: 0.55, power: 2.8 },
  halo: { color: 0x7a6bff, opacity: 0.22, size: 1.55 },
  eyes: { nodes: ["Eye.L", "Eye.R"], color: 0xffe66d, opacity: 0.5, size: 0.3 }
}

/** Every model the game can show. Add new ones here (with their module in `assets/`). */
export const models = {
  waterSpirit: { ...waterSpiritModel, glow: waterGlow },
  fireSpirit: { ...fireSpiritModel, glow: fireGlow },
  windSpirit: { ...windSpiritModel, glow: windGlow },
  thunderSpirit: { ...thunderSpiritModel, glow: thunderGlow },
  ...courtyardModels,
  ...cisternModels,
  ...kilnworksModels,
  ...sanctuaryModels,
  ...citadelModels,
  ...harborModels,
  ...necropolisModels,
  ...monasteryModels,
  ...enemyModels
} as const satisfies Record<string, ModelSpec>

export type ModelId = keyof typeof models

/** A loaded model: its scene (copied for each use) and its clips, ready to play. */
export interface ModelSource {
  readonly id: ModelId
  readonly spec: ModelSpec
  readonly scene: Object3D
  readonly clips: ReadonlyMap<string, AnimationClip>
}

/**
 * glTF has no looping clips: an export stops at the last pose before the
 * loop closes, which would skip the last stretch back to the first pose.
 * This puts the first pose back at `loopSeconds`, as one more key (no
 * pause: the stretch is interpolated like any other).
 */
export const closeLoop = (source: AnimationClip, timing: ClipTiming): AnimationClip => {
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

/**
 * Blender's exporter adds material extensions (specular) that make three
 * use its costliest shader; low-poly models do not need them. Each becomes
 * a standard material with the same colors, textures, and roughness.
 */
const plainMaterials = (scene: Object3D): void => {
  const plain = new Map<Material, Material>()
  const simplify = (material: Material): Material => {
    if (!(material instanceof MeshPhysicalMaterial)) return material
    const known = plain.get(material)
    if (known !== undefined) return known
    const standard = new MeshStandardMaterial().copy(material)
    standard.name = material.name
    plain.set(material, standard)
    material.dispose()
    return standard
  }
  scene.traverse((part) => {
    if (part instanceof Mesh) part.material = Array.isArray(part.material) ? part.material.map(simplify) : simplify(part.material)
  })
}

/** Frees a loaded model's geometry, materials, and textures (copies share them). */
export const disposeModel = (source: ModelSource): void => {
  source.scene.traverse((part) => {
    if (!(part instanceof Mesh)) return
    part.geometry.dispose()
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      for (const value of Object.values(material)) if (value instanceof Texture) value.dispose()
      material.dispose()
    }
  })
}

/** Loads `ids` (each once), checking each file has exactly the clips its spec lists. */
export const loadModels = async (ids: Iterable<ModelId>): Promise<ReadonlyMap<ModelId, ModelSource>> => {
  const loader = new GLTFLoader()
  const loaded = await Promise.all([...new Set(ids)].map(async (id): Promise<ModelSource> => {
    const spec: ModelSpec = models[id]
    const gltf = await loader.loadAsync(spec.url)
    const clips = new Map<string, AnimationClip>()
    for (const animation of gltf.animations) {
      const timing = spec.clips[animation.name]
      if (timing === undefined) throw new Error(`Model ${id} has a clip its spec does not list: ${animation.name}`)
      clips.set(animation.name, closeLoop(animation, timing))
    }
    for (const name of Object.keys(spec.clips)) {
      if (!clips.has(name)) throw new Error(`Model ${id} is missing its ${name} clip`)
    }
    plainMaterials(gltf.scene)
    if (spec.glow !== undefined && spec.height !== null) addGlow(gltf.scene, spec.glow, spec.height)
    return { id, spec, scene: gltf.scene, clips }
  }))
  return new Map(loaded.map((source) => [source.id, source]))
}
