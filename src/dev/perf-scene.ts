/**
 * Performance scenes: a crowd of enemies hit by a whole team at once, the
 * worst case for drawing, effects, and sounds. One scene module drives the
 * determinism test (`test/determinism.test.ts`), the Node benchmark
 * (`scripts/stress.ts --scene`), and the browser (`?perf=crowd,30`, timed
 * by `scripts/perf.ts`), so all three play the same fight.
 *
 * - `crowd`: enemies of mixed kinds with health out of reach (hit, never
 *   killed), kept on a ring around the player, fighting a team of three
 *   elements whose energy stays full, so bursts and arcs cascade.
 * - `crowd-fire`: the same with a fire team, so the heat haze and burning run.
 * - `kills`: enemies with their usual health, topped back up to the count,
 *   so kills, their chunks and sounds, and despawns happen.
 *
 * The input is scripted per fixed step (a timeline is read once per input
 * capture, in the fixed step): the attack held and pressed again every 20
 * steps, the aim circling the player, and every 120 steps a switch to the
 * next member, her special 30 steps later and her ultimate 70 steps later.
 */
import type { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"
import * as Random from "@typeonce/bevy-ts-math/Random"

import type { KeyBindings } from "../config/input.ts"
import { tuningWith } from "../config/tuning.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { EnemyParts, makeEnemy } from "../features/enemies.ts"
import { Enemy, Game, Health, Hit, Player, Position, PrevPosition, RunScope } from "../schema.ts"
import type { BuildValue, EnemyKind, ViewportValue } from "../schema.ts"

export const perfSceneNames = ["crowd", "crowd-fire", "kills"] as const
export type PerfSceneName = (typeof perfSceneNames)[number]

/** The kinds a crowd mixes, in turn. */
const crowdKinds: ReadonlyArray<EnemyKind> = ["chaser", "brute", "swarmer", "shooter", "charger", "guardian"]

const teams: Record<PerfSceneName, ReadonlyArray<BuildValue>> = {
  crowd: [{ character: "tidecaller" }, { character: "stormcaller" }, { character: "quarry" }],
  "crowd-fire": [{ character: "hearth" }, { character: "gunner" }, { character: "swordsman" }],
  kills: [{ character: "tidecaller" }, { character: "stormcaller" }, { character: "quarry" }]
}

/** How near and far from the player the crowd is kept (world units), and how often stragglers are pulled back (steps). */
const ring = { near: 60, far: 180, every: 45 }

export interface PerfScene {
  readonly name: PerfSceneName
  readonly enemies: number
  /** How many fixed steps the script lasts. */
  readonly steps: number
  readonly tuning: TuningValue
  readonly team: ReadonlyArray<BuildValue>
  /** The scripted keyboard's and pointer's timelines (for `Keyboard.scripted` and `Pointer.scripted`). */
  readonly keys: Keyboard.Timeline<KeyBindings>
  readonly pointer: Pointer.Timeline
  /** Spawns the crowd once, after setup. */
  readonly populate: ReturnType<typeof makeSystems>["populate"]
  /** Each fixed step after the simulation: pulls stragglers back, and (in `kills`) tops the crowd up. */
  readonly keep: ReturnType<typeof makeSystems>["keep"]
  /** Counts the hits dealt (it only reads events), and how many so far. */
  readonly count: ReturnType<typeof makeSystems>["count"]
  readonly hits: () => number
}

/** `?perf=crowd,30` in the URL: the scene and its number of enemies. */
export const parsePerf = (search: string): { readonly scene: PerfSceneName; readonly enemies: number } | undefined => {
  const value = new URLSearchParams(search).get("perf")
  if (value === null) return undefined
  const [name = "crowd", count = "30"] = value.split(",")
  const scene = (perfSceneNames as ReadonlyArray<string>).includes(name) ? (name as PerfSceneName) : "crowd"
  const enemies = Number(count)
  return { scene, enemies: Number.isFinite(enemies) && enemies > 0 ? Math.floor(enemies) : 30 }
}

/** The input script: what is pressed at which fixed step, aimed on a `viewport` with the player at its middle. */
const script = (steps: number, viewport: ViewportValue) => {
  const keys: Array<Keyboard.TimelineEntry<KeyBindings>> = []
  const pointer: Array<Pointer.TimelineEntry> = []
  const switches = ["team1", "team2", "team3"] as const
  for (let frame = 0; frame < steps; frame++) {
    const angle = (frame / 240) * Math.PI * 2
    const press = frame % 20 === 0 ? (["primary"] as const) : undefined
    const release = frame % 20 === 19 ? (["primary"] as const) : undefined
    pointer.push({
      frame,
      move: { x: viewport.width / 2 + Math.cos(angle) * 200, y: viewport.height / 2 + Math.sin(angle) * 140 },
      ...(press === undefined ? {} : { press }),
      ...(release === undefined ? {} : { release })
    })
    const cycle = Math.floor(frame / 120), at = frame % 120
    const key = at === 0 ? switches[cycle % switches.length]! : at === 30 ? "special" : at === 70 ? "ultimate" : null
    if (key !== null) keys.push({ frame, press: [key] }, { frame: frame + 1, release: [key] })
  }
  return { keys, pointer }
}

const makeSystems = (tuning: TuningValue, name: PerfSceneName, enemies: number, scripted: number) => {
  const random = Random.make(11)
  const ringAround = (center: { readonly x: number; readonly y: number }) => {
    const angle = random.next() * Math.PI * 2
    const distance = random.range(ring.near, ring.far)
    return { x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance }
  }
  let spawned = 0
  let steps = 0
  /** The next enemy of the crowd, somewhere on the ring around `around`. */
  const next = (around: { readonly x: number; readonly y: number }) => {
    const enemy = makeEnemy(tuning, crowdKinds[spawned % crowdKinds.length]!, ringAround(around), spawned % 2 === 0 ? 1 : -1)
    spawned += 1
    return enemy
  }
  const playerQuery = Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] })

  const populate = Game.System("Perf/Populate", {
    queries: { player: playerQuery },
    commands: Game.System.commands(Game.System.spawns(...EnemyParts))
  }, ({ queries, commands }) => {
    const around = queries.player.each()[0]?.data.position.get() ?? { x: tuning.arena.width / 2, y: tuning.arena.height / 2 }
    for (let index = 0; index < enemies; index++) commands.spawnIn(RunScope, next(around))
  })

  const keep = Game.System("Perf/Keep", {
    queries: {
      player: playerQuery,
      enemies: Game.Query({ selection: { position: Game.Query.write(Position), previous: Game.Query.write(PrevPosition), health: Game.Query.read(Health) }, with: [Enemy] })
    },
    commands: Game.System.commands(Game.System.spawns(...EnemyParts))
  }, ({ queries, commands }) => {
    steps += 1
    const around = queries.player.each()[0]?.data.position.get()
    if (around === undefined) return
    const crowd = queries.enemies.each()
    if (steps % ring.every === 0) {
      for (const { data } of crowd) {
        const at = data.position.get()
        if (Math.hypot(at.x - around.x, at.y - around.y) <= ring.far + 40) continue
        const back = ringAround(around)
        data.position.set(back)
        data.previous.set(back)
      }
    }
    if (name === "kills") {
      const alive = crowd.filter(({ data }) => data.health.get().current > 0).length
      for (let count = alive; count < enemies; count++) commands.spawnIn(RunScope, next(around))
    }
  })

  // Only the script's steps count: a frame that runs past its end must not add the steps after it.
  let hits = 0
  let counted = 0
  const count = Game.System("Perf/Count", { events: { hit: Game.System.readEvent(Hit) } }, ({ events }) => {
    counted += 1
    if (counted <= scripted) hits += events.hit.all().length
  })

  return { populate, keep, count, hits: () => hits }
}

/** The scene `name` with `enemies` enemies, scripted for `steps` fixed steps on a `viewport` (the browser's, or 1280×720 headless). */
export const makePerfScene = (name: PerfSceneName, enemies = 30, steps = 1200, viewport: ViewportValue = { width: 1280, height: 720 }): PerfScene => {
  const team = teams[name]
  // Waves off and the team's health out of reach: the crowd is all there is, and the fight never ends.
  const tuning = tuningWith({
    waves: { enabled: false },
    characters: Object.fromEntries(team.map(({ character }) => [character, { stats: { hp: 1e8 } }])),
    ...(name === "kills" ? {} : { enemies: Object.fromEntries(crowdKinds.map((kind) => [kind, { hp: 1e8 }])) })
  })
  const { keys, pointer } = script(steps, viewport)
  return { name, enemies, steps, tuning, team, keys, pointer, ...makeSystems(tuning, name, enemies, steps) }
}
