import * as Random from "@typeonce/ritmo-math/Random"
import { Descriptor } from "@typeonce/ritmo"
import { Keyboard, Pointer, Touch } from "@typeonce/ritmo-browser"
import { NodeRegistry, RenderSync } from "@typeonce/ritmo-render"
import { describe, expect, it } from "vitest"

import { keyBindings, scriptedPartyTaps, touchButtons } from "../src/config/input.ts"
import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { ApplyDevCommands, DevCommands, emptyDevCommands, setAt } from "../src/dev/commands.ts"
import { makeStress, stressTuning } from "../src/dev/stress.ts"
import { EnemyOptionalParts, makeEnemy } from "../src/features/enemies.ts"
import { initialMachines, initialResources } from "../src/runtime.ts"
import { fixedUpdate, setup } from "../src/schedules.ts"
import { Dash, FrameContext, Game, HitStop, KeyboardInput, PartyInput, Player, PointerInput, Renderable, RunScope, Time, TouchInput, Tuning, Enemy } from "../src/schema.ts"
import { defaultViewport } from "../src/simulation.ts"
import { ReadFlow, doubleTap, gunner, start, withGun, expectOk } from "./helpers.ts"

const HitStopState = Game.Inspector("Test/HitStopState", {
  resources: { hitStop: Game.System.readResource(HitStop), time: Game.System.readResource(Time) },
  queries: { player: Game.Query({ selection: { dash: Game.Query.read(Dash) }, with: [Player] }) }
}, ({ resources, queries }) => ({
  hitStop: resources.hitStop.get().remaining,
  step: resources.time.get().step,
  dash: queries.player.each()[0]?.data.dash.get()
}))

describe("hit-stop", () => {
  it("freezes gameplay for the tuned time on a kill, without losing input pressed meanwhile", () => {
    const tuning = withGun(tuningWith({ feedback: { hitStopOnKill: 0.1 } }), { power: 1000, speed: 1_000_000, range: 100_000 })
    // A dummy right in front of the player dies to the first shot.
    const run = start({ tuning, build: gunner, pointer: [{ frame: 0, move: { x: 900, y: 360 }, press: ["primary"], release: ["primary"] }] })
    const Spawn = Game.System("Test/SpawnTarget", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
      commands.spawnIn(RunScope, makeEnemy(tuning, "dummy", { x: 1000, y: 800 }))
    })
    expectOk(run.runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred())))
    const frozen = () => run.runtime.inspect(HitStopState).hitStop > 1e-9

    // Step 1 fires, step 2 hits and kills: the freeze starts in that same step
    // (the `frozen` check sees the hit-stop ApplyDamage just started).
    run.step(2)
    expect(frozen()).toBe(true)
    const frozenPlayer = run.player()
    run.step(Math.floor(0.1 / engine.step.dt) - 2)
    expect(frozen()).toBe(true)
    expect(run.player()).toEqual(frozenPlayer)
    run.step(3)
    expect(frozen()).toBe(false)
  })

  it("delivers a dash pressed during a hit-stop when the game resumes", () => {
    const tuning = withGun(tuningWith({ feedback: { hitStopOnKill: 0.2 } }), { power: 1000, speed: 1_000_000, range: 100_000 })
    const run = start({ tuning, build: gunner,
      pointer: [{ frame: 0, move: { x: 900, y: 360 }, press: ["primary"], release: ["primary"] }],
      keys: doubleTap("right", 2)
    })
    const Spawn = Game.System("Test/SpawnTarget", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
      commands.spawnIn(RunScope, makeEnemy(tuning, "dummy", { x: 1000, y: 800 }))
    })
    expectOk(run.runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred())))
    run.step(Math.ceil(0.2 / engine.step.dt) + 6)
    expect(run.player().dash.cooldown).toBeGreaterThan(0)
  })
})

describe("live tuning", () => {
  it("applies queued edits to the Tuning resource", () => {
    const queue = emptyDevCommands()
    queue.edits.push({ path: ["dash", "distance"], value: 999 }, { path: ["waves", "enabled"], value: false })
    const made = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(DevCommands, queue)),
      resources: { Tuning: defaultTuning, Rng: Random.seed(1) }
    })
    if (!made.ok) throw new Error("the random seed did not validate")
    const runtime = made.value
    const ReadTuning = Game.Inspector("Test/Tuning", { resources: { tuning: Game.System.readResource(Tuning) } }, ({ resources }) => resources.tuning.get())
    expectOk(runtime.tick(Game.Schedule(ApplyDevCommands)))
    const tuning = runtime.inspect(ReadTuning)
    expect(tuning.dash.distance).toBe(999)
    expect(tuning.waves.enabled).toBe(false)
    expect(tuning.dash.duration).toBe(defaultTuning.dash.duration)
    expect(queue.edits).toEqual([])
    expect(defaultTuning.dash.distance).not.toBe(999)
    expect(setAt(defaultTuning, ["characters", "swordsman", "stats", "hp"], 5).characters.swordsman.stats.hp).toBe(5)
  })
})

