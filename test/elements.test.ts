import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { elements } from "../src/content/elements.ts"
import type { ElementId, StateId } from "../src/content/elements.ts"
import { afflict, affinityDamage, burnDps, stateSpeed } from "../src/features/elements.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { makeGround } from "../src/features/ground.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { blow, Damage, ElementState, Enemy, Energy, Game, Ground, Health, Invulnerable, Knockback, Player, Poise, Position, RunScope, Stats, Stunned } from "../src/schema.ts"
import type { ActiveState } from "../src/schema.ts"
import { center, cursorAt, grenadeSkill, gunner, withGrenade, placeDummies, start, steps, withWindCut } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const tuning = defaultTuning
const rules = tuning.elements
const grenade = grenadeSkill.effect
/** The gunner's ATK. */
const atk = tuning.characters.gunner.stats.atk
/** Dummies that take many blows. */
const sturdy = () => tuningWith({ enemies: { dummy: { hp: 100_000 } } })

/** The bursts and slams the run has set off so far. */
const Reactions = Game.Inspector("Test/Reactions", { resources: { stats: Game.System.readResource(Stats) } }, ({ resources }) => resources.stats.get().reactions)

const World = Game.Inspector("Test/Elements", {
  queries: {
    enemies: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        health: Game.Query.read(Health),
        state: Game.Query.read(ElementState),
        stunned: Game.Query.read(Stunned),
        knockback: Game.Query.read(Knockback)
      },
      with: [Enemy]
    }),
    player: Game.Query({
      selection: {
        health: Game.Query.read(Health),
        state: Game.Query.read(ElementState),
        energy: Game.Query.read(Energy),
        invulnerable: Game.Query.read(Invulnerable),
        stunned: Game.Query.read(Stunned),
        knockback: Game.Query.read(Knockback)
      },
      with: [Player]
    }),
    pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } })
  }
}, ({ queries }) => {
  const [player] = queries.player.each()
  return {
    pools: queries.pools.each().map(({ data }) => data.ground.get()),
    enemies: queries.enemies.each().map(({ entity, data }) => ({
      id: entity.id.value,
      position: data.position.get(),
      health: data.health.get().current,
      state: data.state.get().current,
      stunned: data.stunned.get().remaining,
      knockback: data.knockback.get()
    })),
    player: {
      health: player!.data.health.get().current,
      state: player!.data.state.get().current,
      energy: player!.data.energy.get().current,
      invulnerable: player!.data.invulnerable.get().remaining,
      stunned: player!.data.stunned.get().remaining,
      knockback: player!.data.knockback.get()
    }
  }
})

