/**
 * A run's fingerprint, to prove the simulation plays exactly the same after
 * a change made only for speed (see `test/determinism.test.ts`). Every 60
 * steps it writes down every body (its id, position, health, and elemental
 * state), how many Damage and Hit events there were since the last sample
 * and what they added up to, and the run's log; at the end, the run's
 * result. Numbers are written with full precision (the shortest text that
 * reads back as the same number), and each sample is hashed (FNV-1a), so a
 * difference in the last bit of any of them shows.
 */
import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

import { keyBindings } from "../src/config/input.ts"
import { KeepCharged } from "../src/dev/charged.ts"
import type { PerfScene } from "../src/dev/perf-scene.ts"
import { Damage, ElementState, Game, Health, Hit, Position, RunLog, RunResult } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"
import type { BotProbe } from "./bot.ts"

/** How often a sample is taken (steps). */
export const sampleEvery = 60

/** FNV-1a (32 bits) over a string's UTF-16 code units, as 8 hex digits. */
export const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

/**
 * A value as text that depends only on what it holds: object keys sorted (so
 * building an object in another order reads the same), numbers at full
 * precision, and -0, NaN, and the infinities told apart.
 */
export const canonical = (value: unknown): string => {
  if (typeof value === "number") return Object.is(value, -0) ? "-0" : Number.isFinite(value) ? String(value) : `"${String(value)}"`
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, field]) => field !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`).join(",")}}`
  }
  return JSON.stringify(String(value))
}

/** One sample: its raw text (shown when it differs) and its hash. */
export interface Sample {
  readonly step: number
  readonly raw: string
  readonly hash: string
}

const Bodies = Game.Inspector("Determinism/Bodies", {
  queries: { bodies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), state: Game.Query.optional(ElementState) } }) },
  resources: { log: Game.System.readResource(RunLog), result: Game.System.readResource(RunResult) }
}, ({ queries, resources }) => ({
  bodies: queries.bodies.each().map(({ entity, data }) => {
    const at = data.position.get(), health = data.health.get()
    return [entity.id, at.x, at.y, health.current, health.max, data.state.present ? data.state.get().current : null]
  }),
  log: resources.log.get(),
  result: resources.result.get()
}))

/** Watches a run: a system counting the step's Damage and Hit events, and `sample` to take a sample (once every `sampleEvery` steps). */
export const makeProbe = () => {
  const events = { damage: 0, damageSum: 0, hits: 0, hitSum: 0 }
  const samples: Array<Sample> = []
  const system = Game.System("Determinism/Events", { events: { damage: Game.System.readEvent(Damage), hit: Game.System.readEvent(Hit) } }, ({ events: read }) => {
    for (const damage of read.damage.all()) {
      events.damage += 1
      events.damageSum += damage.blow.damage
    }
    for (const hit of read.hit.all()) {
      events.hits += 1
      events.hitSum += hit.amount
    }
  })
  const take = (runtime: ReturnType<typeof createSimulation>["runtime"], step: number, extra?: unknown) => {
    const world = runtime.inspect(Bodies)
    const raw = canonical({ step, bodies: world.bodies, events, log: world.log, ...(extra === undefined ? {} : { result: world.result, extra }) })
    samples.push({ step, raw, hash: fnv1a(raw) })
    events.damage = 0
    events.damageSum = 0
    events.hits = 0
    events.hitSum = 0
  }
  return {
    system,
    samples,
    /** After step `step` (from 0): a sample when one is due. */
    after: (runtime: ReturnType<typeof createSimulation>["runtime"], step: number) => {
      if ((step + 1) % sampleEvery === 0) take(runtime, step + 1)
    },
    /** The last sample, with the run's result and `extra` (what the run reported). */
    finish: (runtime: ReturnType<typeof createSimulation>["runtime"], step: number, extra: unknown) => take(runtime, step, extra)
  }
}

/** The system that counts a step's events for a sample. */
export type ProbeSystem = ReturnType<typeof makeProbe>["system"]

/** The probe as a bot run takes it (see `BotRun.probe`). */
export const botProbe = (probe: ReturnType<typeof makeProbe>): BotProbe => ({ system: probe.system, after: probe.after })

/**
 * Plays a performance scene headless, as the browser does: the scene's
 * crowd after setup, then each fixed step the simulation, the scene's
 * upkeep, and the team's energy kept full. `onStep` runs after every step.
 */
export const playPerfScene = (scene: PerfScene, onStep: (runtime: ReturnType<typeof createSimulation>["runtime"], step: number) => void = () => undefined, extra?: ProbeSystem) => {
  const sim = createSimulation({
    keyboard: Keyboard.scripted(keyBindings, scene.keys),
    pointer: Pointer.scripted(scene.pointer),
    tuning: scene.tuning,
    team: scene.team
  })
  sim.runtime.tick(sim.setup)
  sim.runtime.tick(Game.Schedule(scene.populate, Game.Schedule.applyDeferred()))
  const step = extra === undefined
    ? Game.Schedule(sim.fixedUpdate, scene.keep, KeepCharged, Game.Schedule.applyDeferred())
    : Game.Schedule(sim.fixedUpdate, scene.keep, KeepCharged, Game.Schedule.applyDeferred(), extra)
  for (let index = 0; index < scene.steps; index++) {
    sim.runtime.tick(step)
    onStep(sim.runtime, index)
  }
  return sim.runtime
}
