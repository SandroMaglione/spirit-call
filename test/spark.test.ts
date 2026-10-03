/**
 * What gives the fight its peaks: the Gunner's magazine (fire, then reload
 * or switch out), wind whirls taking on other elements, and enemies
 * breaking under pressure.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { makeGround } from "../src/features/ground.ts"
import { Attacker, AttackPhase, Dash, ElementState, Enemy, Game, Health, Player, Poise, RunScope, SlowMotion, Stunned, Vortex, Weapon } from "../src/schema.ts"
import { center, cursorAt, doubleTap, gale, gunner, placeDummies, start, steps, withGale } from "./helpers.ts"

const Fight = Game.Inspector("Test/Spark", {
  queries: {
    weapon: Game.Query({ selection: { weapon: Game.Query.read(Weapon) }, with: [Player] }),
    enemies: Game.Query({
      selection: { health: Game.Query.read(Health), state: Game.Query.read(ElementState), poise: Game.Query.read(Poise), stunned: Game.Query.read(Stunned), phase: Game.Query.read(AttackPhase) },
      with: [Enemy]
    }),
    vortices: Game.Query({ selection: { vortex: Game.Query.read(Vortex) } })
  }
}, ({ queries }) => ({
  weapon: queries.weapon.each()[0]?.data.weapon.get(),
  enemies: queries.enemies.each().map(({ data }) => ({
    health: data.health.get().current,
    state: data.state.get().current?.id ?? null,
    poise: data.poise.get(),
    stunned: data.stunned.get().remaining,
    phase: data.phase.get()
  })),
  vortices: queries.vortices.each().map(({ data }) => data.vortex.get())
}))

/** Clicks every `every` frames from `from`, `count` times. */
const clicks = (from: number, count: number, every: number) =>
  Array.from({ length: count }, (_, index) => [
    { frame: from + index * every, press: ["primary" as const] },
    { frame: from + index * every + 2, release: ["primary" as const] }
  ]).flat()

describe("the Gunner's magazine", () => {
  const magazine = defaultTuning.attacks.gun.magazine!

  it("fires its rounds, then reloads before firing again, full", () => {
    const run = start({ build: gunner, pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }, ...clicks(1, 40, 12)] })
    const seen: Array<{ spent: number; reloading: number }> = []
    for (let step = 0; step < steps(5); step++) {
      run.step()
      const weapon = run.runtime.inspect(Fight).weapon!
      seen.push({ spent: weapon.spent, reloading: weapon.reloading })
    }
    expect(Math.max(...seen.map((weapon) => weapon.spent))).toBe(magazine.rounds)
    const reloadStarts = seen.findIndex((weapon) => weapon.reloading > 0)
    expect(reloadStarts).toBeGreaterThan(0)
    // While reloading, nothing more is fired; then the magazine is full again and firing goes on.
    const reload = seen.slice(reloadStarts, reloadStarts + steps(magazine.reload) - 1)
    expect(reload.every((weapon) => weapon.spent === magazine.rounds && weapon.reloading > 0)).toBe(true)
    const after = seen.slice(reloadStarts + steps(magazine.reload) + 1)
    expect(after.some((weapon) => weapon.spent > 0 && weapon.spent < magazine.rounds)).toBe(true)
  })
})

