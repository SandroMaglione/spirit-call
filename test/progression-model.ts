/**
 * A new account's progress along the main line, played through the
 * account's own rules (`recordRun`, `train`, `ascend`); see
 * `scripts/progression.ts`, which reports it, and `scripts/expected.ts`,
 * which fights each quest with the team it gives.
 *
 * The account plays every quest at every rank as it opens, the lowest
 * enemies first, with its first three characters (the Spirit Call's first
 * character joining in chapter 3, unless `calls` is off), each first clear
 * earning its first two stars. Before each quest it trains its
 * team evenly with all the gold it holds, and ascends whoever stands at a
 * step when it holds the material. A quest is entered once the team's
 * average level reaches its enemies'; until then the account farms: the
 * element trial of a member stuck at a step for its material (the highest
 * rank open), otherwise the highest main quest cleared, for gold. Every
 * `runsPerWeek` runs, a week of hardcore clears the open tiers at most a few
 * levels above the team.
 */
import { ascend, ascensionStep, characterLevel, createAccount, encounterOf, playLock, questCleared, questLevel, questLock, recordRun, train } from "../src/account/account.ts"
import type { Account, Play } from "../src/account/account.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import type { CharacterId } from "../src/content/characters.ts"
import type { ElementId } from "../src/content/elements.ts"
import type { TrackId } from "../src/content/hardcore.ts"
import type { QuestId } from "../src/content/quests.ts"
import type { Tally } from "../src/content/stars.ts"
import type { RunResultValue } from "../src/schema.ts"

export interface ProgressionOptions {
  readonly calls: boolean
  readonly runsPerWeek: number
}

/** A member of the team, at her level. */
export interface Member {
  readonly character: CharacterId
  readonly level: number
}

/** The account before a main quest: its team, how much it farmed to be ready, and what it held after clearing it. */
export interface ProgressionRow {
  readonly quest: QuestId
  readonly rank: number
  /** The runs played once it is cleared. */
  readonly runs: number
  readonly enemyLevel: number
  /** The team that enters the quest. */
  readonly team: ReadonlyArray<Member>
  /** Runs of farming before it: in all, and of them in a trial (for a step's material). */
  readonly farmed: number
  readonly trial: number
  /** Members who waited at a step with no trial open for their element. */
  readonly walls: ReadonlyArray<CharacterId>
  /** The team once the quest and the side quests it opens are cleared (and the gold spent). */
  readonly after: ReadonlyArray<Member>
  readonly gold: number
  /** Crystals earned so far (the model never spends them). */
  readonly crystals: number
  readonly materials: Readonly<Record<string, number>>
}

export interface Progression {
  readonly rows: ReadonlyArray<ProgressionRow>
  readonly runs: number
}

const tierReach = 4
const noTally: Tally = { hitsTaken: 99, perfectDodges: 0, breaks: 0 }

