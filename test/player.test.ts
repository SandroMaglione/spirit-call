import { describe, expect, it } from "vitest"
import { distance, normalizeOr } from "@typeonce/bevy-ts-math/Vec2"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { screenDirectionToWorld } from "../src/math/iso.ts"
import { Facing, Game, Player } from "../src/schema.ts"
import { doubleTap, start } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }

describe("movement", () => {
  it("moves screen-relative: holding up moves toward world north-west", () => {
    const run = start({ keys: [{ frame: 0, press: ["up"] }] })
    run.step(60)
    const { position, velocity } = run.player()
    expect(position.x).toBeLessThan(center.x)
    expect(position.x - center.x).toBeCloseTo(position.y - center.y, 6)
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(defaultTuning.characters.swordsman.stats.speed, 6)
  })

  it("accelerates to full speed quickly and stops quickly", () => {
    const run = start({ keys: [{ frame: 0, press: ["right"] }, { frame: 30, release: ["right"] }] })
    run.step(10)
    expect(Math.hypot(run.player().velocity.x, run.player().velocity.y)).toBeCloseTo(defaultTuning.characters.swordsman.stats.speed, 6)
    run.step(30)
    expect(run.player().velocity).toEqual({ x: 0, y: 0 })
  })

  it("never leaves the arena, even running into a wall for a long time", () => {
    const run = start({ keys: [{ frame: 0, press: ["down", "right"] }] })
    run.step(60 * 10)
    const { position } = run.player()
    const r = defaultTuning.characters.swordsman.radius
    expect(position.x).toBeLessThanOrEqual(defaultTuning.arena.width - r)
    expect(position.y).toBeLessThanOrEqual(defaultTuning.arena.height - r)
    expect(position.x).toBeGreaterThanOrEqual(r)
    expect(position.y).toBeGreaterThanOrEqual(r)
  })
})

describe("dash", () => {
  it("covers exactly the dash distance, toward the cursor when standing still", () => {
    const run = start({ keys: doubleTap("right", 0) })
    const dashSteps = Math.ceil(defaultTuning.dash.duration / engine.stepSeconds)
    run.step(2 + dashSteps)
    const { position, aim } = run.player()
    // The cursor is to the right of the screen center, i.e. world south-east.
    expect(aim.x).toBeGreaterThan(0)
    expect(distance(position, center)).toBeCloseTo(defaultTuning.dash.distance, 6)
  })

  it("dashes in the movement direction when moving", () => {
    const run = start({ keys: doubleTap("left", 0, { hold: true }) })
    run.step(3)
    const { dash } = run.player()
    // Screen left is world (-1, +1).
    expect(dash.remaining).toBeGreaterThan(0)
    expect(dash.direction.x).toBeCloseTo(-Math.SQRT1_2, 6)
    expect(dash.direction.y).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it("dashes diagonally when double-tapping one key while holding another", () => {
    const run = start({ keys: [{ frame: 0, press: ["up"] }, ...doubleTap("right", 10, { hold: true })] })
    run.step(13)
    const { dash } = run.player()
    const upRight = normalizeOr(screenDirectionToWorld(projection, { x: 1, y: -1 }), { x: 0, y: 0 })
    expect(dash.remaining).toBeGreaterThan(0)
    expect(dash.direction.x).toBeCloseTo(upRight.x, 6)
    expect(dash.direction.y).toBeCloseTo(upRight.y, 6)
  })

  it("needs two presses of the same key within the double-tap window", () => {
    const slow = Math.ceil(defaultTuning.dash.doubleTapWindow / engine.stepSeconds) + 2
    const single = start({ keys: [{ frame: 0, press: ["right"] }, { frame: 1, release: ["right"] }] })
    single.step(20)
    expect(single.player().dash.cooldown).toBe(0)
    const tooSlow = start({ keys: [{ frame: 0, press: ["right"], release: ["right"] }, { frame: slow, press: ["right"], release: ["right"] }] })
    tooSlow.step(slow + 5)
    expect(tooSlow.player().dash.cooldown).toBe(0)
    const differentKeys = start({ keys: [{ frame: 0, press: ["right"], release: ["right"] }, { frame: 2, press: ["up"], release: ["up"] }] })
    differentKeys.step(10)
    expect(differentKeys.player().dash.cooldown).toBe(0)
  })

  it("grants invulnerability for the configured window", () => {
    const run = start({ keys: doubleTap("right", 0) })
    run.step(3)
    expect(run.player().invulnerable).toBeCloseTo(defaultTuning.dash.invulnerability, 6)
    const steps = Math.ceil(defaultTuning.dash.invulnerability / engine.stepSeconds)
    run.step(steps)
    expect(run.player().invulnerable).toBe(0)
  })

  it("respects the cooldown and buffers an early press", () => {
    // One charge, so the second dash waits for it to come back.
    const tuning = tuningWith({ dash: { charges: 1 } })
    const cooldownSteps = Math.round(defaultTuning.dash.cooldown / engine.stepSeconds)
    const early = cooldownSteps - 3 // within the input buffer
    // The first dash starts on step 3; the second double tap completes `early` steps later.
    const run = start({ tuning, keys: [...doubleTap("right", 0), ...doubleTap("right", early)] })
    run.step(early + 3)
    expect(run.player().dash.remaining).toBe(0)
    run.step(4)
    expect(run.player().dash.remaining).toBeGreaterThan(0)
  })

  it("has two charges: a second dash right after the first, then a wait for one to come back", () => {
    const between = Math.ceil(defaultTuning.dash.duration / engine.stepSeconds) + 2
    const run = start({ keys: [...doubleTap("right", 0), ...doubleTap("left", between), ...doubleTap("right", between * 2)] })
    run.step(3)
    expect(run.player().dash.charges).toBe(defaultTuning.dash.charges - 1)
    run.step(between)
    // The second dash went at once: both charges are spent.
    expect(run.player().dash.charges).toBe(0)
    expect(run.player().dash.remaining).toBeGreaterThan(0)
    run.step(between)
    // A third has to wait for a charge.
    expect(run.player().dash.remaining).toBe(0)
    run.step(Math.ceil(defaultTuning.dash.cooldown / engine.stepSeconds))
    expect(run.player().dash.charges).toBeGreaterThanOrEqual(1)
  })

  it("cannot tunnel through a pillar, even with an extreme dash", () => {
    const tuning = tuningWith({
      dash: { distance: 3000, duration: 0.05 },
      // An explicit obstacle keeps this sweep test independent of the shipped court's art layout.
      arenas: { courtyard: { pillars: [{ x: 0.5, y: 0.16, size: 50 }], props: [] } }
    })
    // Face world north (straight at the pillar at (0.5, 0.16)) and dash standing still: a dash from standing goes the way she faces.
    const run = start({ tuning, keys: doubleTap("right", 1) })
    const FaceNorth = Game.System("Test/FaceNorth", { queries: { player: Game.Query({ selection: { facing: Game.Query.write(Facing) }, with: [Player] }) } }, ({ queries }) => {
      for (const { data } of queries.player.each()) data.facing.set({ direction: { x: 0, y: -1 }, hold: 10 })
    })
    run.runtime.tick(Game.Schedule(FaceNorth))
    run.step(12)
    const { position } = run.player()
    const pillarBottom = 0.16 * tuning.arena.height + 25
    expect(position.y).toBeGreaterThanOrEqual(pillarBottom + tuning.characters.swordsman.radius - 0.1)
    expect(position.x).toBeCloseTo(center.x, 3)
  })
})