describe("determinism", () => {
  it("replays a 40 s run with waves and input to the identical world", () => {
    const keys = Array.from({ length: 40 }, (_, second) => [
      { frame: second * 60, press: [(["up", "right", "down", "left"] as const)[second % 4]!] },
      { frame: second * 60 + 27, release: [(["up", "right", "down", "left"] as const)[second % 4]!] },
      ...doubleTap((["up", "right", "down", "left"] as const)[second % 4]!, second * 60 + 28, { hold: true }),
      { frame: second * 60 + 55, release: [(["up", "right", "down", "left"] as const)[second % 4]!] }
    ]).flat()
    const pointer = Array.from({ length: 80 }, (_, half) => ({
      frame: half * 30,
      move: { x: 640 + Math.cos(half) * 300, y: 360 + Math.sin(half) * 200 },
      ...(half % 2 === 0 ? { press: ["primary" as const] } : { release: ["primary" as const] })
    }))
    const play = () => {
      const run = start({ waves: true, keys, pointer })
      run.step(40 * 60)
      const dump = run.runtime.debug.dump()
      return { entities: dump.entities, resources: dump.resources, machines: dump.machines }
    }
    const first = play()
    expect(first.resources["Shooter/Stats"]).not.toEqual({ kills: 0, shots: 0 })
    expect(play()).toEqual(first)
    // Two 40 s runs: a few seconds alone, more alongside the other test files.
  }, 30_000)
})

describe("render sync under multi-rate ticking", () => {
  it("never leaks nodes when several fixed steps run per rendered frame", () => {
    const TestNodes = Descriptor.Service<NodeRegistry.NodeRegistry<{ readonly id: number }>>()("Test/Nodes")
    const registry = NodeRegistry.make<{ readonly id: number }>({ attach: () => {}, detach: () => {} })
    const Sync = RenderSync.system(Game, {
      name: "Test/Sync",
      renderable: Renderable,
      transform: Renderable,
      registry: TestNodes,
      create: ({ entity }) => ({ id: entity }),
      apply: () => {}
    })
    const Count = Game.Inspector("Test/Renderables", {
      queries: { all: Game.Query({ selection: { renderable: Game.Query.read(Renderable) } }) }
    }, ({ queries }) => queries.all.each().length)

    const tuning = stressTuning()
    const made = Game.Runtime.make({
      services: Game.Runtime.services(
        Game.Runtime.service(KeyboardInput, Keyboard.scripted(keyBindings, [])),
        Game.Runtime.service(PointerInput, Pointer.scripted([])),
        Game.Runtime.service(TouchInput, Touch.scripted(touchButtons, [])),
        Game.Runtime.service(PartyInput, scriptedPartyTaps([])),
        Game.Runtime.service(FrameContext, { viewport: defaultViewport }),
        Game.Runtime.service(TestNodes, registry),
        ),
      resources: initialResources(tuning, defaultViewport),
      machines: initialMachines()
    })
    if (!made.ok) throw new Error(JSON.stringify(made.error))
    const runtime = made.value
    const stress = makeStress(tuning, { enemies: 20, projectiles: 300 })
    expectOk(runtime.tick(setup))
    expectOk(runtime.tick(Game.Schedule(stress.populate, stress.topUp, Game.Schedule.applyDeferred())))
    const step = Game.Schedule(fixedUpdate, stress.topUp, Game.Schedule.applyDeferred())
    const render = Game.Schedule(Sync)

    // 1 to 5 fixed steps per rendered frame, like a slow display catching up.
    for (let frame = 0; frame < 120; frame++) {
      for (let fixed = 0; fixed <= frame % 5; fixed++) expectOk(runtime.tick(step))
      expectOk(runtime.tick(render))
      expect(registry.size).toBe(runtime.inspect(Count))
    }
  })
})

describe("hit-stop and game over", () => {
  it("still ends the run when the killing hit also starts a hit-stop", () => {
    // The hit that kills the player starts a player-hit hit-stop in the same step.
    // Game-over detection must not be skipped by it, or the Death event is lost.
    const tuning = tuningWith({ characters: { swordsman: { stats: { hp: 5 } } }, feedback: { hitStopOnPlayerHit: 0.2 } })
    const run = start({ tuning })
    const Spawn = Game.System("Test/SpawnChaser", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
      commands.spawnIn(RunScope, makeEnemy(tuning, "chaser", { x: 1000, y: 900 }))
    })
    expectOk(run.runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred())))
    const flow = () => run.runtime.inspect(ReadFlow)
    for (let step = 0; step < 300 && flow() === "Playing"; step++) run.step()
    expect(flow()).toBe("GameOver")
  })
})

