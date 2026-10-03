import { AnimationClip, Group, Mesh, MeshStandardMaterial, BoxGeometry, NumberKeyframeTrack } from "three"
import { beforeAll, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

import { Batch, Instance } from "../src/presentation/batch.ts"
import type { ProjectileNode } from "../src/presentation/host-types.ts"
import type { ModelId, ModelSource } from "../src/presentation/models.ts"
import { createNode, disposeNode, instancesOf } from "../src/presentation/nodes.ts"
import { makeAssets } from "../src/presentation/render-assets.ts"
import { arenaLooks, characterLooks, enemyLooks, modelsInLooks } from "../src/presentation/looks.ts"
import { closeLoop, models } from "../src/presentation/models.ts"

const loadedEnemies = new Map<ModelId, ModelSource>()
beforeAll(async () => {
  await Promise.all(Object.values(enemyLooks).map(async (look) => {
    if (look.kind !== "model" || !look.batched) return
    const spec = models[look.model]
    const bytes = readFileSync(path.join(import.meta.dirname, "..", spec.url))
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")
    loadedEnemies.set(look.model, { id: look.model, spec, scene: gltf.scene, clips: new Map(gltf.animations.map((clip) => [clip.name, closeLoop(clip, spec.clips[clip.name as keyof typeof spec.clips]!)])) })
  }))
})

/** A stand-in for a loaded body: a box with a grip, whose clips scale it, in place of the GLB (no renderer in tests). */
const fakeBody = (id: ModelId): ModelSource => {
  const scene = new Group()
  const part = new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial({ color: 0x808080 }))
  part.name = "part"
  const grip = new Group()
  grip.name = "weapon_grip"
  part.add(grip)
  scene.add(part)
  const clip = (name: string, seconds: number) => new AnimationClip(name, seconds, [new NumberKeyframeTrack("part.scale[y]", [0, seconds], [1, 2])])
  const clips = new Map(["Idle", "Run", "AttackCombo", "Recover1", "Recover2", "Recover3"].map((name) => [name, clip(name, name === "AttackCombo" ? 2.2 : 0.5)]))
  return { id, spec: { url: "", height: 2, clips: {} }, scene, clips }
}

/** A stand-in for a held weapon: a thin box. */
const fakeWeapon = (id: ModelId): ModelSource => {
  const scene = new Group()
  scene.add(new Mesh(new BoxGeometry(0.05, 1, 0.05), new MeshStandardMaterial()))
  return { id, spec: { url: "", height: null, clips: {} }, scene, clips: new Map() }
}

/** A stand-in for an arena piece: one box mesh with one material, as the courtyard's pieces are. */
const fakePiece = (id: ModelId): ModelSource => {
  const scene = new Group()
  scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()))
  return { id, spec: models[id], scene, clips: new Map() }
}

const setup = () => {
  const parent = new Group()
  const loaded = new Map<ModelId, ModelSource>([...modelsInLooks()].map((id) => [id, fakePiece(id)]))
  loaded.set("crow", fakeBody("crow"))
  loaded.set("trainingBlade", fakeWeapon("trainingBlade"))
  loaded.set("crescendo", fakeWeapon("crescendo"))
  for (const [id, source] of loadedEnemies) loaded.set(id, source)
  const assets = makeAssets(parent, loaded)
  return { parent, assets, pool: [] as Array<ProjectileNode> }
}

describe("batches", () => {
  it("preserves independent animation frames when an animated batch grows and compacts", () => {
    const parent = new Group()
    const geometry = new BoxGeometry()
    const batch = new Batch(parent, geometry, new MeshStandardMaterial(), { animated: true })
    const members = Array.from({ length: 100 }, (_, index) => {
      const instance = new Instance(batch)
      instance.pose.splice(0, 4, index, index + 1, .25, -.5)
      batch.add(instance)
      return instance
    })
    batch.remove(members[10]!)
    batch.flush()
    const poses = geometry.getAttribute("instancePose")
    expect(poses.count).toBe(128)
    expect([poses.getX(10), poses.getY(10), poses.getZ(10), poses.getW(10)]).toEqual([99, 100, .25, -.5])
    expect([poses.getX(11), poses.getY(11), poses.getZ(11), poses.getW(11)]).toEqual([11, 12, .25, -.5])
    expect(parent.children).toHaveLength(1)
  })
  it("keep their members packed when one leaves, and grow past their first size", () => {
    const parent = new Group()
    const batch = new Batch(parent, new BoxGeometry(), new MeshStandardMaterial())
    const members = Array.from({ length: 100 }, () => new Instance(batch))
    for (const member of members) batch.add(member)
    expect(batch.size).toBe(100)
    batch.remove(members[10]!)
    expect(members[10]!.index).toBe(-1)
    expect(members[99]!.index).toBe(10)
    batch.remove(members[10]!)
    expect(batch.size).toBe(99)
    batch.flush()
    expect(parent.children).toHaveLength(1)
  })
})