/** Training mode with only the listed dummies (offsets from the player), aiming at `aim`. */
const range = (dummies: ReadonlyArray<Vec2>, aim: Vec2, options: StartOptions = {}) => {
  const run = start({ ...options, pointer: [{ frame: 0, move: cursorAt(aim) }] })
  run.runtime.tick(placeDummies(dummies, options.tuning))
  const world = () => run.runtime.inspect(World)
  /** Puts the player, or the enemies (all, or the one at offset `at`), in `state`. */
  const putIn = (state: ActiveState | null, who: "player" | "enemies" | Vec2 = "enemies") => {
    const Put = Game.System("Test/PutInState", {
      queries: { bodies: Game.Query({ selection: { state: Game.Query.write(ElementState), position: Game.Query.read(Position), player: Game.Query.optional(Player) }, with: [Health] }) }
    }, ({ queries }) => {
      for (const { data } of queries.bodies.each()) {
        const there = data.position.get()
        const chosen = who === "player"
          ? data.player.present
          : who === "enemies" ? !data.player.present : !data.player.present && Math.hypot(there.x - center.x - who.x, there.y - center.y - who.y) < 1
        if (chosen) data.state.set({ current: state })
      }
    })
    run.runtime.tick(Game.Schedule(Put))
  }
  /** A blow of `damage` carrying `element` on the player, or on the enemy at offset `at`, from the other side. */
  const strike = (at: Vec2 | "player", element: ElementId | null, damage = 1, direction: Vec2 = { x: 1, y: 0 }) => {
    const Strike = Game.System("Test/Strike", {
      queries: { bodies: Game.Query({ selection: { position: Game.Query.read(Position), player: Game.Query.optional(Player) }, with: [Health] }) },
      events: { damage: Game.System.writeEvent(Damage) }
    }, ({ queries, events }) => {
      for (const { entity, data } of queries.bodies.each()) {
        const there = data.position.get()
        const hit = at === "player" ? data.player.present : !data.player.present && Math.hypot(there.x - center.x - at.x, there.y - center.y - at.y) < 1
        if (!hit) continue
        events.damage.emit({
          target: Game.Entity.handle(entity.id, Health),
          faction: at === "player" ? "enemy" : "player",
          direction,
          blow: blow({ damage, knockback: 0, element: element === null ? null : { id: element, atk: 100 } })
        })
      }
    })
    run.runtime.tick(Game.Schedule(Strike))
  }
  /** Leaves pools of `element` at offsets from the player. */
  const pour = (pools: ReadonlyArray<{ readonly element: ElementId; readonly at: Vec2; readonly radius?: number; readonly seconds?: number }>) => {
    const Pour = Game.System("Test/Pour", {}, ({ commands }) => {
      for (const pool of pools) {
        commands.spawnIn(RunScope, makeGround({ element: pool.element, radius: pool.radius ?? 80, seconds: pool.seconds ?? 5 }, { x: center.x + pool.at.x, y: center.y + pool.at.y }, 100, true))
      }
    })
    run.runtime.tick(Game.Schedule(Pour, Game.Schedule.applyDeferred()))
  }
  /** The dummy nearest offset `at`. */
  const dummy = (at: Vec2) => {
    const away = (enemy: { readonly position: Vec2 }) => Math.hypot(enemy.position.x - center.x - at.x, enemy.position.y - center.y - at.y)
    return [...world().enemies].sort((left, right) => away(left) - away(right))[0]!
  }
  return { ...run, world, putIn, strike, pour, dummy }
}

const throwGrenade = (frame: number) => ({ frame, press: ["special" as const], release: ["special" as const] })
const state = (id: StateId, remaining: number = rules[id].seconds, setBy = 100): ActiveState =>
  ({ id, remaining, atk: setBy, nextTick: id === "burning" ? rules.burning.tick : 0, charges: true })

describe("the rule", () => {
  const hit = (id: ElementId) => ({ id, atk: 100 })

  it("every element leaves its own state, from the ATK of whoever set it", () => {
    for (const id of Object.keys(elements) as Array<ElementId>) {
      const { state: after, burst } = afflict(tuning, null, hit(id), true)
      expect(after).toEqual(state(elements[id].state))
      expect(burst).toBeNull()
    }
  })

  it("the same element refreshes its state, keeping the stronger hand and a burn's rhythm", () => {
    const current = { ...state("burning", 1, 300), nextTick: 0.1 }
    const { state: after, burst } = afflict(tuning, current, hit("fire"), false)
    expect(after).toEqual({ id: "burning", remaining: rules.burning.seconds, atk: 300, nextTick: 0.1, charges: true })
    expect(burst).toBeNull()
  })

  it("another element bursts the state, then leaves its own, in any pair and either order", () => {
    for (const first of Object.keys(elements) as Array<ElementId>) {
      for (const second of Object.keys(elements) as Array<ElementId>) {
        if (first === second) continue
        const held = state(elements[first].state)
        const { state: after, burst } = afflict(tuning, held, hit(second), true)
        expect(burst).toEqual(held)
        expect(after?.id).toBe(elements[second].state)
      }
    }
  })

  it("a body immune to the element takes no state, but what it held still bursts", () => {
    const { state: after, burst } = afflict(tuning, state("soaked"), hit("fire"), true, "immune")
    expect(after).toBeNull()
    expect(burst?.id).toBe("soaked")
  })

  it("affinities scale damage; soaked bodies are slowed", () => {
    expect(affinityDamage(tuning, "weak")).toBe(rules.affinity.weak.damage)
    expect(affinityDamage(tuning, undefined)).toBe(1)
    expect(stateSpeed(tuning, { current: state("soaked") })).toBeCloseTo(1 - rules.soaked.slow, 9)
    expect(stateSpeed(tuning, { current: state("burning") })).toBe(1)
  })
})

