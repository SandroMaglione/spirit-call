/**
 * Champions (see `Tuning.champions` and docs/enemies.md): an elite pushed
 * further, the hardest enemy of a challenge, that stays across waves and must
 * fall before the challenge clears.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { champion, clearWaves, entryChampion } from "../src/content/challenges.ts"
import type { ChallengeSpec } from "../src/content/challenges.ts"
import { validateContent } from "../src/content/validate.ts"
import { enemyStats } from "../src/features/enemies.ts"
import { knockbackTaken } from "../src/features/motion.ts"
import { poiseOf } from "../src/features/poise.ts"
import { Attacker, Body, CombatStats, ElementAffinities, Elite, Enemy, Game, Health, Invulnerable, Player, Waves } from "../src/schema.ts"
import { start } from "./helpers.ts"

const steps = (seconds: number) => Math.ceil(seconds / engine.stepSeconds)
const rules = defaultTuning.champions

/** The default tuning with the swarm challenge replaced by `spec`. */
const withChallenge = (spec: Partial<ChallengeSpec>): Tuning => ({
  ...defaultTuning,
  challenges: { ...defaultTuning.challenges, swarm: { ...defaultTuning.challenges.swarm, ...spec } }
})

const Field = Game.Inspector("Test/Champions", {
  queries: {
    enemies: Game.Query({
      selection: {
        enemy: Game.Query.read(Enemy),
        health: Game.Query.read(Health),
        stats: Game.Query.read(CombatStats),
        body: Game.Query.read(Body),
        affinities: Game.Query.read(ElementAffinities),
        elite: Game.Query.optional(Elite),
        attacker: Game.Query.read(Attacker)
      }
    })
  },
  resources: { waves: Game.System.readResource(Waves) }
}, ({ queries, resources }) => ({
  waves: resources.waves.get(),
  enemies: queries.enemies.each().map(({ entity, data }) => ({
    id: entity.id.value,
    kind: data.enemy.get().kind,
    champion: data.enemy.get().champion,
    health: data.health.get(),
    stats: data.stats.get(),
    radius: data.body.get().radius,
    affinities: data.affinities.get(),
    element: data.elite.present ? data.elite.get().element : null,
    cooldown: data.attacker.get().cooldown
  }))
}))

/** Removes every enemy but champions as soon as it appears; with `champions`, champions too. */
const wipe = (champions: boolean) => Game.System("Test/Wipe", { queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) } }, ({ queries, commands }) => {
  for (const { entity, data } of queries.enemies.each()) if (champions || !data.enemy.get().champion) commands.despawn(entity.id)
})

