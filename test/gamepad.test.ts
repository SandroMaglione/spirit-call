import { describe, expect, it } from "vitest"
import { normalizeOr, type Vec2 } from "@typeonce/ritmo-math/Vec2"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { screenDirectionToWorld } from "../src/math/iso.ts"
import { Controls, Energy, Game, Lobbed, Member, Paused, Player, Projectile, Velocity } from "../src/schema.ts"
import { center, expectOk, grenadeSkill, gunner, start, swordsman, tidecaller, withWindCut } from "./helpers.ts"

/** A screen direction (y down) as the unit world direction the game uses. */
const world = (screen: Vec2): Vec2 => normalizeOr(screenDirectionToWorld(projection, screen), { x: 0, y: 0 })

const World = Game.Inspector("Test/Gamepad", {
  queries: {
    projectiles: Game.Query({ selection: { velocity: Game.Query.read(Velocity) }, with: [Projectile] }),
    grenades: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }),
    field: Game.Query({ selection: { member: Game.Query.read(Member) }, with: [Player] })
  },
  resources: { controls: Game.System.readResource(Controls), paused: Game.System.readResource(Paused) }
}, ({ queries, resources }) => ({
  projectiles: queries.projectiles.each().length,
  grenades: queries.grenades.each().map(({ data }) => data.lobbed.get()),
  slot: queries.field.each()[0]?.data.member.get().slot ?? null,
  controls: resources.controls.get(),
  paused: resources.paused.get().paused
}))

const Charge = Game.System("Test/ChargeUltimatePad", {
  queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) }
}, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

/** No aim assist: the training dummies near the spawn would otherwise draw the aim. */
const unassisted = tuningWith({ touch: { assist: { enabled: false } } })

describe("gamepad", () => {
  it("moves with the left stick, at a speed that follows the tilt, and switches to the gamepad", () => {
    const run = start({ pad: [{ frame: 0, left: { x: 0.5, y: 0 } }] })
    run.step(30)
    const { velocity } = run.player()
    const right = world({ x: 1, y: 0 })
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(swordsman.speed * 0.5, 6)
    expect(velocity.x / Math.hypot(velocity.x, velocity.y)).toBeCloseTo(right.x, 6)
    expect(run.runtime.inspect(World).controls.device).toBe("gamepad")
  })

  it("attacks with west and dashes with south, toward the stick", () => {
    const shot = start({ tuning: unassisted, build: gunner, pad: [{ frame: 0, press: ["west"], release: ["west"] }] })
    shot.step(8)
    expect(shot.runtime.inspect(World).projectiles).toBe(1)

    const run = start({ pad: [{ frame: 0, left: { x: 1, y: 0 }, press: ["south"], release: ["south"] }] })
    run.step(1)
    const { dash } = run.player()
    const right = world({ x: 1, y: 0 })
    expect(dash.remaining).toBeGreaterThan(0)
    expect(dash.direction.x).toBeCloseTo(right.x, 6)
  })

  it("aims a held skill with the right stick and uses it on release", () => {
    const run = start({ tuning: withWindCut(), pad: [{ frame: 0, press: ["rightBumper"], right: { x: 0, y: -1 } }, { frame: 2, release: ["rightBumper"] }] })
    run.step(2)
    const up = world({ x: 0, y: -1 })
    const aiming = run.runtime.inspect(World).controls.skills.special.aiming
    expect(aiming).not.toBeNull()
    run.step(1)
    expect(run.player().aim.x).toBeCloseTo(up.x, 6)
    expect(run.player().aim.y).toBeCloseTo(up.y, 6)
  })

  it("keeps the aim when the stick is let go just before the button", () => {
    const spec = grenadeSkill.effect
    const run = start({ build: gunner, pad: [
      { frame: 0, press: ["rightBumper"], right: { x: 0, y: -0.5 } },
      { frame: 2, right: { x: 0, y: 0 } },
      { frame: 3, release: ["rightBumper"] }
    ] })
    run.step(4)
    const [thrown] = run.runtime.inspect(World).grenades
    const up = world({ x: 0, y: -1 })
    expect(thrown!.to.x).toBeCloseTo(center.x + up.x * spec.maxRange * 0.5, 6)
    expect(thrown!.to.y).toBeCloseTo(center.y + up.y * spec.maxRange * 0.5, 6)
  })

  it("uses a skill released untilted where a tap would", () => {
    const spec = grenadeSkill.effect
    const run = start({ tuning: unassisted, build: gunner, pad: [{ frame: 0, press: ["rightBumper"], release: ["rightBumper"] }] })
    run.step(1)
    const [tap] = run.runtime.inspect(World).grenades
    expect(Math.hypot(tap!.to.x - center.x, tap!.to.y - center.y)).toBeCloseTo(spec.maxRange * defaultTuning.touch.tapThrowRange, 6)
  })

  it("casts the ultimate with the right trigger", () => {
    const tide = start({ build: tidecaller, pad: [{ frame: 1, press: ["rightTrigger"], release: ["rightTrigger"] }] })
    expectOk(tide.runtime.tick(Game.Schedule(Charge)))
    tide.step(2)
    expect(tide.player().invulnerable).toBeCloseTo(defaultTuning.skills.tide.invulnerability, 6)
  })

  it("switches the team with the d-pad", () => {
    const run = start({ team: [{ character: "swordsman" }, gunner], pad: [{ frame: 0, press: ["dpadUp"], release: ["dpadUp"] }] })
    expect(run.runtime.inspect(World).slot).toBe(0)
    run.step(30)
    expect(run.runtime.inspect(World).slot).toBe(1)
  })

  it("pauses with Start, and resumes with it", () => {
    const run = start({ pad: [{ frame: 0, press: ["start"], release: ["start"] }, { frame: 3, press: ["start"], release: ["start"] }] })
    run.step(1)
    expect(run.runtime.inspect(World).paused).toBe(true)
    run.step(3)
    expect(run.runtime.inspect(World).paused).toBe(false)
  })

  it("switches back to keyboard and mouse as soon as they are used", () => {
    const run = start({ pad: [{ frame: 0, left: { x: 1, y: 0 } }, { frame: 5, left: { x: 0, y: 0 } }], keys: [{ frame: 10, press: ["up"] }] })
    run.step(6)
    expect(run.runtime.inspect(World).controls.device).toBe("gamepad")
    run.step(6)
    expect(run.runtime.inspect(World).controls.device).toBe("desktop")
  })
})