describe("the grenade's fire", () => {
  it("sets what it hits burning; the burn ticks down and wears off", () => {
    // Without its fire pool, which would keep the dummy burning; a sturdy dummy, so the burn wears off before it falls.
    const noPool = tuningWith({ ...withGrenade({ leaves: null }), enemies: { dummy: { hp: 1000 } } })
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { build: gunner, keys: [throwGrenade(1)], tuning: noPool })
    run.step(steps(grenade.flightTime + grenade.fuse) + 4)
    const hit = 1000 - (atk * grenade.power) / 100
    const [dummy] = run.world().enemies
    expect(dummy!.health).toBeCloseTo(hit, 6)
    expect(dummy!.state?.id).toBe("burning")
    run.step(steps(rules.burning.seconds) + 2)
    const [after] = run.world().enemies
    const burns = Math.floor(rules.burning.seconds / rules.burning.tick)
    expect(after!.state).toBeNull()
    expect(after!.health).toBeCloseTo(hit - burns * burnDps(tuning, atk) * rules.burning.tick, 6)
  })

  it("burn ticks do not refill the grenade's action budget", () => {
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { build: gunner, keys: [throwGrenade(1)] })
    run.step(steps(grenade.flightTime + grenade.fuse) + 4)
    const before = run.world().player.energy
    run.step(steps(1))
    expect(run.world().player.energy).toBe(before)
  })
})

describe("states alone", () => {
  it("burning burns through invulnerability, and gives none, so a burning player can still dodge a blow", () => {
    const run = range([], { x: 200, y: 0 })
    run.putIn(state("burning", 10, 200), "player")
    run.step(steps(rules.burning.tick) + 1)
    const { health, invulnerable } = run.world().player
    expect(health).toBeLessThan(tuning.characters.swordsman.stats.hp)
    expect(invulnerable).toBe(0)
  })

  it("burning spreads to bodies in no state it touches, for the time it has left, and to none apart or in another state", () => {
    const radius = tuning.enemies.dummy.radius
    const touching = { x: 200 + radius * 2 + 2, y: 0 }
    const wet = { x: 200, y: radius * 2 + 2 }
    const run = range([{ x: 200, y: 0 }, touching, wet, { x: 200, y: 300 }], { x: 200, y: 0 })
    run.putIn(state("soaked", 10), wet)
    run.putIn(state("burning", 2), { x: 200, y: 0 })
    run.step(2)
    expect(run.dummy(touching).state?.id).toBe("burning")
    expect(run.dummy(touching).state!.remaining).toBeLessThanOrEqual(2)
    expect(run.dummy(wet).state?.id).toBe("soaked")
    expect(run.dummy({ x: 200, y: 300 }).state).toBeNull()
  })

  it("burning spreads within a side: a burning enemy pressed against the player never sets her alight", () => {
    const touching = { x: tuning.characters.swordsman.radius + tuning.enemies.dummy.radius + 2, y: 0 }
    const run = range([touching], { x: 200, y: 0 })
    run.putIn(state("burning", 2), touching)
    run.step(4)
    expect(run.world().player.state).toBeNull()
  })

  it("soaked slows the player down", () => {
    const right = [{ frame: 0, press: ["right" as const] }]
    const dry = range([], { x: 200, y: 0 }, { keys: right })
    const wet = range([], { x: 200, y: 0 }, { keys: right })
    wet.putIn(state("soaked", 10), "player")
    dry.step(40)
    wet.step(40)
    const moved = (run: typeof dry) => Math.hypot(run.player().position.x - center.x, run.player().position.y - center.y)
    expect(moved(wet) / moved(dry)).toBeCloseTo(1 - rules.soaked.slow, 1)
  })

  it("a blow on a charged body arcs on to the nearest other body of its side, charging it", () => {
    const run = range([{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 200, y: 500 }], { x: 200, y: 0 }, { tuning: sturdy() })
    run.putIn(state("charged"), { x: 200, y: 0 })
    run.strike({ x: 200, y: 0 }, null, 50)
    run.step(4)
    const next = run.dummy({ x: 300, y: 0 })
    expect(next.health).toBeCloseTo(100_000 - 50 * rules.charged.arcShare, 6)
    expect(next.state?.id).toBe("charged")
    expect(run.dummy({ x: 200, y: 500 }).health).toBe(100_000)
  })

  it("a cut of wind sweeps what it hits: light, it glides further", () => {
    const run = range([{ x: 150, y: 0 }], { x: 200, y: 0 }, { keys: [{ frame: 1, press: ["special"], release: ["special"] }], tuning: withWindCut() })
    run.step(4)
    expect(run.world().enemies[0]!.state?.id).toBe("swept")
  })
})