export const simulateProgression = (tuning: Tuning, options: ProgressionOptions = { calls: true, runsPerWeek: 40 }): Progression => {
  const firstBanner = Object.keys(tuning.banners)[0] as keyof typeof tuning.banners
  const called: CharacterId | null = options.calls ? tuning.banners[firstBanner].characters[0]! : null
  const main = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].line === "main")
  const side = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].line === "secondary")
  let account: Account = createAccount(tuning, newAccount, "progression", 0)
  let runs = 0
  let now = tuning.reset.anchor

  const team = (): ReadonlyArray<CharacterId> => (Object.keys(account.owned.characters) as Array<CharacterId>).slice(0, 3)
  const level = (character: CharacterId) => characterLevel(tuning, account, character).level
  const members = (): ReadonlyArray<Member> => team().map((character) => ({ character, level: level(character) }))
  const average = () => team().reduce((sum, character) => sum + level(character), 0) / team().length
  const cleared = (quest: QuestId, rank = 1) => questCleared(account, quest, rank)

  /** A tally meeting the first two stars of `quest` (the clear and its idea), not the hit budget. */
  const tallyFor = (quest: QuestId): Tally => {
    const tally: Record<string, number> = { ...noTally }
    const goal = tuning.quests[quest].stars[1]
    if (goal.kind === "tally" && goal.least !== undefined) tally[goal.tally] = goal.least
    return tally as Tally
  }

  const clear = (target: Play, tally: Tally = noTally, wave = 8) => {
    const result = { cleared: true, progress: 1, team: team(), reactions: [], tally, challenge: encounterOf(tuning, target).challenge, wave, kills: 30, time: 200 } as RunResultValue
    account = recordRun(tuning, account, target, result, now).account
  }

  /** A week of hardcore: every open tier whose enemies are at most a few levels above the team. */
  const hardcoreWeek = () => {
    for (const track of Object.keys(tuning.tracks) as Array<TrackId>) {
      if (tuning.tracks[track].kind !== "hardcore") continue
      tuning.tracks[track].tiers.forEach((tier, index) => {
        const target: Play = { kind: "tier", track, tier: index + 1 }
        if (tier.enemyLevel <= average() + tierReach && playLock(tuning, account, target) === null) clear(target, noTally, 10)
      })
    }
  }

  const play = (target: Play, tally: Tally = noTally) => {
    clear(target, tally)
    runs += 1
    now += (7 * 24 * 60 * 60 * 1000) / options.runsPerWeek
    if (runs % options.runsPerWeek === 0) hardcoreWeek()
  }

  /** Trains the team evenly (the lowest first) with the gold held, ascending whoever stands at a step and can. */
  const spend = () => {
    for (;;) {
      let moved = false
      for (const character of [...team()].sort((a, b) => level(a) - level(b))) {
        const ascended = ascend(tuning, account, character)
        const step = ascended.ok ? ascended : train(tuning, account, character)
        if (step.ok) {
          account = step.value
          moved = true
          break
        }
      }
      if (!moved) return
    }
  }

  /** The highest open rank of `element`'s trial, if one is open. */
  const trialRank = (element: ElementId): Play | null => {
    const track = (Object.keys(tuning.tracks) as Array<TrackId>).find((id) => tuning.tracks[id].kind === "trial" && tuning.tracks[id].element === element)
    if (track === undefined) return null
    return tuning.tracks[track].tiers.map((_, index): Play => ({ kind: "tier", track, tier: index + 1 })).findLast((target) => playLock(tuning, account, target) === null) ?? null
  }

  const rows: Array<ProgressionRow> = []
  // Every quest at every rank, played as it opens: the lowest enemies first (the main line before a side quest or a rank at the same level).
  const all = [...main, ...side].flatMap((quest) => Array.from({ length: tuning.ranks.count }, (_, index) => ({ quest, rank: index + 1 })))
  const order = (pick: { readonly quest: QuestId; readonly rank: number }) => questLevel(tuning, pick.quest, pick.rank) * 100 + pick.rank * 10 + (tuning.quests[pick.quest].line === "main" ? 0 : 1)
  let best: Play | null = null, bestLevel = 0
  for (;;) {
    const next = all.filter(({ quest, rank }) => !cleared(quest, rank) && questLock(tuning, account, quest, rank) === null).sort((a, b) => order(a) - order(b))[0]
    if (next === undefined) break
    const spec = tuning.quests[next.quest], enemyLevel = questLevel(tuning, next.quest, next.rank)
    if (called !== null && spec.chapter === "three" && account.owned.characters[called] === undefined) {
      account = { ...account, owned: { ...account.owned, characters: { ...account.owned.characters, [called]: { unlockedAt: now, experience: 0, ascension: 0 } } } }
    }
    spend()
    let farmed = 0, trial = 0
    const walls = new Set<CharacterId>()
    while (average() < Math.min(enemyLevel, tuning.progression.character.curve.maxLevel) && farmed < 400) {
      // Someone waiting at a step for her material (with the gold for it) farms her element's trial; otherwise the best quest cleared, for gold.
      const waiting = team().find((character) => {
        const step = ascensionStep(tuning, account, character)
        return step !== null && !ascend(tuning, account, character).ok && (account.wallet.gold ?? 0) >= step.gold
      })
      const rank = waiting === undefined ? null : trialRank(tuning.characters[waiting].element)
      if (waiting !== undefined && rank === null) walls.add(waiting)
      if (rank !== null) {
        play(rank)
        trial += 1
      } else if (best !== null) play(best)
      else break
      farmed += 1
      spend()
    }
    const entering = members()
    const target: Play = { kind: "quest", quest: next.quest, ...(next.rank === 1 ? {} : { rank: next.rank }) }
    play(target, tallyFor(next.quest))
    if (enemyLevel >= bestLevel) {
      best = target
      bestLevel = enemyLevel
    }
    spend()
    const materials = Object.fromEntries(Object.entries(account.wallet).filter(([id, amount]) => Object.hasOwn(tuning.materials, id) && (amount ?? 0) > 0)) as Record<string, number>
    if (spec.line === "main") rows.push({ quest: next.quest, rank: next.rank, enemyLevel, team: entering, farmed, trial, walls: [...walls], after: members(), gold: account.wallet.gold ?? 0, crystals: account.wallet.crystals ?? 0, materials, runs })
  }
  return { rows, runs }
}
