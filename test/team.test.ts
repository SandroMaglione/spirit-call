import { describe, expect, it } from "vitest"
import type { Vec2 } from "@typeonce/bevy-ts-math/Vec2"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { nextAlive } from "../src/features/team.ts"
import { Disc, ElementState, Energy, Game, Health, Invulnerable, Member, Player, Position, Skills, SlowMotion, Stats, TeamSwitch, BasicAttack } from "../src/schema.ts"
import type { ActiveState, BuildValue } from "../src/schema.ts"
import { ReadFlow, cursorAt, doubleTap, placeDummies, start, steps, plainAttack } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const tuning = defaultTuning
const swordsman: BuildValue = { character: "swordsman" }
const gunner: BuildValue = { character: "gunner" }
const tidecaller: BuildValue = { character: "tidecaller" }

const TeamState = Game.Inspector("Test/Team", {
  queries: {
    members: Game.Query({
      selection: {
        member: Game.Query.read(Member),
        health: Game.Query.read(Health),
        energy: Game.Query.read(Energy),
        skills: Game.Query.read(Skills),
        state: Game.Query.read(ElementState),
        basicAttack: Game.Query.read(BasicAttack),
        position: Game.Query.optional(Position),
        invulnerable: Game.Query.optional(Invulnerable),
        player: Game.Query.optional(Player)
      }
    }),
    discs: Game.Query({ selection: { disc: Game.Query.read(Disc) } })
  },
  resources: { teamSwitch: Game.System.readResource(TeamSwitch) }
}, ({ queries, resources }) => ({
  members: queries.members.each()
    .map(({ data }) => ({
      ...data.member.get(),
      health: data.health.get().current,
      energy: data.energy.get().current,
      special: data.skills.get().special.cooldown,
      state: data.state.get().current,
      step: data.basicAttack.get().step,
      position: data.position.present ? data.position.get() : undefined,
      invulnerable: data.invulnerable.present ? data.invulnerable.get().remaining : undefined,
      onField: data.player.present
    }))
    .sort((left, right) => left.slot - right.slot),
  discs: queries.discs.each().length,
  switchCooldown: resources.teamSwitch.get().cooldown
}))

/** Fills every member's energy: ultimates ready. */
const ChargeTeam = Game.System("Test/ChargeTeam", {
  queries: { members: Game.Query({ selection: { energy: Game.Query.write(Energy) } }) }
}, ({ queries }) => {
  for (const { data } of queries.members.each()) data.energy.set({ current: tuning.energy.max })
})

/** A run with `team`; `world()` is the team's state, `field()` the one on the field. */
const run = (team: ReadonlyArray<BuildValue>, options: StartOptions = {}) => {
  const started = start({ ...options, team })
  const world = () => started.runtime.inspect(TeamState)
  return { ...started, world, field: () => world().members.find((member) => member.onField) }
}

/** A schedule that sets the member in `slot` in `state` (burning or soaked). */
const putIn = (slot: number, state: ActiveState) => {
  const Put = Game.System("Test/PutInState", {
    queries: { members: Game.Query({ selection: { member: Game.Query.read(Member), state: Game.Query.write(ElementState) } }) }
  }, ({ queries }) => {
    for (const { data } of queries.members.each()) if (data.member.get().slot === slot) data.state.set({ current: state })
  })
  return Game.Schedule(Put)
}

/** A fire that burns `dps` for `seconds`. */
const fire = (dps: number, seconds = 30): ActiveState => ({ id: "burning", remaining: seconds, atk: (dps * 100) / defaultTuning.elements.burning.power, nextTick: 0.01, charges: false })

const Tallied = Game.Inspector("Test/Tally", { resources: { stats: Game.System.readResource(Stats) } }, ({ resources }) => resources.stats.get().tally)

const flowOf = (started: ReturnType<typeof start>) => started.runtime.inspect(ReadFlow)