describe("bursts", () => {
  const near = { x: 280, y: 0 }
  const far = { x: 200, y: 500 }
  const struck = { x: 200, y: 0 }
  const field = () => range([struck, near, far], { x: 200, y: 0 }, { tuning: sturdy() })

  it("Flare: water on a burning body pays out the burn left at once, a share to those around, and soaks it", () => {
    const run = field()
    run.putIn(state("burning", 2, 200), struck)
    run.strike(struck, "water")
    run.step(4)
    const left = burnDps(tuning, 200) * 2
    expect(run.dummy(struck).state?.id).toBe("soaked")
    // The blow itself (1), and the burn left at once (the burn's own ticks having stopped).
    expect(100_000 - run.dummy(struck).health).toBeCloseTo(1 + left, 0)
    expect(100_000 - run.dummy(near).health).toBeCloseTo(left * rules.bursts.burning.share, 0)
    expect(run.dummy(far).health).toBe(100_000)
    expect(run.runtime.inspect(Reactions)).toEqual(["burning"])
  })

  it("Splash: another element on a soaked body stops it and those around", () => {
    const run = field()
    run.putIn(state("soaked"), struck)
    run.strike(struck, "fire")
    run.step(4)
    expect(run.dummy(struck).stunned).toBeGreaterThan(0)
    expect(run.dummy(near).stunned).toBeGreaterThan(0)
    expect(run.dummy(far).stunned).toBe(0)
    expect(run.dummy(struck).state?.id).toBe("burning")
  })

  it("Discharge: another element on a charged body strikes those around", () => {
    const run = field()
    run.putIn(state("charged", 4, 200), struck)
    run.strike(struck, "water")
    run.step(4)
    expect(100_000 - run.dummy(near).health).toBeCloseTo((200 * rules.bursts.charged.power) / 100, 6)
    expect(run.dummy(far).health).toBe(100_000)
  })

  it("Gale: another element on a swept body throws those around away from it, stunned", () => {
    const run = field()
    run.putIn(state("swept"), struck)
    run.strike(struck, "thunder")
    run.step(3)
    expect(run.dummy(near).stunned).toBeGreaterThan(0)
    expect(run.dummy(near).position.x - center.x).toBeGreaterThan(near.x)
  })

  it("a burst still goes off when the blow ends the body that held it", () => {
    const run = range([struck, near], { x: 200, y: 0 })
    run.putIn(state("burning", 3, 300), struck)
    run.strike(struck, "water", 100_000)
    // Past the kill's pause.
    run.step(steps(0.5))
    expect(run.world().enemies).toHaveLength(1)
    expect(run.dummy(near).health).toBeLessThan(tuning.enemies.dummy.hp)
  })

  it("never chains: what a burst deals carries no element", () => {
    const run = field()
    run.putIn(state("charged", 4, 200), struck)
    run.putIn(state("burning", 4, 200), near)
    run.strike(struck, "water")
    run.step(4)
    // The discharge struck the burning one, which burns on.
    expect(run.dummy(near).state?.id).toBe("burning")
    expect(run.runtime.inspect(Reactions)).toEqual(["charged"])
  })

  it("on the player a burst deals its damage, and never stops or launches her", () => {
    const run = range([], { x: 200, y: 0 })
    run.putIn(state("swept", 3, 300), "player")
    run.strike("player", "fire")
    // Past the pause of a blow on her.
    run.step(steps(0.5))
    const { health, stunned, knockback } = run.world().player
    expect(health).toBeLessThan(tuning.characters.swordsman.stats.hp - 1)
    expect(stunned).toBe(0)
    expect(Math.hypot(knockback.x, knockback.y)).toBe(0)
    // An enemy's burst is not the team's: nothing recorded.
    expect(run.runtime.inspect(Reactions)).toEqual([])
  })
})

