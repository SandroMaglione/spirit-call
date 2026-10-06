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

import { ascend, combine, createAccount, earn, everything, noQuestProgress, recordRun, select, train, unlock, withClearedRewards } from "../account/account.ts"
import type { Account, CallResult, Checked, Earned, Play, TeamAspects } from "../account/account.ts"
import { call, setFocus } from "../account/calls.ts"
import { fromRecord, toRecord } from "../account/convert.ts"
import { Refused } from "../api/api.ts"
import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import type { BannerId } from "../content/calls.ts"
import type { CharacterId } from "../content/characters.ts"
import type { Amounts } from "../content/currencies.ts"
import { materials } from "../content/materials.ts"
import type { MaterialId } from "../content/materials.ts"
import type { QuestId } from "../content/quests.ts"
import type { RunResultValue } from "../schema.ts"
import { fromRows, noRows, toRows } from "./rows.ts"
import { Store } from "./store.ts"

/** What the accounts are made of: the content and its numbers, and what a new account owns. */
export class Content extends Context.Service<Content, { readonly tuning: Tuning; readonly starter: StarterSet }>()("Shooter/Server/Content") {}

/** What the dev tool adds: enough to level and ascend anything while testing. */
const plenty: Amounts = { crystals: 10_000, gold: 100_000, ...Object.fromEntries(Object.keys(materials).map((id) => [id, 50])) }

export class Accounts extends Context.Service<
  Accounts,
  {
    /** Creates the account of a new player. */
    readonly create: (userId: string) => Effect.Effect<Account>
    readonly get: (userId: string) => Effect.Effect<Account>
    readonly select: (userId: string, team: ReadonlyArray<CharacterId>, play: Play, aspects?: TeamAspects) => Effect.Effect<Account, Refused>
    readonly train: (userId: string, character: CharacterId) => Effect.Effect<Account, Refused>
    readonly ascend: (userId: string, character: CharacterId) => Effect.Effect<Account, Refused>
    readonly combine: (userId: string, material: MaterialId) => Effect.Effect<Account, Refused>
    readonly call: (userId: string, banner: BannerId, count: number) => Effect.Effect<{ readonly account: Account; readonly results: ReadonlyArray<CallResult> }, Refused>
    readonly focus: (userId: string, banner: BannerId, character: CharacterId) => Effect.Effect<Account, Refused>
    readonly recordRun: (userId: string, play: Play | null, result: RunResultValue) => Effect.Effect<{ readonly account: Account; readonly earned: Earned }>
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
      const { tuning, starter } = yield* Content

      /**
       * Runs `action` on `userId`'s account at the server's time, saving the
       * account it leaves; a refusal saves nothing. Repairs made while
       * reading are saved with the change.
       */
      const act = <A>(userId: string, action: (account: Account, now: number) => Checked<A>, accountOf: (value: A) => Account) =>
        Effect.gen(function*() {
          const now = yield* Clock.currentTimeMillis
          const rows = yield* store.load(userId)
          const record = fromRows(rows)
          if (record === undefined) return yield* Effect.die(new Error(`No account for player ${userId}`))
          const { account } = fromRecord(tuning, starter, record, now)
          const checked = action(account, now)
          if (!checked.ok) return yield* new Refused({ kind: checked.refusal.kind })
          yield* store.save(userId, rows, toRows(userId, toRecord(accountOf(checked.value))))
          return checked.value
        })
      const ok = <A>(value: A): Checked<A> => ({ ok: true, value })
      const same = (account: Account) => account
      /** An action that is always allowed. */
      const always = (userId: string, change: (account: Account, now: number) => Account) =>
        act(userId, (account, now) => ok(change(account, now)), same).pipe(Effect.catchTag("Refused", Effect.die))

      const chapterOne = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].chapter === "one")

      return Accounts.of({
        create: Effect.fn("Accounts.create")(function*(userId: string) {
          // The account's id is its player's (its calls draw from it, see `seedOf`).
          const account = createAccount(tuning, starter, userId, yield* Clock.currentTimeMillis)
          yield* store.save(userId, noRows, toRows(userId, toRecord(account)))
          return account
        }),
        get: (userId) => always(userId, same),
        select: (userId, team, play, aspects) => act(userId, (account) => select(tuning, account, team, play, aspects), same),
        train: (userId, character) => act(userId, (account) => train(tuning, account, character), same),
        ascend: (userId, character) => act(userId, (account) => ascend(tuning, account, character), same),
        combine: (userId, material) => act(userId, (account) => combine(tuning, account, material), same),
        call: (userId, banner, count) => act(userId, (account, now) => call(tuning, account, banner, count, now), (called) => called.account),
        focus: (userId, banner, character) => act(userId, (account) => setFocus(tuning, account, banner, character), same),
        recordRun: (userId, play, result) =>
          act(userId, (account, now) => ok(recordRun(tuning, account, play, result, now)), (recorded) => recorded.account).pipe(Effect.catchTag("Refused", Effect.die)),
        unlockEverything: (userId) =>
          always(userId, (account, now) => earn(everything(tuning).reduce((next, item) => unlock(tuning, next, item, now), account), plenty)),
        openCalls: (userId) =>
          always(userId, (account, now) => {
            const cleared = Object.fromEntries(chapterOne.map((quest) => [quest, { ...noQuestProgress, ...account.quests[quest], firstClearedAt: account.quests[quest]?.firstClearedAt ?? now }]))
            const rewarded = withClearedRewards(tuning, { ...account, quests: { ...account.quests, ...cleared } }, now).account
            return earn(rewarded, { crystals: 30 * (tuning.calls.price.crystals ?? 0) })
          })
      })
    })
  )
}
