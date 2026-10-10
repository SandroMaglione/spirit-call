/**
 * A new account's journey, run by run: the progression model
 * (`test/progression-model.ts`, the account's own rules) followed through
 * its observer, with where gold came from and how much of the collection
 * was owned. Deterministic: the same numbers give the same journey.
 */
import { characterLevel, chestRewards, owns, sourcesOf } from "../../src/account/account.ts"
import type { Account, Earned, Play } from "../../src/account/account.ts"
import type { Tuning } from "../../src/config/tuning.ts"
import type { CharacterId } from "../../src/content/characters.ts"
import type { Amounts } from "../../src/content/currencies.ts"
import type { MaterialId } from "../../src/content/materials.ts"
import { simulateProgression } from "../../test/progression-model.ts"
import type { ProgressionRow } from "../../test/progression-model.ts"
import type { PlayOptions } from "./knobs.ts"

/** Where gold comes from. */
export const sources = ["runPay", "firstClears", "chests", "tiers", "discoveries"] as const
export type Source = (typeof sources)[number]
export const sourceNames: { readonly [S in Source]: string } = {
  runPay: "Run pay",
  firstClears: "First clears",
  chests: "Star chests",
  tiers: "Track tiers",
  discoveries: "Discoveries"
}

type BySource = { [S in Source]: number }
const none = (): BySource => ({ runPay: 0, firstClears: 0, chests: 0, tiers: 0, discoveries: 0 })

/** An essence by what it is called on the chart: its element's, or a shared grade. */
export type EssenceKey = string

/** The account at the end of a run (counted from the start). */
export interface Moment {
  readonly run: number
  /** Every run played so far, and the hours they took. */
  readonly played: number
  readonly hours: number
  /** How many things of the collection the account owns, of how many. */
  readonly owned: number
  readonly levels: { readonly [Id in CharacterId]?: number }
  readonly goldHeld: number
  /** Earned so far, by source; spent so far on training and ascending. */
  readonly gold: BySource
  readonly goldSpent: number
  /** Essences earned so far, by element (and the shared grades by name). */
  readonly essences: { readonly [key: string]: number }
}

/** A character joining the account. */
export interface Arrival {
  readonly character: CharacterId
  readonly hours: number
}

export interface Journey {
  readonly moments: ReadonlyArray<Moment>
  readonly rows: ReadonlyArray<ProgressionRow>
  readonly runs: number
  /** How many things there are to own. */
  readonly collection: number
  /** Hours played in all, and by the end of run `run` (counted as `runs` counts). */
  readonly hours: number
  readonly hoursAt: (run: number) => number
  readonly arrivals: ReadonlyArray<Arrival>
}

export const journeyOf = (tuning: Tuning, play: PlayOptions): Journey => {
  const moments: Array<Moment> = []
  const arrivals: Array<Arrival> = []
  const gold = none()
  const essences: { [key: string]: number } = {}
  const everything = sourcesOf(tuning)
  let goldSpent = 0
  let played = 0
  let held: number | null = null
  const add = (source: Source, amounts: Amounts) => {
    gold[source] += amounts.gold ?? 0
    for (const [id, amount] of Object.entries(amounts)) {
      const material = tuning.materials[id as MaterialId]
      const key = material === undefined ? null : material.element ?? (material.grade === 2 ? "refined" : "core")
      if (key !== null) essences[key] = (essences[key] ?? 0) + (amount ?? 0)
    }
  }

  const earnedFrom = (target: Play, earned: Earned) => {
    add("runPay", earned.pay)
    add(target.kind === "quest" ? "firstClears" : "tiers", { ...earned.materials, ...earned.rewards?.currencies })
    for (const chest of earned.chests) add("chests", chestRewards(tuning, chest))
    for (const id of earned.discoveries) add("discoveries", tuning.discoveries[id].rewards)
  }

  const record = (account: Account, run: number) => {
    const hours = (played * play.minutesPerRun) / 60
    const levels: { [Id in CharacterId]?: number } = {}
    for (const character of Object.keys(account.owned.characters) as Array<CharacterId>) {
      levels[character] = characterLevel(tuning, account, character).level
      if (!arrivals.some((arrival) => arrival.character === character)) arrivals.push({ character, hours })
    }
    const moment: Moment = {
      run,
      played,
      hours,
      owned: everything.filter((each) => owns(account, each.item)).length,
      levels,
      goldHeld: account.wallet.gold ?? 0,
      gold: { ...gold },
      goldSpent,
      essences: { ...essences }
    }
    // One moment per run: what the account held once the run, and what followed it, were done.
    if (moments.at(-1)?.run === run) moments[moments.length - 1] = moment
    else moments.push(moment)
    held = account.wallet.gold ?? 0
  }

  const { rows, runs } = simulateProgression(tuning, {
    ...play,
    runsPerHour: 60 / play.minutesPerRun,
    observe: (step) => {
      if (step.kind === "run") {
        played += 1
        earnedFrom(step.play, step.earned)
      }
      // Spending is the only way gold leaves the account in the model.
      else goldSpent += Math.max(0, (held ?? 0) - (step.account.wallet.gold ?? 0))
      record(step.account, step.runs)
    }
  })
  const hoursAt = (run: number) => (run <= 0 ? 0 : (moments[Math.min(run, moments.length) - 1]?.hours ?? 0))
  return { moments, rows, runs, collection: everything.length, hours: moments.at(-1)?.hours ?? 0, hoursAt, arrivals }
}
