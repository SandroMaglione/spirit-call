import { BufferGeometry, Group, MeshLambertMaterial } from "three"
import { describe, expect, it } from "vitest"
import { Batch } from "../src/presentation/batch.ts"
import { instancedBody } from "../src/presentation/instanced-body.ts"
import type { RenderAssets } from "../src/presentation/host-types.ts"
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
  const assets = { animated: () => ({ batch, atlas: { clips } }), model: () => ({ spec: { height: 1 } }) } as unknown as RenderAssets
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
    expect(actor.instances[0]!.pose[0]).toBe(67)
    actor.animate({ x: 0, y: 0 }, { x: 1, y: 0 }, .1, false)
    expect(actor.instances[0]!.pose[0]).toBe(70)
  })

  it("leaves enemies without transition settings on their existing playback path", () => {
    const actor = body()
    expect(actor.finishAnimation).toBeUndefined()
    expect(actor.instances[0]!.blendPose[3]).toBe(1)
  })
})