describe("cracked", () => {
  const struck = { x: 200, y: 0 }
  const near = { x: 280, y: 0 }
  const far = { x: 200, y: 500 }
  /** Dummies that take many blows, with a break bar of half their health. */
  const breakable = () => tuningWith({ enemies: { dummy: { hp: 100_000, poise: 0.5 } } })
  const bar = 100_000 * 0.5
  const Bars = Game.Inspector("Test/Bars", { queries: { enemies: Game.Query({ selection: { position: Game.Query.read(Position), poise: Game.Query.read(Poise) }, with: [Enemy] }) } }, ({ queries }) =>
    queries.enemies.each().map(({ data }) => ({ x: data.position.get().x - center.x, y: data.position.get().y - center.y, filled: data.poise.get().current })))
  const filled = (run: ReturnType<typeof range>, at: Vec2) => run.runtime.inspect(Bars).find((enemy) => Math.hypot(enemy.x - at.x, enemy.y - at.y) < 1)!.filled

  it("fills the break bar faster: every blow counts half as much again", () => {
    const run = range([struck, far], { x: 200, y: 0 }, { tuning: breakable() })
    run.putIn(state("cracked"), struck)
    run.strike(struck, null, 1000)
    run.step(1)
    run.strike(far, null, 1000)
    run.step(1)
    expect(filled(run, far)).toBeGreaterThan(0)
    expect(filled(run, struck) / filled(run, far)).toBeCloseTo(1 + rules.cracked.breakBonus, 6)
  })

  it("Shatter: another element on a cracked body fills a large share of its break bar at once, and strikes it and those around", () => {
    const run = range([struck, near, far], { x: 200, y: 0 }, { tuning: breakable() })
    run.putIn(state("cracked", 4, 200), struck)
    run.strike(struck, "water")
    run.step(4)
    const blow = (200 * rules.bursts.cracked.power) / 100
    // The blow itself (1), and the shatter.
    expect(100_000 - run.dummy(struck).health).toBeCloseTo(1 + blow, 6)
    expect(100_000 - run.dummy(near).health).toBeCloseTo(blow * rules.bursts.cracked.share, 6)
    expect(run.dummy(far).health).toBe(100_000)
    expect(filled(run, struck)).toBeGreaterThanOrEqual(bar * rules.bursts.cracked.break)
    expect(rules.bursts.cracked.break).toBeGreaterThan(tuning.breaking.burst)
    expect(run.dummy(struck).state?.id).toBe("soaked")
    expect(run.runtime.inspect(Reactions)).toEqual(["cracked"])
  })
})

