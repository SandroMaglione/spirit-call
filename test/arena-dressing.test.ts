import { readFileSync } from "node:fs"
import path from "node:path"
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { expect, it } from "vitest"

import type { ArenaLook } from "../src/presentation/looks.ts"
import { models } from "../src/presentation/models.ts"
import type { ModelId, ModelSource } from "../src/presentation/models.ts"
import { groundOffsetOf } from "../src/presentation/nodes.ts"
import { makeAssets } from "../src/presentation/render-assets.ts"
import { dressArena } from "../src/presentation/scenery.ts"
import { Shapes } from "../src/presentation/shapes.ts"

const craneId = "harborStudyDockCrane"
const loadCrane = async (): Promise<ModelSource> => {
  const spec = models[craneId]
  const bytes = readFileSync(path.join(import.meta.dirname, "..", spec.url))
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")
  return { id: craneId, spec, scene: gltf.scene, clips: new Map() }
}

it("centers an exported crane's off-center boom at every quarter turn", async () => {
  const source = await loadCrane()
  for (const turn of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const model = source.scene.clone(true)
    model.scale.setScalar(70)
    model.rotation.y = turn
    const offset = groundOffsetOf(craneId, turn, 70)
    model.position.set(offset.x, 0, offset.y)
    const center = new Box3().setFromObject(model, true).getCenter(new Vector3())
    expect(center.x).toBeCloseTo(0, 4)
    expect(center.z).toBeCloseTo(0, 4)
  }
})

it("puts exterior scenery on an apron, leaves the hazard open, and removes every instance on disposal", async () => {
  const parent = new Group()
  const crane = await loadCrane()
  const tile: ModelSource = { id: "pavingPlain", spec: models.pavingPlain, clips: new Map(), scene: new Group() }
  tile.scene.add(new Mesh(new BoxGeometry(2, .14, 2).translate(0, -.07, 0), new MeshStandardMaterial()))
  const sources = new Map<ModelId, ModelSource>([[tile.id, tile], [crane.id, crane]])
  const assets = makeAssets(parent, sources)
  const look: ArenaLook = {
    unitsPerMeter: 70,
    floor: { kind: "tiles", color: 0x808080, tiles: ["pavingPlain"], apronTiles: 2 },
    walls: { back: { kind: "box", color: 0 }, front: { kind: "box", color: 0 }, inner: { kind: "box", color: 0 }, sorted: { kind: "box", color: 0 } },
    scenery: [{ model: craneId, at: { x: 500, y: -155 }, turn: 0 }]
  }
  const grid = new Shapes()
  const dressing = dressArena(assets, look, { width: 1800, height: 1800, cells: 13 }, [{ minX: 0, minY: 0, maxX: 138.46, maxY: 138.46 }], grid)
  const tileBatch = assets.piece("pavingPlain")
  const craneBatch = assets.piece(craneId)
  expect(tileBatch.size).toBe(17 * 17 - 1)
  expect(craneBatch.size).toBe(1)
  dressing.object.updateMatrixWorld(true)
  const floor = dressing.object.children[0]!
  const base = new Box3().setFromObject(floor.children[0]!, true)
  const placement = dressing.object.children[1]!.children[0]!
  const bounds = new Box3().setFromObject(crane.scene, true).applyMatrix4(placement.matrixWorld)
  expect(bounds.min.x).toBeGreaterThan(base.min.x)
  expect(bounds.max.x).toBeLessThan(base.max.x)
  expect(bounds.min.z).toBeGreaterThan(base.min.z)
  expect(bounds.max.z).toBeLessThan(0)
  expect(bounds.max.z).toBeLessThan(base.max.z)
  expect(bounds.min.y).toBe(0)
  dressing.dispose()
  expect(tileBatch.size).toBe(0)
  expect(craneBatch.size).toBe(0)
  assets.dispose()
  grid.dispose()
})