describe("a team in the arena", () => {
  it("starts with the first one on the field and the others on the bench, with no body", () => {
    const team = run([swordsman, gunner, tidecaller])
    const [first, second, third] = team.world().members
    expect(first).toMatchObject({ slot: 0, character: "swordsman", onField: true })
    expect(first?.position).toBeDefined()
    expect(second).toMatchObject({ slot: 1, character: "gunner", onField: false, position: undefined })
    expect(third).toMatchObject({ slot: 2, character: "tidecaller", onField: false, position: undefined })
  })

  it("holds three at most", () => {
    const team = run([swordsman, gunner, tidecaller, swordsman])
    expect(team.world().members.map((member) => member.character)).toEqual(["swordsman", "gunner", "tidecaller"])
  })
})

describe("switching", () => {
  it("brings in a slot's character where the body stood, and takes the last one off the field", () => {
    const team = run([swordsman, gunner], { keys: [{ frame: 0, press: ["right"] }, { frame: 20, press: ["team2"], release: ["team2"] }] })
    team.step(20)
    const before = team.field()!.position!
    team.step()
    const [first, second] = team.world().members
    expect(first?.onField).toBe(false)
    expect(first?.position).toBeUndefined()
    expect(second?.onField).toBe(true)
    // Where the body was after its last step on the field, give or take that step's movement.
    expect(Math.hypot(second!.position!.x - before.x, second!.position!.y - before.y)).toBeLessThan(tuning.characters.swordsman.stats.speed / 60 + 1)
  })

  it("interrupts what the outgoing one was doing: her combo starts over", () => {
    const team = run([swordsman, gunner], {
      pointer: [{ frame: 0, move: cursorAt({ x: 100, y: 0 }) }, { frame: 1, press: ["primary"], release: ["primary"] }],
      keys: [{ frame: 3, press: ["team2"], release: ["team2"] }]
    })
    team.step(3)
    expect(team.world().members[0]?.step).toBe(0)
    team.step()
    expect(team.world().members[0]?.step).toBe(-1)
  })

  it("waits between switches", () => {
    const wait = tuning.team.switchCooldown
    const team = run([swordsman, gunner], {
      keys: [
        { frame: 0, press: ["team2"], release: ["team2"] },
        { frame: 5, press: ["team1"], release: ["team1"] },
        { frame: steps(wait) + 5, press: ["team1"], release: ["team1"] }
      ]
    })
    team.step(10)
    expect(team.field()?.slot).toBe(1)
    team.step(steps(wait))
    expect(team.field()?.slot).toBe(0)
  })

  it("never mid-dash", () => {
    const team = run([swordsman, gunner], { keys: [...doubleTap("right", 0), { frame: 3, press: ["team2"], release: ["team2"] }] })
    team.step(5)
    expect(team.field()?.slot).toBe(0)
  })

  it("does nothing for an empty slot", () => {
    const team = run([swordsman], { keys: [{ frame: 0, press: ["team2"], release: ["team2"] }] })
    team.step(3)
    expect(team.field()?.slot).toBe(0)
  })

  it("works from a tap on her row of the party list", () => {
    const team = run([swordsman, gunner, tidecaller], { party: [{ frame: 0, slot: 2, ultimate: false }] })
    team.step(2)
    expect(team.field()?.character).toBe("tidecaller")
  })

  it("switches in and uses her ultimate at once from a tap on its icon, as Genshin's party list", () => {
    const team = run([swordsman, gunner], { party: [{ frame: 1, slot: 1, ultimate: true }] })
    team.runtime.tick(Game.Schedule(ChargeTeam))
    team.step(1)
    expect(team.world().members[1]!.energy).toBe(tuning.energy.max)
    team.step(3)
    expect(team.field()?.character).toBe("gunner")
    // Her energy went into the ultimate; the one who left keeps hers.
    expect(team.world().members[1]!.energy).toBeLessThan(tuning.energy.max)
    expect(team.world().members[0]!.energy).toBe(tuning.energy.max)
  })

  it("drops the ultimate when the switch has to wait, so it never goes off later on its own", () => {
    const team = run([swordsman, gunner], { party: [{ frame: 0, slot: 1, ultimate: false }, { frame: 3, slot: 0, ultimate: true }] })
    team.runtime.tick(Game.Schedule(ChargeTeam))
    team.step(steps(tuning.team.switchCooldown) + 10)
    expect(team.field()?.character).toBe("gunner")
    expect(team.world().members[0]!.energy).toBe(tuning.energy.max)
  })
})

