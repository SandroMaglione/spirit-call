/**
 * A new account's journey, run by run: the progression model
 * (`test/progression-model.ts`, the account's own rules) followed through
 * its observer, with where each currency came from. Deterministic: the
 * same numbers give the same journey.
 */
import { characterLevel, accountLevel, chestRewards } from "../../src/account/account.ts"
import type { Account, Earned, Play } from "../../src/account/account.ts"
import type { Tuning } from "../../src/config/tuning.ts"
import type { CharacterId } from "../../src/content/characters.ts"
import type { Amounts } from "../../src/content/currencies.ts"
import type { ElementId } from "../../src/content/elements.ts"
import type { MaterialId } from "../../src/content/materials.ts"
import { simulateProgression } from "../../test/progression-model.ts"
import type { ProgressionRow } from "../../test/progression-model.ts"
import type { PlayOptions } from "./knobs.ts"

/** Where gold and crystals come from. */
export const sources = ["runPay", "firstClears", "chests", "weekly", "accountLevels", "discoveries"] as const
export type Source = (typeof sources)[number]
export const sourceNames: { readonly [S in Source]: string } = {
  runPay: "Run pay",
  firstClears: "First clears",
  chests: "Star chests",
  weekly: "Hardcore weeks",
  accountLevels: "Account levels",
  discoveries: "Discoveries"
}

type BySource = { [S in Source]: number }
const none = (): BySource => ({ runPay: 0, firstClears: 0, chests: 0, weekly: 0, accountLevels: 0, discoveries: 0 })

/** The account at the end of a run (counted from the start). */
export interface Moment {
  readonly run: number
  readonly week: number
  readonly accountLevel: number
  readonly levels: { readonly [Id in CharacterId]?: number }
  readonly goldHeld: number
  /** Earned so far, by source; spent so far on training and ascending. */
  readonly gold: BySource
  readonly goldSpent: number
  readonly crystals: BySource
  /** Essences earned so far, by element. */
  readonly essences: { readonly [Id in ElementId]?: number }
}

/** A character joining the account. */
export interface Arrival {
  readonly character: CharacterId
  readonly week: number
}

export interface Journey {
  readonly moments: ReadonlyArray<Moment>
  readonly rows: ReadonlyArray<ProgressionRow>
  readonly runs: number
  readonly weeks: number
  readonly arrivals: ReadonlyArray<Arrival>
}

export const journeyOf = (tuning: Tuning, play: PlayOptions): Journey => {
  const moments: Array<Moment> = []
  const arrivals: Array<Arrival> = []
  const gold = none(), crystals = none()
  const essences: { [Id in ElementId]?: number } = {}
  let goldSpent = 0
  let held: number | null = null
  const week = (run: number) => run / play.runsPerWeek

  const add = (source: Source, amounts: Amounts) => {
    gold[source] += amounts.gold ?? 0
    crystals[source] += amounts.crystals ?? 0
    for (const [id, amount] of Object.entries(amounts)) {
      const material = tuning.materials[id as MaterialId]
      if (material !== undefined) essences[material.element] = (essences[material.element] ?? 0) + (amount ?? 0)
    }
  }

  const earnedFrom = (target: Play, earned: Earned) => {
    add("runPay", earned.pay)
    add(target.kind === "quest" ? "firstClears" : "weekly", { ...earned.materials, ...earned.rewards?.currencies })
    for (const chest of earned.chests) add("chests", chestRewards(tuning, chest))
    add("accountLevels", earned.levelRewards)
    for (const id of earned.discoveries) add("discoveries", tuning.discoveries[id].rewards)
  }

  const record = (account: Account, run: number) => {
    const levels: { [Id in CharacterId]?: number } = {}
    for (const character of Object.keys(account.owned.characters) as Array<CharacterId>) {
      levels[character] = characterLevel(tuning, account, character).level
      if (!arrivals.some((arrival) => arrival.character === character)) arrivals.push({ character, week: week(run) })
    }
    const moment: Moment = {
      run,
      week: week(run),
      accountLevel: accountLevel(tuning, account).level,
      levels,
      goldHeld: account.wallet.gold ?? 0,
      gold: { ...gold },
      goldSpent,
      crystals: { ...crystals },
      essences: { ...essences }
    }
    // One moment per run: what the account held once the run, and what followed it, were done.
    if (moments.at(-1)?.run === run) moments[moments.length - 1] = moment
    else moments.push(moment)
    held = account.wallet.gold ?? 0
  }

  const { rows, runs } = simulateProgression(tuning, {
    ...play,
    observe: (step) => {
      if (step.kind === "run") earnedFrom(step.play, step.earned)
      // Spending is the only way gold leaves the account in the model.
      else goldSpent += Math.max(0, (held ?? 0) - (step.account.wallet.gold ?? 0))
      record(step.account, step.runs)
    }
  })
  return { moments, rows, runs, weeks: week(runs), arrivals }
}