/** Keeps the player untouchable, so only the objective ends the run. */
const Shield = Game.System("Test/Shield", { queries: { player: Game.Query({ selection: { invulnerable: Game.Query.write(Invulnerable) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.invulnerable.set({ remaining: 10 })
})

/** The swarm challenge (replaced by the test's) with waves on, stepped with the field wiped as it comes. */
const play = (tuning: Tuning) => {
  const run = start({ tuning, waves: true, challenge: "swarm" })
  const flow = () => run.runtime.debug.dump().machines["Shooter/Flow"]?.current
  const tick = (count: number, champions: boolean) => {
    for (let index = 0; index < count; index++) {
      run.runtime.tick(Game.Schedule(Shield, wipe(champions), Game.Schedule.applyDeferred()))
      run.step()
    }
  }
  return { ...run, flow, tick, field: () => run.runtime.inspect(Field) }
}

const timing = defaultTuning.waves
const perWave = timing.breakDuration + timing.spawnInterval * 3 + timing.spawnWarning + 1

describe("champions", () => {
  it("come alone, bigger, much tougher, stronger, faster, and carrying their element like an elite", () => {
    const run = start({ tuning: withChallenge({ objective: clearWaves(), waves: { scripted: [[champion("chaser", "fire")]], endless: null } }), waves: true, challenge: "swarm" })
    run.step(steps(timing.firstDelay + timing.spawnWarning) + 3)
    const [one, ...rest] = run.runtime.inspect(Field).enemies
    // Chasers come in groups; a champion comes alone.
    expect(rest).toEqual([])
    const base = enemyStats(defaultTuning, "chaser", 1)
    expect(one).toMatchObject({ kind: "chaser", champion: true, element: "fire" })
    expect(one!.health.max).toBe(Math.round(base.hp * rules.health))
    expect(one!.stats.atk).toBe(Math.round(base.atk * rules.atk))
    expect(one!.stats.speed).toBeCloseTo(base.speed * rules.speed, 6)
    expect(one!.radius).toBeCloseTo(defaultTuning.enemies.chaser.radius * rules.scale, 6)
    expect(one!.affinities.fire).toBe("immune")
  })

  it("are pushed less, and break on a smaller share of their health", () => {
    expect(knockbackTaken(defaultTuning, "brute", true)).toBeCloseTo(knockbackTaken(defaultTuning, "brute") * rules.knockback, 9)
    expect(poiseOf(defaultTuning, "brute", 1000, true)).toBeCloseTo(poiseOf(defaultTuning, "brute", 1000) * rules.poise, 9)
  })

  it("wait less between attacks, with their kind's telegraphs", () => {
    // A brute champion next to the player: after its first attack, it waits its cooldown times the champions' share.
    const run = start({ tuning: withChallenge({ objective: clearWaves(), waves: { scripted: [[champion("brute", "thunder")]], endless: null } }), waves: true, challenge: "swarm" })
    run.runtime.tick(Game.Schedule(Shield))
    let longest = 0
    for (let step = 0; step < steps(12); step++) {
      run.runtime.tick(Game.Schedule(Shield))
      run.step()
      const brute = run.runtime.inspect(Field).enemies.find((enemy) => enemy.champion)
      if (brute !== undefined) longest = Math.max(longest, brute.cooldown)
    }
    const slowest = Math.max(...defaultTuning.enemies.brute.attacks.map((attack) => attack.cooldown))
    expect(longest).toBeGreaterThan(0)
    expect(longest).toBeLessThanOrEqual(slowest * rules.cooldown + 1e-9)
  })

  it("stay across waves: the next wave comes while the champion stands, and the challenge clears only once it has fallen", () => {
    const run = play(withChallenge({ objective: clearWaves(), waves: { scripted: [[champion("brute", "fire"), "chaser"], ["chaser"], ["chaser"]], endless: null } }))
    // Every other enemy falls at once: the waves go on around the champion.
    run.tick(steps(timing.firstDelay + perWave * 3), false)
    const field = run.field()
    expect(field.waves.number).toBe(3)
    expect(field.enemies.map((enemy) => enemy.champion)).toEqual([true])
    // The last wave is down, but the champion stands: not cleared.
    expect(field.waves.phase).toBe("fighting")
    expect(run.flow()).toBe("Playing")
    run.tick(steps(perWave), true)
    expect(run.flow()).toBe("Cleared")
  })

  it("ship in each chapter's finale, never as a kind that keeps its distance", () => {
    const finales = ["brute", "highTide", "warlord"] as const
    for (const id of finales) {
      expect(defaultTuning.challenges[id].waves.scripted.flat().filter(entryChampion)).toHaveLength(1)
    }
    expect(validateContent(defaultTuning)).toEqual([])
    const sniper = withChallenge({ objective: clearWaves(), waves: { scripted: [[champion("sniper", "thunder")]], endless: null } })
    expect(validateContent(sniper)).toContain("challenge swarm: wave 1 has a champion sniper, which keeps its distance (champions are melee or area kinds)")
  })

  it("join Enemy Practice when asked: a champion of the first pick that fights up close, with the others", () => {
    const run = start({ flow: "Menu", waves: true })
    run.requests.pending.push({ kind: "start", team: [{ character: "swordsman" }], challenge: "practice", enemyLevel: 1, practice: { kinds: ["sniper", "chaser"], elites: false, champion: true } })
    run.step(steps(timing.firstDelay + 10 * timing.spawnInterval + timing.spawnWarning) + 3)
    const champions = run.runtime.inspect(Field).enemies.filter((enemy) => enemy.champion)
    expect(champions.map((enemy) => enemy.kind)).toEqual(["chaser"])
    expect(champions[0]!.element).not.toBeNull()
  })
})
