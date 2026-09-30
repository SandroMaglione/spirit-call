import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { screenDirectionToWorld } from "../src/math/iso.ts"
import { normalizeOr } from "../src/math/vec.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Controls, Energy, Game, Lobbed, Player, Position, Projectile, Velocity } from "../src/schema.ts"
import { grenadier, gunner, start, swordsman, swordsmanWith } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
/** A screen direction (y down) as the unit world direction the game uses. */
const world = (screen: Vec2): Vec2 => normalizeOr(screenDirectionToWorld(projection, screen), { x: 0, y: 0 })


const World = Game.Inspector("Test/Touch", {
  queries: {
    projectiles: Game.Query({ selection: { velocity: Game.Query.read(Velocity) }, with: [Projectile] }),
    grenades: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }),
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] })
  },
  resources: { controls: Game.System.readResource(Controls) }
}, ({ queries, resources }) => ({
  projectiles: queries.projectiles.each().map(({ data }) => ({ velocity: data.velocity.get() })),
  grenades: queries.grenades.each().map(({ data }) => data.lobbed.get()),
  position: queries.player.each()[0]!.data.position.get(),
  device: resources.controls.get().device
}))

const Charge = Game.System("Test/ChargeUltimate", {
  queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) }
}, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

describe("touch controls", () => {
  it("moves with the stick, at a speed that follows the tilt, and switches to touch", () => {
    const run = start({ touch: [{ frame: 0, stick: { x: 0.5, y: 0 } }] })
    run.step(30)
    const { velocity } = run.player()
    const right = world({ x: 1, y: 0 })
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(swordsman.speed * 0.5, 6)
    expect(velocity.x / Math.hypot(velocity.x, velocity.y)).toBeCloseTo(right.x, 6)
    expect(run.runtime.inspect(World).device).toBe("touch")
  })

  it("with the gun, each ATTACK tap fires along the facing", () => {
    // Assist off: the training dummies near the spawn would otherwise draw the aim.
    const run = start({ tuning: tuningWith({ touch: { assist: { enabled: false } } }), build: gunner, touch: [{ frame: 0, press: ["attack"], release: ["attack"] }] })
    run.step(8)
    const shots = run.runtime.inspect(World).projectiles
    expect(shots).toHaveLength(1)
    const velocity = shots[0]!.velocity
    expect(velocity.y).toBeCloseTo(0, 6)
    expect(velocity.x).toBeGreaterThan(0)
  })

  it("faces where the stick moves, and keeps the facing when standing still", () => {
    const run = start({ touch: [{ frame: 0, stick: { x: -1, y: 0 } }, { frame: 10, stick: null }] })
    const left = world({ x: -1, y: 0 })
    run.step(10)
    expect(run.player().aim.x).toBeCloseTo(left.x, 6)
    expect(run.player().aim.y).toBeCloseTo(left.y, 6)
    run.step(20)
    expect(run.player().aim.x).toBeCloseTo(left.x, 6)
    expect(run.player().aim.y).toBeCloseTo(left.y, 6)
  })

  it("aims a dragged Blade Wave along the drag", () => {
    const dragged = start({ touch: [{ frame: 0, press: ["special"], aim: { special: { x: 0, y: -1 } } }, { frame: 2, release: ["special"] }] })
    dragged.step(3)
    const up = world({ x: 0, y: -1 })
    expect(dragged.player().aim.x).toBeCloseTo(up.x, 6)
    expect(dragged.player().aim.y).toBeCloseTo(up.y, 6)
  })

  it("throws the grenade on release: to the dragged spot, or ahead for a tap; a cancelled drag throws nothing", () => {
    const spec = defaultTuning.skills.grenade.effect
    const dragged = start({ build: grenadier, touch: [{ frame: 0, press: ["special"], aim: { special: { x: 0, y: -0.5 } } }, { frame: 3, release: ["special"] }] })
    dragged.step(3)
    expect(dragged.runtime.inspect(World).grenades).toEqual([])
    dragged.step(1)
    const [thrown] = dragged.runtime.inspect(World).grenades
    const up = world({ x: 0, y: -1 })
    expect(thrown!.to.x).toBeCloseTo(center.x + up.x * spec.maxRange * 0.5, 6)
    expect(thrown!.to.y).toBeCloseTo(center.y + up.y * spec.maxRange * 0.5, 6)

    // Assist off: the training dummies near the spawn would otherwise draw a tapped throw.
    const tapped = start({ tuning: tuningWith({ touch: { assist: { enabled: false } } }), build: grenadier, touch: [{ frame: 0, press: ["special"], release: ["special"] }] })
    tapped.step(1)
    const [tap] = tapped.runtime.inspect(World).grenades
    expect(Math.hypot(tap!.to.x - center.x, tap!.to.y - center.y)).toBeCloseTo(spec.maxRange * defaultTuning.touch.tapThrowRange, 6)

    const cancelled = start({ build: grenadier, touch: [{ frame: 0, press: ["special"], aim: { special: { x: 1, y: 0 } } }, { frame: 3, cancel: ["special"] }] })
    cancelled.step(6)
    expect(cancelled.runtime.inspect(World).grenades).toEqual([])
  })

  it("dashes with the dash button toward the stick, and casts the ultimate with its button", () => {
    const run = start({ touch: [{ frame: 0, stick: { x: 1, y: 0 }, press: ["dash"], release: ["dash"] }] })
    run.step(1)
    const { dash } = run.player()
    const right = world({ x: 1, y: 0 })
    expect(dash.remaining).toBeGreaterThan(0)
    expect(dash.direction.x).toBeCloseTo(right.x, 6)
    expect(dash.direction.y).toBeCloseTo(right.y, 6)

    const nova = start({ touch: [{ frame: 1, press: ["ultimate"], release: ["ultimate"] }] })
    nova.runtime.tick(Game.Schedule(Charge))
    nova.step(2)
    expect(nova.player().invulnerable).toBeCloseTo(defaultTuning.skills.nova.effect.invulnerability, 6)
  })

  it("uses each button's skill by its kind: a Nova on the special button goes off on touch, a grenade on the ultimate button on release", () => {
    const nova = start({ build: swordsmanWith({ special: "nova" }), touch: [{ frame: 1, press: ["special"] }] })
    nova.runtime.tick(Game.Schedule(Charge))
    nova.step(2)
    expect(nova.player().invulnerable).toBeCloseTo(defaultTuning.skills.nova.effect.invulnerability, 6)

    const spec = defaultTuning.skills.grenade.effect
    const thrown = start({ tuning: tuningWith({ touch: { assist: { enabled: false } } }), build: swordsmanWith({ ultimate: "grenade" }), touch: [{ frame: 0, press: ["ultimate"] }, { frame: 2, release: ["ultimate"] }] })
    thrown.step(2)
    expect(thrown.runtime.inspect(World).grenades).toEqual([])
    thrown.step(1)
    const [grenade] = thrown.runtime.inspect(World).grenades
    expect(Math.hypot(grenade!.to.x - center.x, grenade!.to.y - center.y)).toBeCloseTo(spec.maxRange * defaultTuning.touch.tapThrowRange, 6)
  })

  it("switches back to keyboard and mouse as soon as they are used", () => {
    const run = start({ touch: [{ frame: 0, stick: { x: 1, y: 0 } }, { frame: 5, stick: null }], keys: [{ frame: 10, press: ["up"] }] })
    run.step(6)
    expect(run.runtime.inspect(World).device).toBe("touch")
    run.step(6)
    expect(run.runtime.inspect(World).device).toBe("desktop")
  })

  it("keeps the aim still when there is no player (game over)", () => {
    const run = start({ touch: [{ frame: 0, stick: { x: 1, y: 0 }, press: ["attack"] }] })
    run.step(2)
    const Remove = Game.System("Test/RemovePlayer", { queries: { player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }) } }, ({ queries, commands }) => {
      for (const { entity } of queries.player.each()) commands.despawn(entity.id)
    })
    run.runtime.tick(Game.Schedule(Remove, Game.Schedule.applyDeferred()))
    const AimPoint = Game.Inspector("Test/AimPoint", { resources: { controls: Game.System.readResource(Controls) } }, ({ resources }) => resources.controls.get())
    const before = run.runtime.inspect(AimPoint).aimPoint
    run.step(30)
    const after = run.runtime.inspect(AimPoint)
    expect(after.aimPoint).toEqual(before)
    expect(after.attackHeld).toBe(false)
  })
})