describe("swept", () => {
  /** Sweeps the dummies and gives them a push of `push`, as a wind blow would. */
  const drive = (run: ReturnType<typeof range>, push: Vec2) => {
    const Drive = Game.System("Test/Drive", {
      queries: { enemies: Game.Query({ selection: { state: Game.Query.write(ElementState), knockback: Game.Query.write(Knockback) }, with: [Enemy] }) }
    }, ({ queries }) => {
      for (const { data } of queries.enemies.each()) {
        data.state.set({ current: state("swept") })
        data.knockback.set(push)
      }
    })
    run.runtime.tick(Game.Schedule(Drive))
  }

  it("stuns a swept body slammed into a wall, which then stands still", () => {
    // The pillar north of the center: its south face is at 288 + 25.
    const pillar = { x: 0, y: 0.16 * tuning.arena.height + 25 - center.y }
    const run = range([{ x: 0, y: pillar.y + tuning.enemies.dummy.radius + 20 }], { x: 200, y: 0 })
    drive(run, { x: 0, y: -900 })
    run.step(10)
    const [dummy] = run.world().enemies
    expect(dummy!.stunned).toBeGreaterThan(rules.swept.stunSeconds - 0.3)
    // The run notes it, once (discoveries count what a run set off).
    expect(run.runtime.inspect(Reactions)).toEqual(["slam"])
    run.step(steps(rules.swept.stunSeconds))
    expect(run.world().enemies[0]!.stunned).toBe(0)
  })

  it("does not stun a body pushed in the open", () => {
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 })
    drive(run, { x: 900, y: 0 })
    run.step(30)
    expect(run.world().enemies[0]!.stunned).toBe(0)
  })

  it("leaves a stunned enemy's attack on hold", () => {
    const run = range([], { x: 200, y: 0 })
    const Spawn = Game.System("Test/SpawnChaser", {}, ({ commands }) => {
      commands.spawnIn(RunScope, makeEnemy(tuning, "chaser", { x: center.x + 200, y: center.y }))
    })
    run.runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred()))
    const Stun = Game.System("Test/Stun", { queries: { enemies: Game.Query({ selection: { stunned: Game.Query.write(Stunned) }, with: [Enemy] }) } }, ({ queries }) => {
      for (const { data } of queries.enemies.each()) data.stunned.set({ remaining: 1 })
    })
    run.runtime.tick(Game.Schedule(Stun))
    run.step(30)
    const [chaser] = run.world().enemies
    expect(chaser!.position.x - center.x).toBeCloseTo(200, 6)
  })
})

