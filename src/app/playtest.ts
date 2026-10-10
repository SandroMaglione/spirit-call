/**
 * Playtest logging, as the shell sees it: one call for a run that ended
 * (see docs/playtest.md). A release build is given `off`, which does
 * nothing; a playtest build is given the sender (`playtest-send.ts`), which
 * the release build does not contain at all (see `startApp`).
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type { Earned, Play } from "../account/account.ts"
import type { PlaytestRunValue } from "../api/schemas.ts"
import { relicSlots } from "../content/relics.ts"
import type { BuildValue, RunLogValue, RunResultValue } from "../schema.ts"

/** A run as the shell reports it: everything but who played it (the sender knows its device and tester). */
export type ReportedRun = Omit<PlaytestRunValue, "device" | "tester">

export class Playtest extends Context.Service<Playtest, {
  /** Reports a run that ended, played on the account named `player`; never fails, and never holds up play. */
  readonly recordRun: (run: ReportedRun, player: string) => Effect.Effect<void>
}>()("Shooter/Playtest") {
  /** A release build: nothing is sent. */
  static readonly off = Layer.succeed(Playtest, Playtest.of({ recordRun: () => Effect.void }))
}

/** The run a playtest build reports: what was played, who played it as they entered the arena (`team`), how it went, and what it earned. */
export const reportOf = (run: {
  readonly id: string
  readonly at: number
  readonly build: string
  readonly play: Play | null
  readonly enemyLevel: number
  readonly team: ReadonlyArray<BuildValue>
  readonly result: RunResultValue
  readonly log: RunLogValue
  readonly earned: Earned
}): ReportedRun => ({
  ...run,
  team: run.team.map((build) => ({
    character: build.character,
    level: build.level ?? 1,
    aspect: build.aspect ?? null,
    relics: relicSlots.flatMap((slot) => {
      const relic = build.relics?.[slot]
      return relic === undefined ? [] : [{ slot, id: relic.id, tier: relic.tier }]
    })
  }))
})