describe("render nodes", () => {
  it("give characters the body their look says, standing on a pivot", () => {
    const { assets, pool } = setup()
    const node = createNode({ kind: "player", character: "swordsman", weapon: "trainingBlade", radius: 16 }, assets, pool)
    if (node.kind !== "player") throw new Error("expected a player")
    expect(characterLooks.swordsman.kind).toBe("model")
    expect(node.body.moments).not.toBeNull()
    expect(node.pivot.children).toContain(node.body.object)
    expect(node.body.height).toBeGreaterThan(16)
    // Faces +Z for "down" the floor's y.
    node.body.face({ x: 1, y: 0 })
    expect(node.body.object.rotation.y).toBeCloseTo(Math.PI / 2, 9)
    // The sword is in her grip, and a combo move plays into its recovery.
    expect(node.body.object.getObjectByName("weapon_grip")!.children).toHaveLength(1)
    node.body.play({ clip: "AttackCombo", from: 0.1, to: 0.5, contact: 0.3, next: "Recover1" }, 0.3, 0.04)
    for (let frame = 0; frame < 30; frame++) node.body.animate({ x: frame, y: 0 }, { x: 1, y: 0 }, 1 / 60, false)
    node.body.paint(0xffffff, 0xffffff, 1, 0.5)
    expect(instancesOf(node)).toEqual([node.shadow])
    disposeNode(node)
  })

  it("batch animated enemies and their shadows", () => {
    const { assets, pool } = setup()
    const node = createNode({ kind: "enemy", enemy: "chaser", radius: 14 }, assets, pool)
    if (node.kind !== "enemy") throw new Error("expected an enemy")
    expect(instancesOf(node)).toHaveLength(2)
    expect(node.body.moments).not.toBeNull()
    const other = createNode({ kind: "enemy", enemy: "chaser", radius: 14 }, assets, pool)
    if (other.kind !== "enemy") throw new Error("expected an enemy")
    expect(other.body.instances[0]!.batch).toBe(node.body.instances[0]!.batch)
    node.body.sample?.("Windup", .5)
    other.body.sample?.("Recovery", .2)
    expect(node.body.instances[0]!.pose).not.toEqual(other.body.instances[0]!.pose)
    node.body.paint(0xffffff, 0xffffff, 1, 1)
    expect(node.body.instances[0]!.color.getHex()).toBe(0xffffff)
  })

  it("reuse pooled projectiles across styles", () => {
    const { assets, pool } = setup()
    const bolt = createNode({ kind: "projectile", faction: "enemy", style: "bolt", element: null, radius: 5 }, assets, pool)
    if (bolt.kind !== "projectile") throw new Error("expected a projectile")
    expect(bolt.orb.batch).toBe(assets.orbs)
    pool.push(bolt)
    const disc = createNode({ kind: "projectile", faction: "player", style: "disc", element: null, radius: 13 }, assets, pool)
    expect(disc).toBe(bolt)
    expect(bolt.orb.batch).toBe(assets.pucks)
  })

  it("stand a pillar on a pillar's box, fitted to it, and fade it", () => {
    const { assets, pool } = setup()
    const node = createNode({ kind: "wall", placement: "sorted", arena: "courtyard", box: { minX: 100, minY: 100, maxX: 170, maxY: 170 } }, assets, pool)
    if (node.kind !== "wall") throw new Error("expected a wall")
    expect(arenaLooks.courtyard.walls.sorted.kind).toBe("pillar")
    expect(node.instances).toHaveLength(0)
    expect(node.root.children[0]!.scale.x).toBeCloseTo(70, 6)
    expect(node.bounds.width).toBeGreaterThan(0)
    expect(node.bounds.height).toBeGreaterThan(0)
    node.fade(0.35)
    node.fade(1)
    disposeNode(node)
  })

  it("build an edge wall from segments filling its length", () => {
    const { assets, pool } = setup()
    const node = createNode({ kind: "wall", placement: "back", arena: "courtyard", box: { minX: -48, minY: -48, maxX: 1848, maxY: 0 } }, assets, pool)
    if (node.kind !== "wall") throw new Error("expected a wall")
    // 1896 units at 140 per 2 m segment: 14 segments, each stretched a little.
    expect(node.instances).toHaveLength(14)
    const length = node.instances.reduce((sum, piece) => sum + piece.object.scale.x * 2, 0)
    expect(length).toBeCloseTo(1896, 6)
  })

  it("dress every arena's low walls and pillars from its own kit", () => {
    const { assets, pool } = setup()
    for (const arena of ["courtyard", "cistern", "kilnworks", "sanctuary"] as const) {
      const wall = createNode({ kind: "wall", placement: "inner", arena, box: { minX: 100, minY: 100, maxX: 400, maxY: 136 } }, assets, pool)
      if (wall.kind !== "wall") throw new Error("expected a wall")
      expect(wall.instances.length).toBeGreaterThan(0)
      disposeNode(wall)
      const pillar = createNode({ kind: "wall", placement: "sorted", arena, box: { minX: 100, minY: 100, maxX: 150, maxY: 150 } }, assets, pool)
      disposeNode(pillar)
    }
  })
})
