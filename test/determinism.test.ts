/**
 * The simulation plays exactly the same, bit for bit: scripted fights are
 * fingerprinted (see `test/fingerprint.ts`) and checked against
 * `test/determinism.json`, recorded before any change made only for speed.
 * A change that moves any body, any number of health, any state, or any
 * entry of the run's log by the last bit fails here.
 *
 * The fights: the performance scenes (`src/dev/perf-scene.ts`: a crowd hit
 * by every element, so bursts and arcs cascade), and the bot (`test/bot.ts`)
 * playing real challenges with teams that use their skills.
 *
 * `UPDATE_DETERMINISM=1 pnpm vitest run test/determinism.test.ts` records the
 * fingerprints again. Only ever on a commit whose simulation is unchanged:
 * never to make a failing test pass. It also writes every sample's raw values
 * to `.data/determinism/` (not committed), and a failing run writes its own
 * to `.data/determinism/current/`, to compare.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { tuningWith, defaultTuning } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { ChallengeId } from "../src/content/challenges.ts"
import { makePerfScene } from "../src/dev/perf-scene.ts"
import type { PerfSceneName } from "../src/dev/perf-scene.ts"
import type { BuildValue } from "../src/schema.ts"
import { fighter, learner, runBot } from "./bot.ts"
import type { BotRun } from "./bot.ts"
import { botProbe, makeProbe, playPerfScene } from "./fingerprint.ts"
import type { Sample } from "./fingerprint.ts"

const here = dirname(fileURLToPath(import.meta.url))
const recordedPath = join(here, "determinism.json")
const rawFolder = join(here, "..", ".data", "determinism")
const updating = process.env["UPDATE_DETERMINISM"] === "1"

type Recorded = Record<string, ReadonlyArray<{ readonly step: number; readonly hash: string }>>

const team = (...characters: ReadonlyArray<BuildValue["character"]>): ReadonlyArray<BuildValue> => characters.map((character) => ({ character }))

/** A challenge's last scripted wave alone (as `pnpm lab` plays one wave). */
const lastWave = (id: ChallengeId): Tuning => {
  const scripted = defaultTuning.challenges[id].waves.scripted
  return tuningWith({ challenges: { [id]: { waves: { scripted: [scripted[scripted.length - 1]!], endless: null } } } })
}

const scenes: ReadonlyArray<PerfSceneName> = ["crowd", "crowd-fire", "kills"]

/** Real challenges the bot plays, with teams covering every element, using their skills and switching. */
const botRuns: Record<string, Omit<BotRun, "probe">> = {
  holdTheLine: { tuning: defaultTuning, challenge: "holdTheLine", seconds: 40, style: fighter, team: team("swordsman", "tidecaller", "stormcaller"), abilities: true, rotateEvery: 6, measurePressure: false },
  eliteHunt: { tuning: defaultTuning, challenge: "eliteHunt", seconds: 40, style: fighter, team: team("hearth", "gunner", "quarry"), abilities: true, rotateEvery: 7, measurePressure: false },
  stormFront: { tuning: defaultTuning, challenge: "stormFront", seconds: 40, style: learner, team: team("stormcaller", "tidecaller", "hearth"), abilities: true, rotateEvery: 5, measurePressure: false },
  // Its last wave: a burning champion guardian.
  gauntletChampion: { tuning: lastWave("gauntlet"), challenge: "gauntlet", seconds: 40, style: fighter, team: team("quarry", "stormcaller", "tidecaller"), abilities: true, rotateEvery: 6, measurePressure: false },
  // Real health and the real objective: the team falls (at about 86 s), and the run's result is written.
  untilFall3: { tuning: defaultTuning, challenge: "untilFall3", enemyLevel: 5, seconds: 100, style: learner, team: team("gunner", "hearth", "swordsman"), abilities: true, rotateEvery: 8, mortal: true, measurePressure: false }
}

const fingerprintScene = (name: PerfSceneName): ReadonlyArray<Sample> => {
  const probe = makeProbe()
  const scene = makePerfScene(name, 30, 1200)
  const runtime = playPerfScene(scene, probe.after, probe.system)
  probe.finish(runtime, scene.steps, null)
  return probe.samples
}

const fingerprintBot = (run: Omit<BotRun, "probe">): ReadonlyArray<Sample> => {
  const probe = makeProbe()
  let last: { runtime: Parameters<typeof probe.finish>[0]; step: number } | undefined
  const report = runBot({ ...run, probe: { ...botProbe(probe), after: (runtime, step) => {
    probe.after(runtime, step)
    last = { runtime, step: step + 1 }
  } } })
  if (last !== undefined) probe.finish(last.runtime, last.step, report)
  return probe.samples
}

const recorded = (): Recorded => {
  try {
    return JSON.parse(readFileSync(recordedPath, "utf8")) as Recorded
  } catch {
    return {}
  }
}

/** A fight's name as a file name. */
const fileName = (name: string) => name.replace(":", "-")

const results: Record<string, ReadonlyArray<Sample>> = {}

/** Checks (or, when updating, records) one fight's samples. */
const check = (name: string, samples: ReadonlyArray<Sample>) => {
  results[name] = samples
  const raw = samples.map((sample) => sample.raw).join("\n")
  if (updating) {
    mkdirSync(rawFolder, { recursive: true })
    writeFileSync(join(rawFolder, `${fileName(name)}.txt`), raw)
    const next = { ...recorded(), [name]: samples.map(({ step, hash }) => ({ step, hash })) }
    writeFileSync(recordedPath, `${JSON.stringify(Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`)
    return
  }
  const expected = recorded()[name]
  expect(expected, `no fingerprint recorded for ${name}: run with UPDATE_DETERMINISM=1 on unchanged main`).toBeDefined()
  const actual = samples.map(({ step, hash }) => ({ step, hash }))
  const differs = actual.findIndex((sample, index) => sample.step !== expected![index]?.step || sample.hash !== expected![index]?.hash)
  if (differs !== -1 || actual.length !== expected!.length) {
    // What diverged: this run's raw values, beside the recorded ones when they are on this machine.
    const current = join(rawFolder, "current")
    mkdirSync(current, { recursive: true })
    writeFileSync(join(current, `${fileName(name)}.txt`), raw)
    const index = differs === -1 ? Math.min(actual.length, expected!.length) : differs
    let before = "(not on this machine: record on main to compare)"
    try {
      before = readFileSync(join(rawFolder, `${fileName(name)}.txt`), "utf8").split("\n")[index] ?? "(none)"
    } catch {
      // Nothing recorded here to compare with.
    }
    const now = samples[index]?.raw ?? "(none)"
    throw new Error(`${name} diverged at sample ${index} (step ${actual[index]?.step ?? expected![index]?.step}).\nnow:      ${now.slice(0, 4000)}\nrecorded: ${before.slice(0, 4000)}\nAll samples: ${join(current, `${fileName(name)}.txt`)}`)
  }
}

describe("the simulation plays exactly the same", () => {
  for (const name of scenes) {
    it(`performance scene ${name}`, () => check(`scene:${name}`, fingerprintScene(name)), 120_000)
  }
  for (const [name, run] of Object.entries(botRuns)) {
    it(`bot on ${name}`, () => check(`bot:${name}`, fingerprintBot(run)), 240_000)
  }
  it("is deterministic within a process (the crowd twice)", () => {
    const again = fingerprintScene("crowd").map((sample) => sample.hash)
    expect(again).toEqual(results["scene:crowd"]?.map((sample) => sample.hash) ?? again)
  }, 120_000)
})
