import { describe, expect, it } from "vitest"
import { normalizeOr, type Vec2 } from "@typeonce/ritmo-math/Vec2"

import { skillSlots } from "../src/content/skills.ts"
import { actionButtons, drawnShare, partyLayout, stickRest, touchButtons, touchLayout } from "../src/config/input.ts"
import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { screenDirectionToWorld } from "../src/math/iso.ts"
import type { LobMove } from "../src/content/attacks.ts"
import { EnemyOptionalParts, makeEnemy } from "../src/features/enemies.ts"
import { Controls, Enemy, Energy, Game, Lobbed, Player, Position, Projectile, RunScope, Velocity } from "../src/schema.ts"
import { ClearEnemies, gunner, plainAttack, start, swordsman, tidecaller, withWindCut, grenadeSkill, volley, withVolley, expectOk } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
/** A screen direction (y down) as the unit world direction the game uses. */
const world = (screen: Vec2): Vec2 => normalizeOr(screenDirectionToWorld(projection, screen), { x: 0, y: 0 })


const World = Game.Inspector("Test/Touch", {
  queries: {
    projectiles: Game.Query({ selection: { velocity: Game.Query.read(Velocity) }, with: [Projectile] }),
    grenades: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }),
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Enemy] })
  },
  resources: { controls: Game.System.readResource(Controls) }
}, ({ queries, resources }) => ({
  projectiles: queries.projectiles.each().map(({ data }) => ({ velocity: data.velocity.get() })),
  grenades: queries.grenades.each().map(({ data }) => data.lobbed.get()),
  position: queries.player.each()[0]!.data.position.get(),
  device: resources.controls.get().device,
  aimPoint: resources.controls.get().aimPoint,
  enemies: queries.enemies.each().map(({ data }) => data.position.get())
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

  it("aims a dragged cut along the drag", () => {
    const dragged = start({ tuning: withWindCut(), touch: [{ frame: 0, press: ["special"], aim: { special: { x: 0, y: -1 } } }, { frame: 2, release: ["special"] }] })
    dragged.step(3)
    const up = world({ x: 0, y: -1 })
    expect(dragged.player().aim.x).toBeCloseTo(up.x, 6)
    expect(dragged.player().aim.y).toBeCloseTo(up.y, 6)
  })

  it("throws the grenade on release: to the dragged spot, or ahead for a tap; a cancelled drag throws nothing", () => {
    const spec = grenadeSkill.effect
    const dragged = start({ build: gunner, touch: [{ frame: 0, press: ["special"], aim: { special: { x: 0, y: -0.5 } } }, { frame: 3, release: ["special"] }] })
    dragged.step(3)
    expect(dragged.runtime.inspect(World).grenades).toEqual([])
    dragged.step(1)
    const [thrown] = dragged.runtime.inspect(World).grenades
    const up = world({ x: 0, y: -1 })
    expect(thrown!.to.x).toBeCloseTo(center.x + up.x * spec.maxRange * 0.5, 6)
    expect(thrown!.to.y).toBeCloseTo(center.y + up.y * spec.maxRange * 0.5, 6)

    // Assist off: the training dummies near the spawn would otherwise draw a tapped throw.
    const tapped = start({ tuning: tuningWith({ touch: { assist: { enabled: false } } }), build: gunner, touch: [{ frame: 0, press: ["special"], release: ["special"] }] })
    tapped.step(1)
    const [tap] = tapped.runtime.inspect(World).grenades
    expect(Math.hypot(tap!.to.x - center.x, tap!.to.y - center.y)).toBeCloseTo(spec.maxRange * defaultTuning.touch.tapThrowRange, 6)

    const cancelled = start({ build: gunner, touch: [{ frame: 0, press: ["special"], aim: { special: { x: 1, y: 0 } } }, { frame: 3, cancel: ["special"] }] })
    cancelled.step(6)
    expect(cancelled.runtime.inspect(World).grenades).toEqual([])
  })

  describe("lands what arcs on the enemy the assist picks, never at a point to aim (docs/aspects.md, \"Aiming on touch\")", () => {
    // One dummy, off the facing and nearer than the touch aim's set distance.
    const dummy = { x: center.x + 150, y: center.y + 80 }
    const alone = (run: ReturnType<typeof start>) => {
      const Spawn = Game.System("Test/SpawnDummy", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
        commands.spawnIn(RunScope, makeEnemy(defaultTuning, "dummy", dummy))
      })
      expectOk(run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred())))
      return run
    }

    it("a charged grenade, aimed at it while held, lands on it", () => {
      const power = plainAttack(defaultTuning, "gun").power!
      const full = power.holdDelay + power.chargeTime
      const release = Math.round((full + 0.05) / engine.step.dt)
      const run = alone(start({ build: gunner, touch: [{ frame: 0, press: ["attack"] }, { frame: release, release: ["attack"] }] }))
      run.step(release)
      // Held, the aim is the dummy itself (the opening shot pushed it), so what the cue shows is where it lands.
      const held = run.runtime.inspect(World)
      expect(held.aimPoint.x).toBeCloseTo(held.enemies[0]!.x, 6)
      expect(held.aimPoint.y).toBeCloseTo(held.enemies[0]!.y, 6)
      run.step(2)
      const [thrown] = run.runtime.inspect(World).grenades
      expect(Math.hypot(held.aimPoint.x - center.x, held.aimPoint.y - center.y)).toBeLessThan((power.move as LobMove).maxRange)
      expect(Math.hypot(thrown!.to.x - held.enemies[0]!.x, thrown!.to.y - held.enemies[0]!.y)).toBeLessThan(10)
    })

    it("a tapped grenade skill is set down on it", () => {
      const run = alone(start({ build: gunner, touch: [{ frame: 0, press: ["special"], release: ["special"] }] }))
      run.step(1)
      const [tap] = run.runtime.inspect(World).grenades
      expect(tap!.to.x).toBeCloseTo(dummy.x, 6)
      expect(tap!.to.y).toBeCloseTo(dummy.y, 6)
    })
  })

  it("dashes with the dash button toward the stick, and casts the ultimate with its button", () => {
    const run = start({ touch: [{ frame: 0, stick: { x: 1, y: 0 }, press: ["dash"], release: ["dash"] }] })
    run.step(1)
    const { dash } = run.player()
    const right = world({ x: 1, y: 0 })
    expect(dash.remaining).toBeGreaterThan(0)
    expect(dash.direction.x).toBeCloseTo(right.x, 6)
    expect(dash.direction.y).toBeCloseTo(right.y, 6)

    const tide = start({ build: tidecaller, touch: [{ frame: 1, press: ["ultimate"], release: ["ultimate"] }] })
    expectOk(tide.runtime.tick(Game.Schedule(Charge)))
    tide.step(2)
    expect(tide.player().invulnerable).toBeCloseTo(defaultTuning.skills.tide.invulnerability, 6)
  })

  it("uses each button's skill by its kind: the Tide goes off on touch, the Barrage on release", () => {
    const tide = start({ build: tidecaller, touch: [{ frame: 1, press: ["ultimate"] }] })
    expectOk(tide.runtime.tick(Game.Schedule(Charge)))
    tide.step(2)
    expect(tide.player().invulnerable).toBeCloseTo(defaultTuning.skills.tide.invulnerability, 6)

    // A volley (the Barrage before the Overdrive) for an ultimate aimed at a point.
    const spec = volley
    const thrown = start({ tuning: withVolley(tuningWith({ touch: { assist: { enabled: false } } })), build: gunner, touch: [{ frame: 0, press: ["ultimate"] }, { frame: 2, release: ["ultimate"] }] })
    expectOk(thrown.runtime.tick(Game.Schedule(Charge)))
    thrown.step(2)
    expect(thrown.runtime.inspect(World).grenades).toEqual([])
    thrown.step(1)
    const [first] = thrown.runtime.inspect(World).grenades
    expect(thrown.runtime.inspect(World).grenades).toHaveLength(spec.shells)
    expect(Math.hypot(first!.to.x - center.x, first!.to.y - center.y)).toBeCloseTo(spec.maxRange * defaultTuning.touch.tapThrowRange, 6)
  })

  it("lays the buttons out apart, on the right half, inside the safe area, the party list above them", () => {
    // Landscape phones (notched ones with their safe area: a mini, a 14, a Pro Max, and an SE without), a wide Android, and a tablet.
    const screens = [
      { width: 812, height: 375, notch: 50 },
      { width: 844, height: 390, notch: 0 },
      { width: 844, height: 390, notch: 47 },
      { width: 932, height: 430, notch: 59 },
      { width: 667, height: 375, notch: 0 },
      { width: 1010, height: 360, notch: 32 },
      { width: 932, height: 325, notch: 59 },
      { width: 1180, height: 820, notch: 0 }
    ]
    for (const { notch, ...screen } of screens) {
      const safe = { top: 0, right: notch, bottom: 0, left: notch }
      const layout = touchLayout(screen, safe)
      const label = `${screen.width}x${screen.height}, notch ${notch}`
      const zones = touchButtons.map((name) => ({ name, ...layout.buttons[name] }))
      const rows = partyLayout(screen, safe)
      for (const [index, zone] of [...zones, ...rows.map((row, slot) => ({ name: `row ${slot}`, ...row }))].entries()) {
        expect(zone.center.x - zone.radius, `${label}: ${zone.name}`).toBeGreaterThan(screen.width / 2)
        expect(zone.center.x + zone.radius, `${label}: ${zone.name}`).toBeLessThanOrEqual(screen.width - notch)
        expect(zone.center.y - zone.radius, `${label}: ${zone.name}`).toBeGreaterThan(0)
        expect(zone.center.y + zone.radius, `${label}: ${zone.name}`).toBeLessThan(screen.height)
        for (const other of zones.slice(index + 1)) {
          expect(Math.hypot(zone.center.x - other.center.x, zone.center.y - other.center.y), `${label}: ${zone.name}, ${other.name}`).toBeGreaterThan(zone.radius + other.radius)
        }
      }
      // Clear of her health bar (bottom center, 140 px wide, 26 px up, her state's icon over it: see .hud__vitals).
      const bar = { left: screen.width / 2 - 70, right: screen.width / 2 + 70, top: screen.height - 26 - 8 - 20 }
      for (const zone of zones) {
        const nearest = { x: Math.max(bar.left, Math.min(bar.right, zone.center.x)), y: Math.max(bar.top, zone.center.y) }
        expect(Math.hypot(zone.center.x - nearest.x, zone.center.y - nearest.y), `${label}: ${zone.name} clear of the health bar`).toBeGreaterThan(zone.radius)
      }
      // The rows, in slot order down one column, all above the buttons: nothing under a row (her name, health, and ultimate's icon run left of the portrait).
      for (const [slot, row] of rows.entries()) {
        expect(row.center.x).toBeCloseTo(rows[0]!.center.x, 6)
        if (slot > 0) expect(row.center.y - row.radius, `${label}: row ${slot}`).toBeGreaterThan(rows[slot - 1]!.center.y + rows[slot - 1]!.radius)
      }
      // Well clear of the buttons below: room for the rows' names to read apart from them.
      const bottom = rows.at(-1)!.center.y + rows.at(-1)!.radius
      const scale = Math.min(1.4, Math.max(0.8, Math.min(screen.width, screen.height) / 400))
      for (const name of actionButtons) {
        const zone = layout.buttons[name]
        expect(zone.center.y - zone.radius, `${label}: ${name} under the party list`).toBeGreaterThan(bottom + 24 * scale)
      }
    }
  })

  it("rests the stick as far in from the left edge as the dash is from the right", () => {
    for (const screen of [{ width: 844, height: 390 }, { width: 900, height: 330 }]) {
      const layout = touchLayout(screen)
      const rest = stickRest(screen)
      const dash = layout.buttons.dash
      expect(rest.x - layout.stick.radius).toBeCloseTo(screen.width - (dash.center.x + dash.radius * (drawnShare.dash ?? 1)), 6)
    }
  })

  it("draws the dash large, the second largest button, and takes a touch a good way beyond its circle", () => {
    const layout = touchLayout({ width: 844, height: 390 })
    const drawn = layout.buttons.dash.radius * (drawnShare.dash ?? 1)
    expect(drawn).toBeLessThan(layout.buttons.attack.radius)
    expect(drawn).toBeGreaterThan(layout.buttons.special.radius)
    expect(layout.buttons.dash.radius).toBeGreaterThan(drawn * 1.2)
  })

  it("lets both skill buttons be dragged to aim, since either slot may hold an aimed skill (the Cyclone and the Barrage are ultimates)", () => {
    const layout = touchLayout({ width: 844, height: 390 })
    for (const slot of skillSlots) expect(layout.buttons[slot].aimRadius, slot).toBeGreaterThan(0)
  })

  it("starts as touch on a phone, before anything is touched, until a key is used", () => {
    const run = start({ device: "touch", keys: [{ frame: 10, press: ["up"] }] })
    run.step(6)
    expect(run.runtime.inspect(World).device).toBe("touch")
    run.step(6)
    expect(run.runtime.inspect(World).device).toBe("desktop")
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
    const Remove = Game.System("Test/RemovePlayer", { queries: { player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }) }, commands: Game.System.commands(Game.System.despawns(Player)) }, ({ queries, commands }) => {
      for (const { entity } of queries.player.each()) commands.despawn(entity)
    })
    expectOk(run.runtime.tick(Game.Schedule(Remove, Game.Schedule.applyDeferred())))
    const AimPoint = Game.Inspector("Test/AimPoint", { resources: { controls: Game.System.readResource(Controls) } }, ({ resources }) => resources.controls.get())
    const before = run.runtime.inspect(AimPoint).aimPoint
    run.step(30)
    const after = run.runtime.inspect(AimPoint)
    expect(after.aimPoint).toEqual(before)
    expect(after.attackHeld).toBe(false)
  })
})
