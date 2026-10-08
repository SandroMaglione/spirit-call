/**
 * The account's changes on their way to the server, one at a time and in
 * the order they were made, so the server runs each on the account the one
 * before left (a quest a run cleared is open when the next run's selection
 * arrives).
 *
 * A change the game can work out itself (a run's rewards, a selection) is
 * shown at once: the account shown is the server's last answer with the
 * changes still on their way applied on top, by the same rules the server
 * runs (`account/account.ts`). The server's answer then replaces it.
 *
 * A change that cannot be sent is tried again a few times; one that must
 * not be lost (a run, a selection) then waits for the player to try again
 * (`retry`), and every change after it waits behind it; another (a level,
 * a call) is given up, and the account read back. Before trying again, the
 * account is read back: a change the server made but whose answer was lost
 * is not made twice.
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Latch from "effect/Latch"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schedule from "effect/Schedule"
import * as Semaphore from "effect/Semaphore"

import type { Account } from "../account/account.ts"

/** How a change is tried. */
export interface Change<A> {
  /** Sends it: the server's answer. */
  readonly send: Effect.Effect<A, unknown>
  /** The account in the answer. */
  readonly accountOf: (answer: A) => Account
  /** What it does to the account shown until the server answers (a change the game works out itself). */
  readonly apply?: (account: Account) => Account
  /** Whether it must not be lost: tried until saved, the player asked once the first tries fail. */
  readonly keep: boolean
  /** How many times it is tried again before giving up (or asking the player); the saves' own number when absent. */
  readonly tries?: number
  /** Whether it may be sent again after a failure (a change the server might have made would be made twice otherwise, unless `landed` finds it). */
  readonly again: boolean
  /** The answer, found in the account as the server has it now, when the server made the change (from `before`, its account when it was sent); `undefined` when it did not. */
  readonly landed?: (before: Account, now: Account) => A | undefined
}

/** How a change ended: saved (the server's answer), refused by the server's rules (`kind` says why), or not saved. */
export type Outcome<A> = { readonly saved: A } | { readonly refused: string } | { readonly failed: true }

/** Where the changes stand: how many that must not be lost are still on their way, and whether one is waiting for the player to try again. */
export interface SavesState {
  readonly pending: number
  readonly failed: boolean
}

export interface Saves {
  /** The account shown: the server's last answer, with the changes on their way applied. */
  readonly account: () => Account
  readonly state: () => SavesState
  /** Sends `change` after every change before it. */
  readonly submit: <A>(change: Change<A>) => Promise<Outcome<A>>
  /** Tries a change waiting for the player again. */
  readonly retry: () => void
}

/** Whether `error` is the server's rules refusing (the API's `Refused`): never tried again. */
const refusalOf = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "_tag" in error && error._tag === "Refused" && "kind" in error && typeof error.kind === "string" ? error.kind : undefined

export const makeSaves = (options: {
  /** The account as the server first answered it. */
  readonly account: Account
  /** Reads the account back from the server. */
  readonly read: Effect.Effect<Account, unknown>
  /** Called after the account shown or the state changed. */
  readonly changed: (account: Account, state: SavesState) => void
  /** The pause between tries (the default doubles from half a second). */
  readonly schedule?: Schedule.Schedule<unknown, unknown>
  /** How many times a change is tried again before giving up (or asking the player, for one that must not be lost). */
  readonly tries?: number
}): Saves => {
  const schedule = options.schedule ?? Schedule.exponential("500 millis")
  const tries = options.tries ?? 3
  const queue = Semaphore.makeUnsafe(1)
  const waiting = Latch.makeUnsafe(false)
  let confirmed = options.account
  let failed = false
  /** Changes worked out here and not answered yet, in order. */
  const shown: Array<{ readonly apply: (account: Account) => Account }> = []
  let pending = 0
  const account = () => shown.reduce((next, change) => change.apply(next), confirmed)
  const state = (): SavesState => ({ pending, failed })
  const announce = () => options.changed(account(), state())

  const submit = <A>(change: Change<A>): Promise<Outcome<A>> => {
    const local = change.apply === undefined ? undefined : { apply: change.apply }
    if (local !== undefined) shown.push(local)
    if (change.keep) pending += 1
    announce()
    const settle = (outcome: Outcome<A>) =>
      Effect.sync(() => {
        if (local !== undefined) shown.splice(shown.indexOf(local), 1)
        if (change.keep) pending -= 1
        if ("saved" in outcome) confirmed = change.accountOf(outcome.saved)
        announce()
        return outcome
      })
    const send = Effect.gen(function*() {
      const before = confirmed
      const first = yield* Ref.make(true)
      // After a failure, the server may have made the change and lost the answer: read the account back first.
      const attempt = Effect.gen(function*() {
        if (!(yield* Ref.getAndSet(first, false)) && change.landed !== undefined) {
          const found = change.landed(before, yield* options.read)
          if (found !== undefined) return found
        }
        return yield* change.send
      })
      const tried = change.again ? Effect.retry(attempt, { schedule, times: change.tries ?? tries, while: (error) => refusalOf(error) === undefined }) : attempt
      for (;;) {
        const exit = yield* Effect.exit(tried)
        if (exit._tag === "Success") return { saved: exit.value } as Outcome<A>
        const refused = refusalOf(Option.getOrUndefined(Cause.findErrorOption(exit.cause)))
        if (refused !== undefined) return { refused }
        yield* Effect.logWarning("An account change could not be saved", exit.cause)
        if (!change.keep) {
          // The server may have made it: the account as it has it now, if it can be read.
          yield* options.read.pipe(Effect.tap((now) => Effect.sync(() => (confirmed = now))), Effect.ignore)
          return { failed: true } as const
        }
        // It must not be lost: everything after it waits until the player tries again.
        failed = true
        announce()
        yield* waiting.close
        yield* waiting.await
        failed = false
        announce()
      }
    })
    return Effect.runPromise(queue.withPermits(1)(Effect.flatMap(send, settle)))
  }

  return {
    account,
    state,
    submit,
    retry: () => void Effect.runFork(waiting.open)
  }
}
