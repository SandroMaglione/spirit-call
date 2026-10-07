/**
 * The accounts: each action reads a player's account (repairing what no
 * longer fits the content, see `fromRecord`), runs one of the account's
 * rules on it (`account/account.ts`, `account/calls.ts`) at the server's
 * time, saves what changed, and answers with the account after it. A rule
 * that refuses changes nothing.
 */
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { ascend, createAccount, earn, everything, noQuestProgress, recordRun, select, train, unlock, withClearedRewards } from "../account/account.ts"
import type { Account, CallResult, Checked, Earned, Play, TeamAspects } from "../account/account.ts"
import { call, setFocus } from "../account/calls.ts"
import { fromRecord, toRecord } from "../account/convert.ts"
import { Refused } from "../api/api.ts"
import type { BannerId } from "../content/calls.ts"
import type { CharacterId } from "../content/characters.ts"
import type { Amounts } from "../content/currencies.ts"
import { materials } from "../content/materials.ts"
import type { QuestId } from "../content/quests.ts"
import type { RunLogValue, RunResultValue } from "../schema.ts"
import { Content } from "./content.ts"
import { fromRows, noRows, toRows } from "./rows.ts"
import { Logs } from "./logs.ts"
import { Store } from "./store.ts"

/** What the dev tool adds: enough to level and ascend anything while testing. */
const plenty: Amounts = { crystals: 10_000, gold: 100_000, ...Object.fromEntries(Object.keys(materials).map((id) => [id, 5000])) }

export class Accounts extends Context.Service<
  Accounts,
  {
    /** Creates the account of a new player. */
    readonly create: (userId: string) => Effect.Effect<Account>
    readonly get: (userId: string) => Effect.Effect<Account>
    readonly select: (userId: string, team: ReadonlyArray<CharacterId>, play: Play, aspects?: TeamAspects) => Effect.Effect<Account, Refused>
    readonly train: (userId: string, character: CharacterId) => Effect.Effect<Account, Refused>
    readonly ascend: (userId: string, character: CharacterId) => Effect.Effect<Account, Refused>
    readonly call: (userId: string, banner: BannerId, count: number) => Effect.Effect<{ readonly account: Account; readonly results: ReadonlyArray<CallResult> }, Refused>
    readonly focus: (userId: string, banner: BannerId, character: CharacterId) => Effect.Effect<Account, Refused>
    /** Records a run that ended, with its log (kept for measuring play, see `Logs`). */
    readonly recordRun: (userId: string, play: Play | null, result: RunResultValue, log: RunLogValue) => Effect.Effect<{ readonly account: Account; readonly earned: Earned }>
    /** Owns every character and aspect, and adds plenty of each currency (a dev tool). */
    readonly unlockEverything: (userId: string) => Effect.Effect<Account>
    /** Clears chapter one and adds crystals for 30 calls (a dev tool, to try the Spirit Call). */
    readonly openCalls: (userId: string) => Effect.Effect<Account>
  }
>()("Shooter/Server/Accounts") {
  static readonly layer = Layer.effect(
    Accounts,
    Effect.gen(function*() {
      const store = yield* Store
      const logs = yield* Logs
      const { tuning, starter } = yield* Content

      /**
       * `userId`'s account (repaired where it no longer fits the content), the
       * rows it was read from, and the time. A player without one (accounts
       * were reset, see migrations/0003) starts over with a new account.
       */
      const read = (userId: string) =>
        Effect.gen(function*() {
          const now = yield* Clock.currentTimeMillis
          let rows = yield* store.load(userId)
          let record = fromRows(rows)
          if (record === undefined) {
            const fresh = toRows(userId, toRecord(createAccount(tuning, starter, userId, now)))
            yield* store.save(userId, noRows, fresh)
            rows = fresh
            record = fromRows(rows)
            if (record === undefined) return yield* Effect.die(new Error(`No account for player ${userId}`))
          }
          return { now, rows, account: fromRecord(tuning, starter, record, now).account }
        })

      /**
       * Runs `rule` on `userId`'s account at the server's time, saving the
       * account it leaves, and logs it as `action` on `subject` (with what it
       * gained and spent); a refusal saves and logs nothing. Repairs made
       * while reading are saved with the change.
       */
      const act = <A>(userId: string, action: string, subject: string | null, rule: (account: Account, now: number) => Checked<A>, accountOf: (value: A) => Account) =>
        Effect.gen(function*() {
          const { now, rows, account } = yield* read(userId)
          const checked = rule(account, now)
          if (!checked.ok) return yield* new Refused({ kind: checked.refusal.kind })
          const after = accountOf(checked.value)
          yield* store.save(userId, rows, toRows(userId, toRecord(after)))
          yield* logs.recordEvent(userId, action, subject, account, after)
          return checked.value
        })
      const ok = <A>(value: A): Checked<A> => ({ ok: true, value })
      const same = (account: Account) => account
      /** An action that is always allowed. */
      const always = (userId: string, action: string, change: (account: Account, now: number) => Account) =>
        act(userId, action, null, (account, now) => ok(change(account, now)), same).pipe(Effect.catchTag("Refused", Effect.die))

      const chapterOne = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].chapter === "one")

      return Accounts.of({
        create: Effect.fn("Accounts.create")(function*(userId: string) {
          // The account's id is its player's (its calls draw from it, see `seedOf`).
          const account = createAccount(tuning, starter, userId, yield* Clock.currentTimeMillis)
          yield* store.save(userId, noRows, toRows(userId, toRecord(account)))
          return account
        }),
        // Reading saves only repairs, and is not an action worth a log line.
        get: (userId) =>
          Effect.gen(function*() {
            const { rows, account } = yield* read(userId)
            yield* store.save(userId, rows, toRows(userId, toRecord(account)))
            return account
          }),
        select: (userId, team, play, aspects) => act(userId, "select", play.kind === "quest" ? play.quest : play.track, (account) => select(tuning, account, team, play, aspects), same),
        train: (userId, character) => act(userId, "train", character, (account) => train(tuning, account, character), same),
        ascend: (userId, character) => act(userId, "ascend", character, (account) => ascend(tuning, account, character), same),
        call: (userId, banner, count) => act(userId, "call", banner, (account, now) => call(tuning, account, banner, count, now), (called) => called.account),
        focus: (userId, banner, character) => act(userId, "focus", banner, (account) => setFocus(tuning, account, banner, character), same),
        recordRun: (userId, play, result, log) =>
          Effect.gen(function*() {
            // The run is kept with the account as it was played (her team's levels and aspects then).
            const { account: before } = yield* read(userId)
            const run = yield* logs.recordRun(userId, before, play, result, log)
            return yield* act(userId, "run", run, (account, now) => ok(recordRun(tuning, account, play, result, now)), (recorded) => recorded.account)
          }).pipe(Effect.catchTag("Refused", Effect.die)),
        unlockEverything: (userId) =>
          always(userId, "unlockEverything", (account, now) => earn(everything(tuning).reduce((next, item) => unlock(tuning, next, item, now), account), plenty)),
        openCalls: (userId) =>
          always(userId, "openCalls", (account, now) => {
            const cleared = Object.fromEntries(chapterOne.map((quest) => [quest, { ...noQuestProgress, ...account.quests[quest], firstClearedAt: account.quests[quest]?.firstClearedAt ?? now }]))
            const rewarded = withClearedRewards(tuning, { ...account, quests: { ...account.quests, ...cleared } }, now).account
            return earn(rewarded, { crystals: 30 * (tuning.calls.price.crystals ?? 0) })
          })
      })
    })
  )
}