describe("the Gunner's charged shot", () => {
  // Single shots only (no spread), at a sturdy dummy straight ahead.
  const gun = defaultTuning.attacks.gun
  const single = gun.combo[0]!
  // Its grenade without fire (no burns, no pool), so only the blast counts.
  const tuning = tuningWith({ attacks: { gun: { combo: [single, single, single], power: { move: { element: null, leaves: null } } } }, enemies: { dummy: { hp: 500 } } })
  // Her ATK with her starting weapon's.
  const atk = defaultTuning.characters.gunner.stats.atk + defaultTuning.weapons.trainingPistol.atk
  const rounds = gun.magazine!.rounds
  /** `shots` quick shots, then a press held to a full charge and released. */
  const charged = (shots: number) => {
    const charge = shots * 12 + 4
    const run = start({
      build: gunner,
      tuning,
      pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }, ...clicks(1, shots, 12), { frame: charge, press: ["primary"] }, { frame: charge + steps(gun.power!.holdDelay + gun.power!.chargeTime) + 4, release: ["primary"] }]
    })
    run.runtime.tick(placeDummies([{ x: 300, y: 0 }], tuning))
    run.step(charge + steps(2.2))
    return run
  }
  const shot = (atk * single.power) / 100
  const full = (atk * gun.power!.move.power) / 100

  it("deals full damage from a full magazine, and empties it", () => {
    const run = charged(0)
    // The press that starts the charge fires a shot of its own.
    expect(run.runtime.inspect(Fight).enemies[0]!.health).toBeCloseTo(500 - shot - full, 6)
  })

  it("deals the share of the rounds left", () => {
    const run = charged(2)
    // Two shots, then the press's own (which counts toward the charge), and the three rounds left.
    expect(run.runtime.inspect(Fight).enemies[0]!.health).toBeCloseTo(500 - 3 * shot - (full * 4) / rounds, 6)
  })
})

describe("a wind whirl taking on an element", () => {
  const absorbSeconds = defaultTuning.elements.wind.absorbSeconds

  it("takes on the fire of a pool under it, lasts longer, and sets what it pulls burning", () => {
    const run = start({ tuning: withGale(), pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }], keys: [{ frame: 2, press: ["special"], release: ["special"] }] })
    run.runtime.tick(placeDummies([{ x: 180, y: 0 }, { x: -160, y: 60 }]))
    const Pool = Game.System("Test/FirePool", {}, ({ commands }) => {
      commands.spawnIn(RunScope, makeGround({ element: "fire", radius: 40, seconds: 1 }, { x: center.x, y: center.y - 120 }, 80, true))
    })
    run.runtime.tick(Game.Schedule(Pool, Game.Schedule.applyDeferred()))
    run.step(6)
    const [whirl] = run.runtime.inspect(Fight).vortices
    expect(whirl?.absorbed).toBe("fire")
    expect(whirl!.remaining).toBeGreaterThan(gale.seconds)
    run.step(steps(1))
    expect(run.runtime.inspect(Fight).enemies.map((enemy) => enemy.state)).toEqual(["burning", "burning"])
    // It ends later than a plain one would.
    run.step(steps(gale.seconds - 1))
    expect(run.runtime.inspect(Fight).vortices).toHaveLength(1)
    run.step(steps(absorbSeconds) + 2)
    expect(run.runtime.inspect(Fight).vortices).toHaveLength(0)
  })

  it("stays plain wind with nothing to take on", () => {
    const run = start({ tuning: withGale(), keys: [{ frame: 2, press: ["special"], release: ["special"] }] })
    run.runtime.tick(placeDummies([{ x: 180, y: 0 }]))
    run.step(steps(1))
    expect(run.runtime.inspect(Fight).vortices[0]?.absorbed).toBeNull()
    expect(run.runtime.inspect(Fight).enemies[0]?.state).toBeNull()
  })
})

