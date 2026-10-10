/**
 * The accounts: each action reads a player's account in one batch
 * (repairing what no longer fits the content, see `fromRecord`), runs one
 * of the account's rules on it (`account/account.ts`, `account/calls.ts`,
 * the same code the game runs to show a result before the server answers)
 * at the server's time, saves what changed with its log in another batch
 * (all or none), and answers with the account after it. A rule that
 * refuses changes nothing.
 */
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Statement from "effect/sql/Statement"

import { ascend, createAccount, earn, everything, raiseRelic, recordRun, saveTeam, select, train, unlock, wear } from "../account/account.ts"
import type { Account, Checked, Earned, Play, SavedTeam, TeamAspects, TeamRelics } from "../account/account.ts"
import { fromRecord, toRecord } from "../account/convert.ts"
import { Refused } from "../api/api.ts"
import type { CharacterId } from "../content/characters.ts"
import type { CosmeticId, CosmeticKind } from "../content/cosmetics.ts"
import type { RelicId } from "../content/relics.ts"
import type { Amounts } from "../content/currencies.ts"
import { materials } from "../content/materials.ts"
import type { RunLogValue, RunResultValue } from "../schema.ts"
import { Batch } from "./batch.ts"
import { Content } from "./content.ts"
import { fromRows, noRows, toRows } from "./rows.ts"
import { Logs } from "./logs.ts"
import { Store } from "./store.ts"

/** What the dev tool adds: enough to level and ascend anything while testing. */
const plenty: Amounts = { gold: 1_000_000, ...Object.fromEntries(Object.keys(materials).map((id) => [id, 50_000])) }

export class Accounts extends Context.Service<
  Accounts,
  {
    /** Creates the account of a new player. */
    readonly create: (userId: string) => Effect.Effect<Account>
    readonly get: (userId: string) => Effect.Effect<Account>
    readonly select: (userId: string, team: ReadonlyArray<CharacterId>, play: Play, aspects?: TeamAspects, relics?: TeamRelics) => Effect.Effect<Account, Refused>
    readonly wear: (userId: string, character: CharacterId, kind: CosmeticKind, cosmetic: CosmeticId | null) => Effect.Effect<Account, Refused>
    /** Saves a team in `slot` to load in a tap, or empties the slot (`null`). */
    readonly saveTeam: (userId: string, slot: number, team: SavedTeam | null) => Effect.Effect<Account, Refused>
    readonly train: (userId: string, character: CharacterId) => Effect.Effect<Account, Refused>
    readonly ascend: (userId: string, character: CharacterId) => Effect.Effect<Account, Refused>
    /** Records a run that ended, with its log (kept for measuring play, see `Logs`). */
    readonly recordRun: (userId: string, play: Play | null, result: RunResultValue, log: RunLogValue) => Effect.Effect<{ readonly account: Account; readonly earned: Earned }>
    /** Owns every character, aspect, relic (at its last tier), and look, and adds plenty of gold and essence (a dev tool). */
    readonly unlockEverything: (userId: string) => Effect.Effect<Account>
  }
>()("Shooter/Server/Accounts") {
  static readonly layer = Layer.effect(
    Accounts,
    Effect.gen(function*() {
      const store = yield* Store
      const logs = yield* Logs
      const batch = yield* Batch
      /** Sends `statements` as one batch: a database failure is a defect (the request fails, and the game tries again). */
      const write = (statements: ReadonlyArray<Statement.Statement<object>>) => Effect.orDie(batch.run(statements))
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
            yield* write(store.writes(userId, noRows, fresh))
            rows = fresh
            record = fromRows(rows)
            if (record === undefined) return yield* Effect.die(new Error(`No account for player ${userId}`))
          }
          return { now, rows, account: fromRecord(tuning, starter, record, now).account }
        })

      /**
       * Runs `rule` on `userId`'s account at the server's time, saving the
       * account it leaves, and logs it as `action` on `subject` (with what it
       * gained and spent), with `also` (more to write, from the account as it
       * was), all in one batch; a refusal saves and logs nothing. Repairs
       * made while reading are saved with the change.
       */
      const act = <A>(
        userId: string,
        action: string,
        subject: (account: Account, now: number) => { readonly subject: string | null; readonly also?: ReadonlyArray<Statement.Statement<object>> },
        rule: (account: Account, now: number) => Checked<A>,
        accountOf: (value: A) => Account
      ) =>
        Effect.gen(function*() {
          const { now, rows, account } = yield* read(userId)
          const checked = rule(account, now)
          if (!checked.ok) return yield* new Refused({ kind: checked.refusal.kind })
          const after = accountOf(checked.value)
          const logged = subject(account, now)
          yield* write([...(logged.also ?? []), ...store.writes(userId, rows, toRows(userId, toRecord(after))), ...logs.eventWrites(userId, now, action, logged.subject, account, after)])
          return checked.value
        })
      const about = (subject: string | null) => () => ({ subject })
      const ok = <A>(value: A): Checked<A> => ({ ok: true, value })
      const same = (account: Account) => account
      /** An action that is always allowed. */
      const always = (userId: string, action: string, change: (account: Account, now: number) => Account) =>
        act(userId, action, about(null), (account, now) => ok(change(account, now)), same).pipe(Effect.catchTag("Refused", Effect.die))

      return Accounts.of({
        create: Effect.fn("Accounts.create")(function*(userId: string) {
          // The account's id is its player's.
          const account = createAccount(tuning, starter, userId, yield* Clock.currentTimeMillis)
          yield* write(store.writes(userId, noRows, toRows(userId, toRecord(account))))
          return account
        }),
        // Reading saves only repairs, and is not an action worth a log line.
        get: (userId) =>
          Effect.gen(function*() {
            const { rows, account } = yield* read(userId)
            yield* write(store.writes(userId, rows, toRows(userId, toRecord(account))))
            return account
          }),
        select: (userId, team, play, aspects, relics) => act(userId, "select", about(play.kind === "quest" ? play.quest : play.track), (account) => select(tuning, account, team, play, aspects, relics), same),
        wear: (userId, character, kind, cosmetic) => act(userId, "wear", about(character), (account) => wear(tuning, account, character, kind, cosmetic), same),
        saveTeam: (userId, slot, team) => act(userId, "saveTeam", about(String(slot)), (account) => saveTeam(tuning, account, slot, team), same),
        train: (userId, character) => act(userId, "train", about(character), (account) => train(tuning, account, character), same),
        ascend: (userId, character) => act(userId, "ascend", about(character), (account) => ascend(tuning, account, character), same),
        recordRun: (userId, play, result, log) =>
          act(userId, "run", (before, now) => {
            // The run is kept with the account as it was played (her team's levels and aspects then), with the change it made.
            const run = logs.runWrites(userId, now, before, play, result, log)
            return { subject: run.id, also: run.statements }
          }, (account, now) => ok(recordRun(tuning, account, play, result, now)), (recorded) => recorded.account).pipe(Effect.catchTag("Refused", Effect.die)),
        unlockEverything: (userId) =>
          always(userId, "unlockEverything", (account, now) =>
            earn((Object.keys(tuning.relics) as Array<RelicId>).reduce((next, id) => raiseRelic(next, id, 3, now), everything(tuning).reduce((next, item) => unlock(tuning, next, item, now), account)), plenty))
      })
    })
  )
}
