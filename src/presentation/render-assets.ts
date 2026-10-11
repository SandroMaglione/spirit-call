/**
 * What many nodes share, made once: batches (enemy capsules by size,
 * projectiles, shadows, and pieces of scenery by model), capsule geometry,
 * and the loaded models.
 */
import { AdditiveBlending, CapsuleGeometry, CircleGeometry, Color, CylinderGeometry, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry } from "three"
import type { BufferGeometry, Group, Material } from "three"

import { view } from "../config/view.ts"
import { Batch } from "./batch.ts"
import { bakeAnimation } from "./animation-atlas.ts"
import type { AnimationAtlas } from "./animation-atlas.ts"
import { floorLayers } from "./layers.ts"
import type { RenderAssets } from "./host-types.ts"
import type { ModelId, ModelSource } from "./models.ts"

/** Shared geometry, materials, and batches; batch meshes go into `parent`. */
export const makeAssets = (parent: Group, models: ReadonlyMap<ModelId, ModelSource>): RenderAssets => {
  const geometries = new Map<string, BufferGeometry>()
  const bodies = new Map<string, Batch>()
  const disc = new CircleGeometry(1, 20).rotateX(-Math.PI / 2)
  const orb = new IcosahedronGeometry(1, 0)
  const puck = new CylinderGeometry(1, 1, 0.3, 8)
  const spark = new OctahedronGeometry(1, 0)
  const shadow = new MeshBasicMaterial({ color: view.shadow, transparent: true, opacity: 0.35, depthWrite: false })
  const projectileShadow = new MeshBasicMaterial({ color: view.shadow, transparent: true, opacity: 0.3, depthWrite: false })
  // Unlit: projectiles glow in their color whichever way they face.
  const glow = new MeshBasicMaterial()
  // See-through glows (halos, trails), rounder than the orbs.
  const round = new IcosahedronGeometry(1, 1)
  const flare = new MeshBasicMaterial({ transparent: true, opacity: view.bolt.glowOpacity, blending: AdditiveBlending, depthWrite: false })
  // Instances bring their own colors; flat shading keeps the low-poly facets.
  const flesh = new MeshLambertMaterial({ flatShading: true })
  const fixed = [
    new Batch(parent, disc, shadow, { order: floorLayers.shadows.order }),
    new Batch(parent, disc, projectileShadow, { order: floorLayers.shadows.order }),
    new Batch(parent, orb, glow),
    new Batch(parent, puck, glow),
    new Batch(parent, round, flare),
    new Batch(parent, spark, glow)
  ] as const
  const bodyGeometry = (radius: number, height: number): BufferGeometry => {
    const key = `${radius.toFixed(2)}:${height.toFixed(2)}`
    const known = geometries.get(key)
    if (known !== undefined) return known
    const middle = Math.max(0.01, height - radius * 2)
    const geometry = new CapsuleGeometry(radius, middle, 2, 8).translate(0, height / 2, 0)
    geometries.set(key, geometry)
    return geometry
  }
  const pieces = new Map<string, Batch>()
  const tinted: Array<Material> = []
  const animated = new Map<ModelId, { readonly batch: Batch; readonly atlas: AnimationAtlas }>()
  const baked: Array<BufferGeometry> = []
  const model = (id: ModelId): ModelSource => {
    const source = models.get(id)
    if (source === undefined) throw new Error(`Model ${id} was not loaded (is it in looks.ts?)`)
    return source
  }
  return {
    model,
    animated(id) {
      const known = animated.get(id)
      if (known !== undefined) return known
      const atlas = bakeAnimation(model(id))
      const entry = { atlas, batch: new Batch(parent, atlas.geometry, atlas.material, { animated: true }) }
      animated.set(id, entry)
      return entry
    },
    piece(id, tint) {
      const key = tint === undefined ? id : `${id}:${tint}`
      const known = pieces.get(key)
      if (known !== undefined) return known
      // One mesh and one material, so every copy can share a batch: its geometry, placed as the model places it.
      const source = model(id)
      const meshes: Array<Mesh> = []
      source.scene.updateMatrixWorld(true)
      source.scene.traverse((part) => {
        if (part instanceof Mesh) meshes.push(part)
      })
      const [mesh] = meshes
      if (mesh === undefined || meshes.length > 1 || Array.isArray(mesh.material)) throw new Error(`Model ${id} must be one mesh with one material to be batched`)
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
      baked.push(geometry)
      // A tint multiplies the model's own colors (its own material, so the untinted copies keep theirs).
      let material = mesh.material as Material
      if (tint !== undefined) {
        material = material.clone()
        ;(material as Material & { color: Color }).color.multiply(new Color(tint))
        tinted.push(material)
      }
      const batch = new Batch(parent, geometry, material)
      pieces.set(key, batch)
      return batch
    },
    shadows: fixed[0],
    projectileShadows: fixed[1],
    orbs: fixed[2],
    pucks: fixed[3],
    flares: fixed[4],
    sparks: fixed[5],
    bodyGeometry,
    bodies(radius, height) {
      const key = `${radius.toFixed(2)}:${height.toFixed(2)}`
      const known = bodies.get(key)
      if (known !== undefined) return known
      const batch = new Batch(parent, bodyGeometry(radius, height), flesh)
      bodies.set(key, batch)
      return batch
    },
    flush() {
      for (const batch of fixed) batch.flush()
      for (const batch of bodies.values()) batch.flush()
      for (const batch of pieces.values()) batch.flush()
      for (const { batch } of animated.values()) batch.flush()
    },
    dispose() {
      for (const batch of [...fixed, ...bodies.values(), ...pieces.values()]) batch.dispose()
      for (const geometry of baked) geometry.dispose()
      for (const material of tinted) material.dispose()
      for (const geometry of geometries.values()) geometry.dispose()
      for (const resource of [disc, orb, round, puck, spark, shadow, projectileShadow, glow, flare, flesh]) resource.dispose()
      for (const { batch, atlas } of animated.values()) { batch.dispose(); atlas.dispose() }
    }
  }
}
