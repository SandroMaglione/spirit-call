/**
 * What many nodes share, made once: batches (enemy capsules by size,
 * projectiles, shadows), capsule geometry, and the loaded models.
 */
import { CapsuleGeometry, CircleGeometry, CylinderGeometry, IcosahedronGeometry, MeshBasicMaterial, MeshLambertMaterial } from "three"
import type { BufferGeometry, Group } from "three"

import { view } from "../config/view.ts"
import { Batch } from "./batch.ts"
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
  const shadow = new MeshBasicMaterial({ color: view.shadow, transparent: true, opacity: 0.35, depthWrite: false })
  const projectileShadow = new MeshBasicMaterial({ color: view.shadow, transparent: true, opacity: 0.3, depthWrite: false })
  // Unlit: projectiles glow in their color whichever way they face.
  const glow = new MeshBasicMaterial()
  // Instances bring their own colors; flat shading keeps the low-poly facets.
  const flesh = new MeshLambertMaterial({ flatShading: true })
  const fixed = [
    new Batch(parent, disc, shadow, { order: floorLayers.shadows.order }),
    new Batch(parent, disc, projectileShadow, { order: floorLayers.shadows.order }),
    new Batch(parent, orb, glow),
    new Batch(parent, puck, glow)
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
  return {
    model(id) {
      const source = models.get(id)
      if (source === undefined) throw new Error(`Model ${id} was not loaded (is it in looks.ts?)`)
      return source
    },
    shadows: fixed[0],
    projectileShadows: fixed[1],
    orbs: fixed[2],
    pucks: fixed[3],
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
    },
    dispose() {
      for (const batch of [...fixed, ...bodies.values()]) batch.dispose()
      for (const geometry of geometries.values()) geometry.dispose()
      for (const resource of [disc, orb, puck, shadow, projectileShadow, glow, flesh]) resource.dispose()
    }
  }
}