describe("breaking", () => {
  // Dummies that break like a Chaser (training dummies never do), and one that winds up an attack.
  const breakable = tuningWith({ enemies: { dummy: { poise: 0.5, hp: 200 } } })
  const rules = defaultTuning.breaking

  it("breaks an enemy under a pressed attack: stunned, then it recovers with an empty bar", () => {
    const run = start({ tuning: breakable, pointer: [{ frame: 0, move: cursorAt({ x: 60, y: 0 }) }, ...clicks(1, 30, 14)] })
    run.runtime.tick(placeDummies([{ x: 60, y: 0 }], breakable))
    let broke = -1
    for (let step = 0; step < steps(6) && broke < 0; step++) {
      run.step()
      if (run.runtime.inspect(Fight).enemies[0]!.poise.broken > 0) broke = step
    }
    expect(broke).toBeGreaterThan(0)
    expect(run.runtime.inspect(Fight).enemies[0]!.stunned).toBeGreaterThan(0)
    run.step(steps(rules.seconds + rules.hitStop) + 30)
    // Still under attack, it has recovered and fills again from empty.
    expect(run.runtime.inspect(Fight).enemies[0]!.poise.broken).toBe(0)
    expect(run.runtime.inspect(Fight).enemies[0]!.poise.current).toBeLessThan(0.5 * 200)
  })

  it("never breaks from chip damage that lets the bar drain", () => {
    // One click every 2.5 seconds: the bar drains between hits.
    const run = start({ tuning: breakable, pointer: [{ frame: 0, move: cursorAt({ x: 60, y: 0 }) }, ...clicks(1, 6, steps(2.5))] })
    run.runtime.tick(placeDummies([{ x: 60, y: 0 }], breakable))
    let broke = false
    for (let step = 0; step < steps(15); step++) {
      run.step()
      broke ||= run.runtime.inspect(Fight).enemies[0]!.poise.broken > 0
    }
    expect(broke).toBe(false)
  })

  it("cuts off the windup of an enemy that breaks", () => {
    const winding = tuningWith({
      enemies: {
        dummy: {
          poise: 0.5,
          attacks: [{ kind: "melee", id: "swipe", minRange: 0, triggerRange: 400, windup: 2, aimLock: 0.5, active: 0.1, recovery: 0.3, cooldown: 0.5, power: 10, knockback: 0, weight: 1, followUp: null, element: null, lead: 0, reach: 100, arcDegrees: 90 }]
        }
      }
    })
    const run = start({ tuning: winding })
    run.runtime.tick(placeDummies([{ x: 200, y: 0 }], winding))
    run.step(5)
    expect(run.runtime.inspect(Fight).enemies[0]!.phase).toBe("windup")
    const Break = Game.System("Test/Break", { queries: { enemies: Game.Query({ selection: { poise: Game.Query.write(Poise), stunned: Game.Query.write(Stunned) } }) } }, ({ queries }) => {
      for (const { data } of queries.enemies.each()) {
        data.poise.set({ current: 200, broken: 2, quiet: 0 })
        data.stunned.set({ remaining: 2 })
      }
    })
    run.runtime.tick(Game.Schedule(Break))
    run.step(2)
    expect(run.runtime.inspect(Fight).enemies[0]!.phase).toBe("ready")
  })
})