describe("the bench", () => {
  it("runs skill cooldowns down", () => {
    // Gust keeps her in the air for a moment (no switching meanwhile): she switches out once she lands.
    const gust = tuning.skills.bladeWave.effect
    const landed = steps((gust.kind === "plunge" ? gust.rise + gust.dive : 0) + 0.2)
    const team = run([swordsman, gunner], { keys: [{ frame: 0, press: ["special"], release: ["special"] }, { frame: landed, press: ["team2"], release: ["team2"] }] })
    team.step(landed + 2)
    const benched = team.world().members[0]!.special
    expect(benched).toBeGreaterThan(0)
    team.step(60)
    expect(team.world().members[0]!.special).toBeCloseTo(Math.max(0, benched - 1), 1)
  })

  it("gains a share of the energy the one on the field earns", () => {
    const team = run([swordsman, gunner], { pointer: [{ frame: 0, move: cursorAt({ x: 50, y: 0 }) }, { frame: 2, press: ["primary"], release: ["primary"] }] })
    team.runtime.tick(placeDummies([{ x: 50, y: 0 }]))
    team.step(40)
    const [field, bench] = team.world().members
    expect(field!.energy).toBeGreaterThan(0)
    expect(bench!.energy).toBeCloseTo(field!.energy * tuning.team.benchEnergyShare, 6)
  })

  it("keeps a character's state: a fire she carries off keeps burning, and can make her fall there", () => {
    const team = run([swordsman, gunner], { keys: [{ frame: 0, press: ["team2"], release: ["team2"] }] })
    team.step()
    team.runtime.tick(putIn(0, fire(40)))
    team.step(30)
    const burning = team.world().members[0]!
    expect(burning.onField).toBe(false)
    expect(burning.state?.id).toBe("burning")
    expect(burning.health).toBeLessThan(tuning.characters.swordsman.stats.hp)
    team.step(steps(10))
    const fallen = team.world().members[0]!
    expect(fallen.health).toBe(0)
    expect(fallen.state).toBeNull()
    // The run goes on with the one on the field.
    expect(flowOf(team)).toBe("Playing")
    expect(team.field()?.slot).toBe(1)
  })

  it("can't bring a fallen character back in", () => {
    const team = run([swordsman, gunner], { keys: [{ frame: 0, press: ["team2"], release: ["team2"] }, { frame: 600, press: ["team1"], release: ["team1"] }] })
    team.step()
    team.runtime.tick(putIn(0, fire(400)))
    team.step(605)
    expect(team.world().members[0]!.health).toBe(0)
    expect(team.field()?.slot).toBe(1)
  })
})

const Beat = Game.Inspector("Test/Beat", { resources: { slow: Game.System.readResource(SlowMotion) } }, ({ resources }) => resources.slow.get().remaining)

