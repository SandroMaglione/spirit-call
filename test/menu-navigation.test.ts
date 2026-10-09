import { describe, expect, it } from "vitest"
import { createAccount, playLock, recordRun } from "../src/account/account.ts"
import type { Account, Play } from "../src/account/account.ts"
import { defaultTuning as tuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { nextAfter, nextMainQuest, playsIn, selectionIn, sourceOf, tabOf } from "../src/ui/navigation.ts"
import { noTally } from "../src/content/stars.ts"

const account = createAccount(tuning, newAccount, "menu-test", 0)

describe("menu navigation", () => {
  it("always previews a challenge from the displayed category, including locked categories", () => {
    for (const tab of ["main", "secondary", "hardcore"] as const) {
      const selection = selectionIn(tuning, account, tab, account.selection.play)
      expect(playsIn(tuning, tab)).toContainEqual(selection)
      expect(selectionIn(tuning, account, tab, selection)).toEqual(selection)
    }
  })
  it("moves the next objective past cleared quests and resolves real unlock sources", () => {
    expect(nextMainQuest(tuning, account)).toEqual({ kind: "quest", quest: "firstBlood" })
    const cleared = recordRun(tuning, account, { kind: "quest", quest: "firstBlood" }, {
      cleared: true, progress: 1, team: ["swordsman"], reactions: [], tally: noTally, challenge: "swarm", wave: 3, kills: 9, time: 60
    }, 1).account
    expect(nextMainQuest(tuning, cleared)).toEqual({ kind: "quest", quest: "crossfire" })
    const source = sourceOf(tuning, { kind: "character", id: "tidecaller" })
    expect(source).not.toBeNull()
    expect(tuning.quests[source!].rewards.unlocks).toContainEqual({ kind: "character", id: "tidecaller" })
  })
  it("goes on in the list just played: after a side quest, the next side quest", () => {
    const clear = (on: Account, play: Play): Account => recordRun(tuning, on, play, {
      cleared: true, progress: 1, team: ["swordsman"], reactions: [], tally: noTally, challenge: "swarm", wave: 3, kills: 9, time: 60
    }, 1).account
    let played = account
    for (const play of playsIn(tuning, "main")) played = clear(played, play)
    const [first, second] = playsIn(tuning, "secondary")
    expect(playLock(tuning, played, first!)).toBeNull()
    const after = clear(played, first!)
    expect(nextAfter(tuning, after, first!)).toEqual(second)
    expect(tabOf(tuning, second!)).toBe("secondary")
    // With no side quest open, the main line's next.
    const fresh = clear(clear(clear(account, playsIn(tuning, "main")[0]!), playsIn(tuning, "main")[1]!), playsIn(tuning, "main")[2]!)
    const openSide = playsIn(tuning, "secondary").filter((play) => playLock(tuning, fresh, play) === null)
    const lastOpen = clear(openSide.reduce(clear, fresh), openSide[openSide.length - 1]!)
    expect(playsIn(tuning, "secondary").some((play) => playLock(tuning, lastOpen, play) !== null)).toBe(true)
    expect(nextAfter(tuning, lastOpen, openSide[openSide.length - 1]!)).toEqual(nextMainQuest(tuning, lastOpen))
    // The main line's next stays the main line's.
    expect(nextAfter(tuning, after, playsIn(tuning, "main")[0]!)?.kind).toBe("quest")
    expect(tabOf(tuning, nextAfter(tuning, after, playsIn(tuning, "main")[0]!)!)).toBe("main")
  })
})
