import { BufferGeometry, Group, MeshLambertMaterial } from "three"
import { describe, expect, it } from "vitest"
import { Batch } from "../src/presentation/batch.ts"
import { instancedBody, type BodyAssets } from "../src/presentation/instanced-body.ts"
import type { BodyLook } from "../src/presentation/looks.ts"

const body = (transitionSeconds?: number, timeBased = false) => {
  const batch = new Batch(new Group(), new BufferGeometry(), new MeshLambertMaterial(), { animated: true })
  const clips = new Map([
    ["Idle", { offset: 0, frames: 61, seconds: 2, loop: true }],
    ["Run", { offset: 61, frames: 61, seconds: 2, loop: true }],
    ["Windup", { offset: 122, frames: 31, seconds: 1, loop: false }],
    ["Active", { offset: 153, frames: 13, seconds: .4, loop: false }],
    ["Recovery", { offset: 166, frames: 22, seconds: .7, loop: false }]
  ])
  const assets: BodyAssets = { animated: () => ({ batch, atlas: { clips } }), model: () => ({ spec: { height: 1 } }) }
  const look: Extract<BodyLook, { kind: "model" }> = {
    kind: "model", model: "enemyGaleCaster", widthFactor: 1, heightFactor: 1,
    ...(transitionSeconds === undefined ? {} : { transitionSeconds }),
    moments: { idle: "Idle", run: { clip: "Run", distance: 90, timeBased } }
  }
  return instancedBody(assets, look, 1, 1)
}

describe("batched animation transitions", () => {
  it("preserves the outgoing pose at a loop boundary and eases into the incoming pose", () => {
    const actor = body(.18)
    actor.animate({ x: 0, y: 0 }, { x: 1, y: 0 }, .1, false)
    actor.finishAnimation!(.1)
    const before = actor.instances[0]!.pose.slice(0, 3)
    actor.animate({ x: 10, y: 0 }, { x: 1, y: 0 }, .1, false)
    actor.finishAnimation!(.1)
    expect(actor.instances[0]!.blendPose.slice(0, 3)).toEqual(before)
    expect(actor.instances[0]!.blendPose[3]).toBe(0)
    actor.animate({ x: 20, y: 0 }, { x: 1, y: 0 }, .04, false)
    actor.finishAnimation!(.04)
    expect(actor.instances[0]!.blendPose[3]).toBeGreaterThan(0)
    expect(actor.instances[0]!.blendPose[3]).toBeLessThan(1)
    const held = actor.instances[0]!.blendPose.slice()
    actor.animate({ x: 20, y: 0 }, { x: 1, y: 0 }, 0, true)
    actor.finishAnimation!(0)
    expect(actor.instances[0]!.blendPose).toEqual(held)
    actor.animate({ x: 30, y: 0 }, { x: 1, y: 0 }, .1, false)
    actor.finishAnimation!(.1)
    actor.finishAnimation!(.1)
    expect(actor.instances[0]!.blendPose[3]).toBe(1)
  })

  it("keeps hit and recovery contacts exact, including skipping an active phase", () => {
    const actor = body(.18)
    actor.animate({ x: 0, y: 0 }, { x: 1, y: 0 }, .1, false)
    actor.finishAnimation!(.1)
    actor.sample!("Windup", .5)
    actor.finishAnimation!(.1)
    actor.sample!("Active", 0)
    actor.finishAnimation!(.1)
    expect(actor.instances[0]!.pose.slice(0, 3)).toEqual([153, 154, 0])
    expect(actor.instances[0]!.blendPose[3]).toBe(1)
    actor.sample!("Windup", 1)
    actor.finishAnimation!(.1)
    actor.sample!("Recovery", 0)
    actor.finishAnimation!(.1)
    expect(actor.instances[0]!.pose.slice(0, 3)).toEqual([166, 167, 0])
    expect(actor.instances[0]!.blendPose[3]).toBe(1)
  })

  it("keeps the floating cycle on the idle clock while reversing direction", () => {
    const actor = body(.18, true)
    actor.animate({ x: 0, y: 0 }, { x: 1, y: 0 }, .1, false)
    actor.animate({ x: 10, y: 0 }, { x: 1, y: 0 }, .1, false)
    const pose = actor.instances[0]!.pose
    const before = pose[0]! - 61 + pose[2]!
    actor.animate({ x: 0, y: 0 }, { x: 1, y: 0 }, .1, false)
    const after = pose[0]! - 61 + pose[2]!
    expect((after - before + 60) % 60).toBeCloseTo(3)
  })

  it("spreads idle phases, keeps flash separate from tint, and locks aimed poses and shields", () => {
    const actor = body(.1)
    const other = body(.1)
    for (const item of [actor, other]) item.animate({ x: 0, y: 0 }, { x: 0, y: 1 }, .01, false)
    expect(actor.instances[0]!.pose).not.toEqual(other.instances[0]!.pose)
    actor.paint(0x554433, 0xffffff, 1, 1)
    expect(actor.instances[0]!.color.getHex()).toBe(0x554433)
    expect(actor.instances[0]!.glow.getHex()).toBe(0xffffff)
    expect(actor.instances[0]!.glowAmount).toBe(1)
    actor.face({ x: 0, y: 1 })
    actor.face({ x: 1, y: 0 })
    actor.animate({ x: 0, y: 0 }, { x: 1, y: 0 }, .01, false)
    expect(actor.object.rotation.y).toBeCloseTo(.14)
    actor.shield!(.2)
    expect(actor.object.rotation.y + actor.instances[0]!.pose[3]!).toBeCloseTo(Math.PI / 2 + .2)
    actor.sample!("Windup", .5)
    expect(actor.object.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(actor.instances[0]!.pose[3]).toBe(.2)
  })

  it("leaves enemies without transition settings on their existing playback path", () => {
    const actor = body()
    expect(actor.finishAnimation).toBeUndefined()
    expect(actor.instances[0]!.blendPose[3]).toBe(1)
  })
})
