import { Descriptor } from "@typeonce/bevy-ts"
import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"
import { NodeRegistry, RenderSync } from "@typeonce/bevy-ts-pixi"
import { describe, expect, it } from "vitest"

import { keyBindings } from "../src/config/input.ts"
import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { ApplyDevCommands, DevCommands, emptyDevCommands, setAt } from "../src/dev/commands.ts"
import { makeStress, stressTuning } from "../src/dev/stress.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { initialMachines, initialResources } from "../src/runtime.ts"
import { fixedUpdate, setup } from "../src/schedules.ts"
import { Dash, FrameContext, Game, HitStop, KeyboardInput, Player, PointerInput, Renderable, RunScope, Time, Tuning } from "../src/schema.ts"
import { defaultViewport } from "../src/simulation.ts"
import { start } from "./helpers.ts"

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
    const tuning = tuningWith({ feedback: { hitStopOnKill: 0.1 }, weapon: { damage: 1000, fireInterval: 10, projectileSpeed: 1_000_000, range: 100_000 } })
    // A dummy right in front of the player dies to the first shot.
    const run = start({ tuning, pointer: [{ frame: 0, move: { x: 900, y: 360 }, press: ["primary"], release: ["primary"] }] })
    const Spawn = Game.System("Test/SpawnTarget", {}, ({ commands }) => {
      commands.spawnIn(RunScope, makeEnemy(tuning, "dummy", { x: 1000, y: 800 }))
    })
    run.runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred()))
    const frozen = () => run.runtime.inspect(HitStopState).hitStop > 1e-9

    // Step 1 fires, step 2 hits and kills: the freeze starts in that same step
    // (the `frozen` check sees the hit-stop ApplyDamage just started).
    run.step(2)
    expect(frozen()).toBe(true)
    const frozenPlayer = run.player()
    run.step(Math.floor(0.1 / engine.stepSeconds) - 2)
    expect(frozen()).toBe(true)
    expect(run.player()).toEqual(frozenPlayer)
    run.step(3)
    expect(frozen()).toBe(false)
  })

  it("delivers a dash pressed during a hit-stop when the game resumes", () => {
    const tuning = tuningWith({ feedback: { hitStopOnKill: 0.2 }, weapon: { damage: 1000, fireInterval: 10, projectileSpeed: 1_000_000, range: 100_000 } })
    const run = start({
      tuning,
      pointer: [{ frame: 0, move: { x: 900, y: 360 }, press: ["primary"], release: ["primary"] }],
      keys: [{ frame: 4, press: ["dash"], release: ["dash"] }]
    })
    const Spawn = Game.System("Test/SpawnTarget", {}, ({ commands }) => {
      commands.spawnIn(RunScope, makeEnemy(tuning, "dummy", { x: 1000, y: 800 }))
    })
    run.runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred()))
    run.step(Math.ceil(0.2 / engine.stepSeconds) + 6)
    expect(run.player().dash.cooldown).toBeGreaterThan(0)
  })
})

describe("live tuning", () => {
  it("applies queued edits to the Tuning resource", () => {
    const queue = emptyDevCommands()
    queue.edits.push({ path: ["dash", "distance"], value: 999 }, { path: ["waves", "enabled"], value: false })
    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(DevCommands, queue)),
      resources: { Tuning: defaultTuning, Rng: { state: 1 } }
    })
    const ReadTuning = Game.Inspector("Test/Tuning", { resources: { tuning: Game.System.readResource(Tuning) } }, ({ resources }) => resources.tuning.get())
    runtime.tick(Game.Schedule(ApplyDevCommands))
    const tuning = runtime.inspect(ReadTuning)
    expect(tuning.dash.distance).toBe(999)
    expect(tuning.waves.enabled).toBe(false)
    expect(tuning.dash.duration).toBe(defaultTuning.dash.duration)
    expect(queue.edits).toEqual([])
    expect(defaultTuning.dash.distance).not.toBe(999)
    expect(setAt(defaultTuning, ["player", "hp"], 5).player.hp).toBe(5)
  })
})

describe("determinism", () => {
  it("replays a 40 s run with waves and input to the identical world", () => {
    const keys = Array.from({ length: 40 }, (_, second) => [
      { frame: second * 60, press: [(["up", "right", "down", "left"] as const)[second % 4]!] },
      { frame: second * 60 + 30, press: ["dash" as const], release: ["dash" as const] },
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
  })
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
      create: ({ entity }) => ({ id: entity.value }),
      apply: () => {}
    })
    const Count = Game.Inspector("Test/Renderables", {
      queries: { all: Game.Query({ selection: { renderable: Game.Query.read(Renderable) } }) }
    }, ({ queries }) => queries.all.each().length)

    const tuning = stressTuning()
    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(
        Game.Runtime.service(KeyboardInput, Keyboard.scripted(keyBindings, [])),
        Game.Runtime.service(PointerInput, Pointer.scripted([])),
        Game.Runtime.service(FrameContext, { viewport: defaultViewport }),
        Game.Runtime.service(TestNodes, registry)
      ),
      resources: initialResources(tuning, defaultViewport),
      machines: initialMachines()
    })
    const stress = makeStress(tuning, { enemies: 20, projectiles: 300 })
    runtime.tick(setup)
    runtime.tick(Game.Schedule(stress.populate, stress.topUp, Game.Schedule.applyDeferred()))
    const step = Game.Schedule(fixedUpdate, stress.topUp, Game.Schedule.applyDeferred())
    const render = Game.Schedule(Sync)

    // 1 to 5 fixed steps per rendered frame, like a slow display catching up.
    for (let frame = 0; frame < 120; frame++) {
      for (let fixed = 0; fixed <= frame % 5; fixed++) runtime.tick(step)
      runtime.tick(render)
      expect(registry.size).toBe(runtime.inspect(Count))
    }
  })
})

describe("hit-stop and game over", () => {
  it("still ends the run when the killing hit also starts a hit-stop", () => {
    // The hit that kills the player starts a player-hit hit-stop in the same step.
    // Game-over detection must not be skipped by it, or the Death event is lost.
    const tuning = tuningWith({ player: { hp: 5 }, feedback: { hitStopOnPlayerHit: 0.2 } })
    const run = start({ tuning })
    const Spawn = Game.System("Test/SpawnChaser", {}, ({ commands }) => {
      commands.spawnIn(RunScope, makeEnemy(tuning, "chaser", { x: 1000, y: 900 }))
    })
    run.runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred()))
    const flow = () => run.runtime.debug.dump().machines["Shooter/Flow"]?.current
    for (let step = 0; step < 300 && flow() === "Playing"; step++) run.step()
    expect(flow()).toBe("GameOver")
  })
})

