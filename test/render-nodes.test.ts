import { AnimationClip, Group, Mesh, MeshStandardMaterial, BoxGeometry, NumberKeyframeTrack } from "three"
import { describe, expect, it } from "vitest"

import { Batch, Instance } from "../src/presentation/batch.ts"
import type { ProjectileNode } from "../src/presentation/host-types.ts"
import type { ModelId, ModelSource } from "../src/presentation/models.ts"
import { createNode, disposeNode, instancesOf } from "../src/presentation/nodes.ts"
import { makeAssets } from "../src/presentation/render-assets.ts"
import { characterLooks } from "../src/presentation/looks.ts"

/** A stand-in for a loaded model: a box whose clips scale it, in place of the GLB (no renderer in tests). */
const fakeModel = (id: ModelId): ModelSource => {
  const scene = new Group()
  const part = new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial({ color: 0x808080 }))
  part.name = "part"
  scene.add(part)
  const clip = (name: string, seconds: number) => new AnimationClip(name, seconds, [new NumberKeyframeTrack("part.scale[y]", [0, seconds], [1, 2])])
  return { id, spec: { url: "", height: 2, clips: {} }, scene, clips: new Map([["Idle", clip("Idle", 2)], ["Run", clip("Run", 0.5)], ["Attack", clip("Attack", 0.6)]]) }
}

const setup = () => {
  const parent = new Group()
  const assets = makeAssets(parent, new Map([["crow", fakeModel("crow")]]))
  return { parent, assets, pool: [] as Array<ProjectileNode> }
}

describe("batches", () => {
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
    const node = createNode({ kind: "player", character: "swordsman", radius: 16 }, assets, pool)
    if (node.kind !== "player") throw new Error("expected a player")
    expect(characterLooks.swordsman.kind).toBe("model")
    expect(node.body.moments).not.toBeNull()
    expect(node.pivot.children).toContain(node.body.object)
    expect(node.body.height).toBeGreaterThan(16)
    // Faces +Z for "down" the floor's y.
    node.body.face({ x: 1, y: 0 })
    expect(node.body.object.rotation.y).toBeCloseTo(Math.PI / 2, 9)
    node.body.play("Attack", 0.3)
    node.body.animate({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.1, false)
    node.body.paint(0xffffff, 0xffffff, 1, 0.5)
    expect(instancesOf(node)).toEqual([node.shadow])
    disposeNode(node)
  })

  it("batch enemy capsules and their shadows", () => {
    const { assets, pool } = setup()
    const node = createNode({ kind: "enemy", enemy: "chaser", radius: 14 }, assets, pool)
    if (node.kind !== "enemy") throw new Error("expected an enemy")
    expect(instancesOf(node)).toHaveLength(2)
    expect(node.body.moments).toBeNull()
    node.body.paint(0xffffff, 0xffffff, 1, 1)
    expect(node.body.instances[0]!.color.getHex()).toBe(0xffffff)
  })

  it("reuse pooled projectiles across styles", () => {
    const { assets, pool } = setup()
    const bolt = createNode({ kind: "projectile", faction: "enemy", style: "bolt", radius: 5 }, assets, pool)
    if (bolt.kind !== "projectile") throw new Error("expected a projectile")
    expect(bolt.orb.batch).toBe(assets.orbs)
    pool.push(bolt)
    const disc = createNode({ kind: "projectile", faction: "player", style: "disc", radius: 13 }, assets, pool)
    expect(disc).toBe(bolt)
    expect(bolt.orb.batch).toBe(assets.pucks)
  })

  it("dress walls and fade them", () => {
    const { assets, pool } = setup()
    const node = createNode({ kind: "wall", placement: "sorted", box: { minX: 100, minY: 100, maxX: 170, maxY: 170 } }, assets, pool)
    if (node.kind !== "wall") throw new Error("expected a wall")
    expect(node.bounds.width).toBeGreaterThan(0)
    expect(node.bounds.height).toBeGreaterThan(0)
    node.fade(0.35)
    node.fade(1)
    disposeNode(node)
  })
})
