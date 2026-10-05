import { describe, expect, it } from "vitest"
import { createAccount, recordRun } from "../src/account/account.ts"
import { defaultTuning as tuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { nextMainQuest, playsIn, selectionIn, sourceOf } from "../src/ui/navigation.ts"
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
    expect(nextMainQuest(tuning, account)).toEqual({ kind: "quest", quest: "theSwarm" })
    const cleared = recordRun(tuning, account, { kind: "quest", quest: "theSwarm" }, {
      cleared: true, progress: 1, team: ["swordsman"], reactions: [], tally: noTally, challenge: "swarm", wave: 3, kills: 9, time: 60
    }, 1).account
    expect(nextMainQuest(tuning, cleared)).toEqual({ kind: "quest", quest: "crossfire" })
    const source = sourceOf(tuning, { kind: "character", id: "gunner" })
    expect(source).not.toBeNull()
    expect(tuning.quests[source!].rewards.unlocks).toContainEqual({ kind: "character", id: "gunner" })
  })
})
