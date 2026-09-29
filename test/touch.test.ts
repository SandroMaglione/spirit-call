import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { screenDirectionToWorld } from "../src/math/iso.ts"
import { normalizeOr } from "../src/math/vec.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Controls, Game, Grenade, Player, Position, Projectile, Ultimate, Velocity } from "../src/schema.ts"
import { start } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
/** A screen direction (y down) as the unit world direction the game uses. */
const world = (screen: Vec2): Vec2 => normalizeOr(screenDirectionToWorld(projection, screen), { x: 0, y: 0 })

const World = Game.Inspector("Test/Touch", {
  queries: {
    projectiles: Game.Query({ selection: { velocity: Game.Query.read(Velocity) }, with: [Projectile] }),
    grenades: Game.Query({ selection: { grenade: Game.Query.read(Grenade) } }),
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] })
  },
  resources: { controls: Game.System.readResource(Controls) }
}, ({ queries, resources }) => ({
  projectiles: queries.projectiles.each().map(({ data }) => ({ velocity: data.velocity.get() })),
  grenades: queries.grenades.each().map(({ data }) => data.grenade.get()),
  position: queries.player.each()[0]!.data.position.get(),
  device: resources.controls.get().device
}))

const Charge = Game.System("Test/ChargeUltimate", {
  queries: { player: Game.Query({ selection: { ultimate: Game.Query.write(Ultimate) }, with: [Player] }) }
}, ({ queries }) => {
  for (const { data } of queries.player.each()) data.ultimate.set({ energy: defaultTuning.ultimate.energy })
})

describe("touch controls", () => {
  it("moves with the stick, at a speed that follows the tilt, and switches to touch", () => {
    const run = start({ touch: [{ frame: 0, stick: { x: 0.5, y: 0 } }] })
    run.step(30)
    const { velocity } = run.player()
    const right = world({ x: 1, y: 0 })
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(defaultTuning.player.moveSpeed * 0.5, 6)
    expect(velocity.x / Math.hypot(velocity.x, velocity.y)).toBeCloseTo(right.x, 6)
    expect(run.runtime.inspect(World).device).toBe("touch")
  })

  it("fires while attack is held, toward the drag, or straight ahead for a tap-and-hold", () => {
    const dragged = start({ touch: [{ frame: 0, press: ["attack"], aim: { attack: { x: 0, y: -1 } } }] })
    dragged.step(10)
    const shots = dragged.runtime.inspect(World).projectiles
    expect(shots.length).toBeGreaterThan(0)
    const up = world({ x: 0, y: -1 })
    const velocity = shots[0]!.velocity
    expect(velocity.x / Math.hypot(velocity.x, velocity.y)).toBeCloseTo(up.x, 6)
    expect(velocity.y / Math.hypot(velocity.x, velocity.y)).toBeCloseTo(up.y, 6)

    // Moving left and holding attack without dragging fires left.
    const ahead = start({ touch: [{ frame: 0, stick: { x: -1, y: 0 }, press: ["attack"] }] })
    ahead.step(10)
    const left = world({ x: -1, y: 0 })
    const shot = ahead.runtime.inspect(World).projectiles.at(-1)!.velocity
    expect(shot.x / Math.hypot(shot.x, shot.y)).toBeCloseTo(left.x, 6)
  })

  it("throws the grenade on release: to the dragged spot, or ahead for a tap; a cancelled drag throws nothing", () => {
    const spec = defaultTuning.skills.grenade
    const dragged = start({ touch: [{ frame: 0, press: ["skill"], aim: { skill: { x: 0, y: -0.5 } } }, { frame: 3, release: ["skill"] }] })
    dragged.step(3)
    expect(dragged.runtime.inspect(World).grenades).toEqual([])
    dragged.step(1)
    const [thrown] = dragged.runtime.inspect(World).grenades
    const up = world({ x: 0, y: -1 })
    expect(thrown!.to.x).toBeCloseTo(center.x + up.x * spec.maxRange * 0.5, 6)
    expect(thrown!.to.y).toBeCloseTo(center.y + up.y * spec.maxRange * 0.5, 6)

    const tapped = start({ touch: [{ frame: 0, press: ["skill"], release: ["skill"] }] })
    tapped.step(1)
    const [tap] = tapped.runtime.inspect(World).grenades
    expect(Math.hypot(tap!.to.x - center.x, tap!.to.y - center.y)).toBeCloseTo(spec.maxRange * defaultTuning.touch.tapThrowRange, 6)

    const cancelled = start({ touch: [{ frame: 0, press: ["skill"], aim: { skill: { x: 1, y: 0 } } }, { frame: 3, cancel: ["skill"] }] })
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
    expect(nova.player().invulnerable).toBeCloseTo(defaultTuning.ultimate.invulnerability, 6)
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
    expect(after.fireHeld).toBe(false)
  })
})
