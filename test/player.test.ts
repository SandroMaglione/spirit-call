import { describe, expect, it } from "vitest"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { toScreen } from "../src/math/iso.ts"
import { distance } from "../src/math/vec.ts"
import { start } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }

describe("movement", () => {
  it("moves screen-relative: holding up moves toward world north-west", () => {
    const run = start({ keys: [{ frame: 0, press: ["up"] }] })
    run.step(60)
    const { position, velocity } = run.player()
    expect(position.x).toBeLessThan(center.x)
    expect(position.x - center.x).toBeCloseTo(position.y - center.y, 6)
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(defaultTuning.player.moveSpeed, 6)
  })

  it("accelerates to full speed quickly and stops quickly", () => {
    const run = start({ keys: [{ frame: 0, press: ["right"] }, { frame: 30, release: ["right"] }] })
    run.step(10)
    expect(Math.hypot(run.player().velocity.x, run.player().velocity.y)).toBeCloseTo(defaultTuning.player.moveSpeed, 6)
    run.step(30)
    expect(run.player().velocity).toEqual({ x: 0, y: 0 })
  })

  it("never leaves the arena, even running into a wall for a long time", () => {
    const run = start({ keys: [{ frame: 0, press: ["down", "right"] }] })
    run.step(60 * 10)
    const { position } = run.player()
    const r = defaultTuning.player.radius
    expect(position.x).toBeLessThanOrEqual(defaultTuning.arena.width - r)
    expect(position.y).toBeLessThanOrEqual(defaultTuning.arena.height - r)
    expect(position.x).toBeGreaterThanOrEqual(r)
    expect(position.y).toBeGreaterThanOrEqual(r)
  })
})

describe("dash", () => {
  it("covers exactly the dash distance, toward the cursor when standing still", () => {
    const run = start({ keys: [{ frame: 0, press: ["dash"], release: ["dash"] }] })
    const dashSteps = Math.ceil(defaultTuning.dash.duration / engine.stepSeconds)
    run.step(dashSteps)
    const { position, aim } = run.player()
    // The cursor is to the right of the screen center, i.e. world south-east.
    expect(aim.x).toBeGreaterThan(0)
    expect(distance(position, center)).toBeCloseTo(defaultTuning.dash.distance, 6)
  })

  it("dashes in the movement direction when moving", () => {
    const run = start({ keys: [{ frame: 0, press: ["left", "dash"] }] })
    run.step(1)
    const { dash } = run.player()
    // Screen left is world (-1, +1).
    expect(dash.direction.x).toBeCloseTo(-Math.SQRT1_2, 6)
    expect(dash.direction.y).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it("grants invulnerability for the configured window", () => {
    const run = start({ keys: [{ frame: 0, press: ["dash"], release: ["dash"] }] })
    run.step(1)
    expect(run.player().invulnerable).toBeCloseTo(defaultTuning.dash.invulnerability, 6)
    const steps = Math.ceil(defaultTuning.dash.invulnerability / engine.stepSeconds)
    run.step(steps)
    expect(run.player().invulnerable).toBe(0)
  })

  it("respects the cooldown and buffers an early press", () => {
    const cooldownSteps = Math.round(defaultTuning.dash.cooldown / engine.stepSeconds)
    const early = cooldownSteps - 3 // within the input buffer
    const run = start({
      keys: [
        { frame: 0, press: ["dash"], release: ["dash"] },
        { frame: early, press: ["dash"], release: ["dash"] }
      ]
    })
    run.step(early + 1)
    expect(run.player().dash.remaining).toBe(0)
    run.step(4)
    expect(run.player().dash.remaining).toBeGreaterThan(0)
  })

  it("cannot tunnel through a pillar, even with an extreme dash", () => {
    const tuning = tuningWith({ dash: { distance: 3000, duration: 0.05 } })
    // Aim at world north (straight at the pillar at (0.5, 0.16)) and dash standing still.
    const north = toScreen(projection, { x: 0, y: -200 })
    const run = start({
      tuning,
      pointer: [{ frame: 0, move: { x: 640 + north.x, y: 360 + north.y } }],
      keys: [{ frame: 0, press: ["dash"], release: ["dash"] }]
    })
    run.step(10)
    const { position } = run.player()
    const pillarBottom = 0.16 * tuning.arena.height + 25
    expect(position.y).toBeGreaterThanOrEqual(pillarBottom + tuning.player.radius - 0.1)
    expect(position.x).toBeCloseTo(center.x, 3)
  })
})