describe("falling", () => {
  it("brings in the next one alive in order, protected for a moment; the run is lost when the whole team has fallen", () => {
    const team = run([swordsman, gunner, tidecaller])
    team.runtime.tick(putIn(0, fire(400)))
    let guard = 0
    while (team.world().members[0]!.health > 0 && guard++ < 600) team.step()
    team.step()
    const incoming = team.field()!
    expect(incoming.slot).toBe(1)
    expect(incoming.invulnerable).toBeGreaterThan(tuning.team.fallProtection - 0.1)
    // A beat as she comes in: the enemies slow for a moment.
    expect(team.runtime.inspect(Beat)).toBeGreaterThan(0)
    expect(flowOf(team)).toBe("Playing")

    team.runtime.tick(putIn(1, fire(400)))
    team.runtime.tick(putIn(2, fire(400)))
    guard = 0
    while (flowOf(team) === "Playing" && guard++ < 1200) team.step()
    expect(flowOf(team)).toBe("GameOver")
    expect(team.field()).toBeUndefined()
  })

  it("tallies for stars each one who falls and the team's health left (fallen members count none), and each ultimate used", () => {
    const team = run([swordsman, gunner])
    team.runtime.tick(putIn(0, fire(400)))
    let guard = 0
    while (team.world().members[0]!.health > 0 && guard++ < 600) team.step()
    team.step()
    const max = tuning.characters.swordsman.stats.hp + tuning.characters.gunner.stats.hp
    const left = team.world().members[1]!.health
    // A burn's ticks are no blows: no hit taken, but a fall.
    expect(team.runtime.inspect(Tallied)).toMatchObject({ falls: 1, hitsTaken: 0, healthLeft: Math.floor((left / max) * 100), ultimates: 0 })

    const ultimate = run([swordsman, gunner], { party: [{ frame: 1, slot: 1, ultimate: true }] })
    ultimate.runtime.tick(Game.Schedule(ChargeTeam))
    ultimate.step(4)
    expect(ultimate.runtime.inspect(Tallied)).toMatchObject({ ultimates: 1, falls: 0, healthLeft: 100 })
  })

  it("holds the one coming in while the one who fell goes down, the enemies crawling; her protection counts from when she steps in", () => {
    // She holds a direction from the start: she stands still all the same until the beat is over.
    const team = run([swordsman, gunner], { keys: [{ frame: 0, press: ["right"] }] })
    team.runtime.tick(putIn(0, fire(400)))
    let guard = 0
    while (team.world().members[0]!.health > 0 && guard++ < 600) team.step()
    team.step()
    const beat = tuning.team.fallBeat.seconds
    const from = team.field()!.position!
    team.step(steps(beat) - 3)
    expect(team.field()!.position).toEqual(from)
    expect(team.field()!.invulnerable).toBeGreaterThan(tuning.team.fallProtection)
    team.step(10)
    expect(team.field()!.position).not.toEqual(from)
  })

  it("goes around the order to find who is left", () => {
    const members = [{ slot: 0, alive: true }, { slot: 1, alive: false }, { slot: 2, alive: false }]
    expect(nextAlive(members, 2)?.slot).toBe(0)
    expect(nextAlive(members, 0)).toBeUndefined()
    expect(nextAlive([{ slot: 0, alive: true }, { slot: 1, alive: true }, { slot: 2, alive: true }], 1)?.slot).toBe(2)
  })
})

describe("what a character leaves behind", () => {
  it("a disc on its way back to a thrower who left the field is dropped", () => {
    const aim: Vec2 = { x: 200, y: 0 }
    const team = run([tidecaller, swordsman], {
      pointer: [{ frame: 0, move: cursorAt(aim) }, { frame: 1, press: ["primary"], release: ["primary"] }],
      keys: [{ frame: 3, press: ["team2"], release: ["team2"] }]
    })
    team.step(4)
    expect(team.world().discs).toBe(1)
    // Out to its range, then it would come back: there is no one to come back to.
    const out = plainAttack(tuning, "disc").combo[0]!
    team.step(steps(("range" in out ? out.range : 0) / ("speed" in out ? out.speed : 1)) + 5)
    expect(team.world().discs).toBe(0)
  })

})

describe("tuning", () => {
  it("is live: the wait between switches comes from the tuning", () => {
    const quick = tuningWith({ team: { switchCooldown: 0.1 } })
    const team = run([swordsman, gunner], {
      tuning: quick,
      keys: [{ frame: 0, press: ["team2"], release: ["team2"] }, { frame: 10, press: ["team1"], release: ["team1"] }]
    })
    team.step(12)
    expect(team.field()?.slot).toBe(0)
  })
})