describe("a perfect dodge", () => {
  // A dummy that winds up a wide swipe all around it, long enough to dash at any moment of it.
  const swipe = { kind: "melee" as const, id: "swipe", minRange: 0, triggerRange: 400, windup: 1, aimLock: 0.5, active: 0.1, recovery: 0.5, cooldown: 5, power: 10, knockback: 0, weight: 1, followUp: null, element: null, lead: 0, reach: 130, arcDegrees: 360 }
  const tuning = tuningWith({ enemies: { dummy: { poise: 0.5, attacks: [swipe] } } })
  const Dodger = Game.Inspector("Test/Dodger", {
    queries: { player: Game.Query({ selection: { dash: Game.Query.read(Dash), health: Game.Query.read(Health) }, with: [Player] }) },
    resources: { slow: Game.System.readResource(SlowMotion) }
  }, ({ queries, resources }) => ({ dash: queries.player.each()[0]!.data.dash.get(), health: queries.player.each()[0]!.data.health.get().current, slow: resources.slow.get() }))

  /** The step the swipe goes off on (the dummy 80 to her right). */
  const landsAt = (() => {
    const dry = start({ tuning })
    dry.runtime.tick(placeDummies([{ x: 80, y: 0 }], tuning))
    for (let step = 1; step < 300; step++) {
      dry.step()
      if (dry.runtime.inspect(Fight).enemies[0]!.phase === "active") return step
    }
    throw new Error("the swipe never went off")
  })()
  /** A run whose dash (away, screen up) starts `early` steps before the swipe goes off (a double tap read on the following steps). */
  const dodging = (early: number | null) => {
    const run = start({ tuning, keys: early === null ? [] : doubleTap("up", landsAt - early - 3, { hold: true }) })
    run.runtime.tick(placeDummies([{ x: 80, y: 0 }], tuning))
    return run
  }
  const hp = defaultTuning.characters.swordsman.stats.hp

  it("rewards a dash at the last moment: slow motion, the dash back, and the attacker's break bar", () => {
    const run = dodging(1)
    run.step(landsAt + 3)
    const state = run.runtime.inspect(Dodger)
    expect(state.dash.perfect).toBe(true)
    expect(state.dash.cooldown).toBe(0)
    expect(state.slow.remaining).toBeGreaterThan(0)
    expect(state.health).toBe(hp)
    expect(run.runtime.inspect(Fight).enemies[0]!.poise.current).toBeGreaterThan(0)
  })

  it("counts the blow landing where she dashed from, though the dash already carried her out of it", () => {
    const run = dodging(steps(defaultTuning.perfectDodge.window) - 2)
    run.step(landsAt + 3)
    expect(run.runtime.inspect(Dodger).dash.perfect).toBe(true)
  })

  it("slows only the enemies: their windup crawls while she runs at full speed", () => {
    const run = start({ tuning, keys: [{ frame: 0, press: ["left"] }] })
    run.runtime.tick(placeDummies([{ x: 80, y: 0 }], tuning))
    run.step(10)
    const Slow = Game.System("Test/Slow", { resources: { slow: Game.System.writeResource(SlowMotion) } }, ({ resources }) => {
      resources.slow.set({ remaining: 1, scale: 0.25, dodge: true })
    })
    run.runtime.tick(Game.Schedule(Slow))
    const before = { at: run.player().position, windup: run.runtime.inspect(Fight).enemies[0]!.phase }
    const AttackerElapsed = Game.Inspector("Test/Elapsed", { queries: { enemies: Game.Query({ selection: { attacker: Game.Query.read(Attacker) } }) } }, ({ queries }) => queries.enemies.each()[0]!.data.attacker.get().elapsed)
    const start0 = run.runtime.inspect(AttackerElapsed)
    run.step(30)
    expect(before.windup).toBe("windup")
    // Half a second: her run covers her full speed's worth, its windup a quarter of that time.
    expect(run.runtime.inspect(AttackerElapsed) - start0).toBeCloseTo(0.5 * 0.25, 6)
    expect(Math.abs(run.player().position.x - before.at.x) + Math.abs(run.player().position.y - before.at.y)).toBeGreaterThan(0.5 * defaultTuning.characters.swordsman.stats.speed * 0.9)
  })

  it("is only a plain dodge when the dash comes early", () => {
    const run = dodging(steps(0.4))
    run.step(landsAt + 3)
    const state = run.runtime.inspect(Dodger)
    expect(state.dash.perfect).toBe(false)
    expect(state.slow.remaining).toBe(0)
    expect(state.health).toBe(hp)
  })

  it("is a hit without a dash", () => {
    const run = dodging(null)
    run.step(landsAt + 3)
    expect(run.runtime.inspect(Dodger).health).toBeLessThan(hp)
  })
})

describe("the dash strike", () => {
  const sword = defaultTuning.attacks.sword
  const DashWeapon = Game.Inspector("Test/DashWeapon", {
    queries: { player: Game.Query({ selection: { weapon: Game.Query.read(Weapon) }, with: [Player] }) }
  }, ({ queries }) => queries.player.each()[0]!.data.weapon.get())
  /** A dash toward a sturdy dummy, and an attack pressed `after` steps into it. */
  const strike = (after: number) => {
    const tuning = tuningWith({ enemies: { dummy: { hp: 500 } } })
    const run = start({ tuning, pointer: [{ frame: 0, move: cursorAt({ x: 200, y: 0 }) }, ...clicks(3 + after, 1, 1)], keys: doubleTap("right", 0, { hold: true }) })
    run.runtime.tick(placeDummies([{ x: 260, y: 0 }], tuning))
    return run
  }

  it("strikes out of a dash with the weapon's dash move, once per dash", () => {
    const run = strike(2)
    run.step(12)
    expect(run.runtime.inspect(DashWeapon).sinceDashStrike).toBeLessThan(0.2)
    expect(run.runtime.inspect(DashWeapon).recovery).toBe(sword.dash.recovery)
  })

  it("is a plain combo move when pressed long after the dash", () => {
    const run = strike(Math.ceil((defaultTuning.dash.duration + defaultTuning.dash.attackWindow) / engine.stepSeconds) + 10)
    run.step(60)
    expect(run.runtime.inspect(DashWeapon).sinceDashStrike).toBe(Infinity)
    expect(run.runtime.inspect(DashWeapon).step).toBe(0)
  })
})
