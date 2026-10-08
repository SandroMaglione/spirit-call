import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import { describe, expect, it } from "vitest"

import { createAccount, earn } from "../src/account/account.ts"
import type { Account } from "../src/account/account.ts"
import { makeSaves } from "../src/app/saves.ts"
import type { Change, SavesState } from "../src/app/saves.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"

const gold = (account: Account) => account.wallet.gold ?? 0

/** A server holding one account, and the saves in front of it (tried again at once, twice). */
const setup = () => {
  const server = { account: createAccount(defaultTuning, newAccount, "account-1", 1000), sent: [] as Array<string>, failures: 0, refuse: false }
  const seen: Array<{ readonly gold: number; readonly state: SavesState }> = []
  const saves = makeSaves({
    account: server.account,
    read: Effect.sync(() => server.account),
    changed: (account, state) => seen.push({ gold: gold(account), state }),
    schedule: Schedule.spaced("1 millis"),
    tries: 2
  })
  /** Adds `amount` gold on the server (failing the first `server.failures` times; made but answered with a failure when `lost`). */
  const pay = (amount: number, options: { readonly keep?: boolean; readonly again?: boolean; readonly lost?: boolean; readonly wait?: number } = {}): Change<Account> => ({
    send: Effect.gen(function*() {
      server.sent.push(`start ${amount}`)
      yield* Effect.sleep(options.wait ?? 1)
      if (server.refuse) return yield* Effect.fail({ _tag: "Refused", kind: "notEnough" })
      if (options.lost === true && server.sent.filter((line) => line === `start ${amount}`).length === 1) {
        server.account = earn(server.account, { gold: amount })
        return yield* Effect.fail(new Error("The answer was lost"))
      }
      if (server.failures > 0) {
        server.failures -= 1
        return yield* Effect.fail(new Error("No connection"))
      }
      server.account = earn(server.account, { gold: amount })
      server.sent.push(`end ${amount}`)
      return server.account
    }),
    accountOf: (account) => account,
    apply: (account) => earn(account, { gold: amount }),
    keep: options.keep ?? true,
    again: options.again ?? true,
    landed: (before, now) => (gold(now) > gold(before) ? now : undefined)
  })
  return { server, saves, seen, pay }
}

describe("saves", () => {
  it("sends changes one at a time, in the order they were made", async () => {
    const { server, saves, pay } = setup()
    await Promise.all([saves.submit(pay(10, { wait: 20 })), saves.submit(pay(5)), saves.submit(pay(1))])
    expect(server.sent).toEqual(["start 10", "end 10", "start 5", "end 5", "start 1", "end 1"])
    expect(gold(saves.account())).toBe(gold(server.account))
  })

  it("shows a change the game works out at once, on top of what the server answered", async () => {
    const { server, saves, pay } = setup()
    const start = gold(server.account)
    const first = saves.submit(pay(10, { wait: 10 }))
    const second = saves.submit(pay(5))
    // Both shown before the server answered either.
    expect(gold(saves.account())).toBe(start + 15)
    expect(saves.state()).toEqual({ pending: 2, failed: false })
    await first
    expect(gold(saves.account())).toBe(start + 15)
    await second
    expect(gold(saves.account())).toBe(start + 15)
    expect(saves.state()).toEqual({ pending: 0, failed: false })
  })

  it("tries a failed change again by itself", async () => {
    const { server, saves, pay } = setup()
    server.failures = 2
    expect(await saves.submit(pay(10))).toEqual({ saved: server.account })
    expect(saves.state().failed).toBe(false)
  })

  it("keeps a change that must not be lost until the player tries again, and everything after it waits", async () => {
    const { server, saves, seen, pay } = setup()
    const start = gold(server.account)
    server.failures = 10
    const run = saves.submit(pay(10))
    const next = saves.submit(pay(5))
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(saves.state()).toEqual({ pending: 2, failed: true })
    // Still shown: nothing is lost while it waits.
    expect(gold(saves.account())).toBe(start + 15)
    expect(server.sent).not.toContain("start 5")
    server.failures = 0
    saves.retry()
    await Promise.all([run, next])
    expect(server.sent.slice(-4)).toEqual(["start 10", "end 10", "start 5", "end 5"])
    expect(gold(server.account)).toBe(start + 15)
    expect(saves.state()).toEqual({ pending: 0, failed: false })
    expect(seen.some((entry) => entry.state.failed)).toBe(true)
  })

  it("gives up on a change that may be lost, without holding the ones after it", async () => {
    const { server, saves, pay } = setup()
    server.failures = 3
    expect(await saves.submit(pay(10, { keep: false }))).toEqual({ failed: true })
    expect(saves.state()).toEqual({ pending: 0, failed: false })
    expect(await saves.submit(pay(5))).toEqual({ saved: server.account })
  })

  it("does not make a change twice when the server made it and the answer was lost", async () => {
    const { server, saves, pay } = setup()
    const start = gold(server.account)
    await saves.submit(pay(10, { lost: true }))
    expect(gold(server.account)).toBe(start + 10)
    expect(server.sent.filter((line) => line === "start 10")).toHaveLength(1)
    expect(gold(saves.account())).toBe(start + 10)
  })

  it("drops a change the server refuses, never trying it again", async () => {
    const { server, saves, pay } = setup()
    const start = gold(server.account)
    server.refuse = true
    const outcome = saves.submit(pay(10))
    expect(gold(saves.account())).toBe(start + 10)
    expect(await outcome).toEqual({ refused: "notEnough" })
    expect(server.sent).toEqual(["start 10"])
    expect(gold(saves.account())).toBe(start)
  })
})