describe("ground", () => {
  it("the grenade leaves a fire pool where it explodes, which runs out", () => {
    const run = range([], { x: 200, y: 0 }, { build: gunner, keys: [throwGrenade(1)] })
    run.step(steps(grenade.flightTime + grenade.fuse) + 4)
    const [pool] = run.world().pools
    expect(pool!.element).toBe("fire")
    // Where the cursor points (within the camera's lead).
    expect(Math.abs(pool!.center.x - center.x - 200)).toBeLessThan(30)
    expect(pool!.radius).toBe(grenade.leaves!.radius)
    run.step(steps(grenade.leaves!.seconds))
    expect(run.world().pools).toEqual([])
  })

  it("burns everyone standing in a fire pool, the player who left it too", () => {
    const run = range([{ x: 300, y: 0 }], { x: 300, y: 0 })
    run.pour([{ element: "fire", at: { x: 0, y: 0 } }, { element: "fire", at: { x: 300, y: 0 } }])
    run.step(steps(1))
    const world = run.world()
    expect(world.player.state?.id).toBe("burning")
    expect(world.player.health).toBeLessThan(tuning.characters.swordsman.stats.hp)
    expect(world.enemies[0]!.state?.id).toBe("burning")
  })

  it("leaves a body that is invulnerable (dashing) alone", () => {
    const run = range([], { x: 300, y: 0 })
    const Shield = Game.System("Test/Invulnerable", { queries: { player: Game.Query({ selection: { invulnerable: Game.Query.write(Invulnerable) }, with: [Player] }) } }, ({ queries }) => {
      for (const { data } of queries.player.each()) data.invulnerable.set({ remaining: 1 })
    })
    run.runtime.tick(Game.Schedule(Shield))
    run.pour([{ element: "fire", at: { x: 0, y: 0 } }])
    run.step(10)
    expect(run.world().player.state).toBeNull()
  })

  it("never bursts a state: a burning body in a puddle burns on", () => {
    const run = range([], { x: 300, y: 0 })
    run.putIn(state("burning", 10), "player")
    run.pour([{ element: "water", at: { x: 0, y: 0 } }])
    run.step(2)
    expect(run.world().player.state?.id).toBe("burning")
    expect(run.runtime.inspect(Reactions)).toEqual([])
  })

  it("the newer pool puts out an older one of another element where they meet, and only there", () => {
    const run = range([], { x: 300, y: 0 })
    run.pour([{ element: "fire", at: { x: 400, y: 0 } }, { element: "fire", at: { x: -400, y: 0 } }])
    run.step(2)
    run.pour([{ element: "water", at: { x: 520, y: 0 }, radius: 60 }])
    run.step(2)
    expect(run.world().pools.map((pool) => pool.element).sort()).toEqual(["fire", "water"])
    expect(run.world().pools.find((pool) => pool.element === "fire")!.center.x - center.x).toBeCloseTo(-400, 6)
  })
})

describe("affinities", () => {
  // Sturdy dummies, so the blast never fells one before its state is read.
  const noPool = (elements: object) => withGrenade({ leaves: null }, tuningWith({ enemies: { dummy: { elements, hp: 1000 } } }))
  const blast = (atk * grenade.power) / 100

  it("an enemy weak to an element takes more of its damage, and its state lasts longer", () => {
    const weak = noPool({ fire: "weak" })
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { build: gunner, keys: [throwGrenade(1)], tuning: weak })
    run.step(steps(grenade.flightTime + grenade.fuse) + 4)
    const [dummy] = run.world().enemies
    expect(dummy!.health).toBeCloseTo(1000 - blast * rules.affinity.weak.damage, 6)
    expect(dummy!.state!.remaining).toBeGreaterThan(rules.burning.seconds)
  })

  it("an immune enemy takes the damage, but not the state", () => {
    const immune = noPool({ fire: "immune" })
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { build: gunner, keys: [throwGrenade(1)], tuning: immune })
    run.step(steps(grenade.flightTime + grenade.fuse) + 4)
    const [dummy] = run.world().enemies
    expect(dummy!.health).toBeCloseTo(1000 - blast, 6)
    expect(dummy!.state).toBeNull()
  })

  it("an enemy immune to wind is pushed by its blow, but not swept", () => {
    const immune = withWindCut(tuningWith({ enemies: { dummy: { elements: { wind: "immune" } } } }))
    const run = range([{ x: 150, y: 0 }], { x: 200, y: 0 }, { keys: [{ frame: 1, press: ["special"], release: ["special"] }], tuning: immune })
    run.step(4)
    const [dummy] = run.world().enemies
    expect(dummy!.health).toBeLessThan(tuning.enemies.dummy.hp)
    expect(dummy!.state).toBeNull()
  })

  it("the brute is immune to wind, and every enemy answers to at least two elements", () => {
    expect(tuning.enemies.brute.elements.wind).toBe("immune")
    for (const enemy of Object.values(tuning.enemies)) {
      expect(Object.values(enemy.elements).filter((affinity) => affinity === "immune").length).toBeLessThanOrEqual(1)
    }
  })
})
