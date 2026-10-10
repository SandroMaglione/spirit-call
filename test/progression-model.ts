/**
 * A new account played through the whole game on the account's own rules
 * (`recordRun`, `train`, `ascend`); see `scripts/progression.ts`, which
 * reports it, and `scripts/expected.ts`, which fights each quest with the
 * team it gives. It measures the pace the release is built for (see
 * docs/collection.md): the hour each character, aspect, relic, and look
 * arrives, when everything is owned, when the main team reaches the top
 * level, and when all ten do.
 *
 * The account plays every quest at every rank as it opens, the lowest
 * enemies first, each first clear earning its first two stars; a
 * quest-rank whose perfect clear gives something takes `perfectTries` runs
 * more, the last perfect. Its team is its three highest-level characters.
 * Before each quest it trains its team evenly with all the gold it holds
 * (and, once they wait at a step, the rest of the roster), and ascends
 * whoever stands at a step when it holds the essence. A quest is entered
 * once the team's average level reaches its enemies'; until then the
 * account farms: a trial for a member stuck at a step (her element's at
 * grade 1, the highest rank of the grade otherwise), else the highest
 * quest cleared, for gold. Hardcore tiers are cleared once each, as soon
 * as their enemies are at most a few levels above the team; an audition's
 * part takes `auditionTries` runs, the last a clear. Once nothing is left
 * to clear, it farms until all ten characters are at the top level (or
 * `maxRuns` runs).
 */
import { ascend, ascensionStep, characterLevel, createAccount, encounterOf, lentFor, owns, playLock, questCleared, questLevel, questLock, recordRun, sourcesOf, tierProgress, train } from "../src/account/account.ts"
import type { Account, Earned, Item, Play } from "../src/account/account.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import type { CharacterId } from "../src/content/characters.ts"
import { perfectUnlock } from "../src/content/collection.ts"
import type { TrackId } from "../src/content/hardcore.ts"
import type { QuestId } from "../src/content/quests.ts"
import { tallyMeeting, worstClear } from "../src/content/stars.ts"
import type { Tally } from "../src/content/stars.ts"
import type { RunResultValue } from "../src/schema.ts"

export interface ProgressionOptions {
  /** Runs played in an hour of play (a run is about four minutes, with the menus between). */
  readonly runsPerHour: number
  /** How many levels below a quest's enemies the team goes in (a skilled player; negative waits above them), and in hardcore. 0 by default. */
  readonly levelsAhead?: number
  /** The share of runs lost (each paying its half-way progress), spread evenly over every kind of run. 0 by default. */
  readonly lost?: number
  /** Runs before a perfect clear that gives something (the last of them perfect). 3 by default. */
  readonly perfectTries?: number
  /** Runs of each part of an audition (the last a clear). 2 by default. */
  readonly auditionTries?: number
  /** When to stop if the roster is not all at the top level by then. 6000 by default. */
  readonly maxRuns?: number
  /** Told of every step the account takes, to follow it run by run (see tools/progress); it only reads. */
  readonly observe?: (step: ProgressionStep) => void
}

/** A step of the account: a run recorded, or gold and essence spent. */
export type ProgressionStep =
  | { readonly kind: "run"; readonly play: Play; readonly earned: Earned; readonly account: Account; readonly runs: number; readonly counted: boolean }
  | { readonly kind: "spent"; readonly account: Account; readonly runs: number }

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
  /** Runs of farming before it: in all, and of them in a trial (for a step's essence). */
  readonly farmed: number
  readonly trial: number
  /** Members who waited at a step with no trial open for their essence. */
  readonly walls: ReadonlyArray<CharacterId>
  /** The team once the quest is cleared (and the gold spent). */
  readonly after: ReadonlyArray<Member>
  readonly gold: number
  readonly materials: Readonly<Record<string, number>>
}

/** Something made the account's, and the run it came on. */
export interface Arrival {
  readonly item: Item
  readonly runs: number
}

export interface Progression {
  readonly rows: ReadonlyArray<ProgressionRow>
  /** Every item the account came to own, in order. */
  readonly arrivals: ReadonlyArray<Arrival>
  /** The run the last item came on (everything owned), or `null` when the collection was not completed. */
  readonly collected: number | null
  /** The run the main team (three) all reached the top level, and all ten did; `null` if never. */
  readonly teamMaxed: number | null
  readonly allMaxed: number | null
  readonly runs: number
  readonly runsPerHour: number
}

const tierReach = 4
const noTally: Tally = worstClear

export const simulateProgression = (tuning: Tuning, options: ProgressionOptions = { runsPerHour: 15 }): Progression => {
  const main = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].line === "main")
  const side = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].line === "secondary")
  const tracks = Object.keys(tuning.tracks) as Array<TrackId>
  const maxLevel = tuning.progression.character.curve.maxLevel
  const perfectTries = options.perfectTries ?? 3, auditionTries = options.auditionTries ?? 2, maxRuns = options.maxRuns ?? 6000
  let account: Account = createAccount(tuning, newAccount, "progression", 0)
  let runs = 0
  const arrivals: Array<Arrival> = []
  let teamMaxed: number | null = null, allMaxed: number | null = null

  const level = (character: CharacterId) => characterLevel(tuning, account, character).level
  const roster = (): ReadonlyArray<CharacterId> => Object.keys(account.owned.characters) as Array<CharacterId>
  // The team: the three highest-level characters (the earliest owned first among equals).
  const team = (): ReadonlyArray<CharacterId> => [...roster()].sort((a, b) => level(b) - level(a)).slice(0, 3)
  const members = (): ReadonlyArray<Member> => team().map((character) => ({ character, level: level(character) }))
  const average = () => team().reduce((sum, character) => sum + level(character), 0) / team().length
  const cleared = (quest: QuestId, rank = 1) => questCleared(account, quest, rank)

  /** A tally meeting the first two stars of `quest` (a decent run and its idea), not the clean run's; or all three for a perfect run. */
  const tallyFor = (quest: QuestId, perfect = false): Tally => tallyMeeting(perfect ? tuning.quests[quest].stars : tuning.quests[quest].stars.slice(0, 2))

  const ahead = options.levelsAhead ?? 0
  // Losses owed before the next clear, so that a share `lost` of all runs are lost.
  const lostShare = Math.min(0.95, Math.max(0, options.lost ?? 0))
  const lossesPerClear = lostShare / (1 - lostShare)
  let owed = 0

  const record = (target: Play, tally: Tally, won: boolean) => {
    const lent = lentFor(tuning, target)
    const result = { cleared: won, progress: won ? 1 : 0.5, team: lent === null ? team() : [lent.character], reactions: [], tally, challenge: encounterOf(tuning, target).challenge, wave: won ? 8 : 4, kills: 30, time: 200 } as RunResultValue
    const recorded = recordRun(tuning, account, target, result, runs)
    account = recorded.account
    runs += 1
    for (const item of recorded.earned.granted) arrivals.push({ item, runs })
    options.observe?.({ kind: "run", play: target, earned: recorded.earned, account, runs, counted: true })
    checkMaxed()
  }

  const checkMaxed = () => {
    if (teamMaxed === null && roster().length >= 3 && team().every((character) => level(character) >= maxLevel)) teamMaxed = runs
    if (allMaxed === null && roster().length === Object.keys(tuning.characters).length && roster().every((character) => level(character) >= maxLevel)) allMaxed = runs
  }

  /** One clear of `target` (after the losses owed), its stars as `tally`. */
  const play = (target: Play, tally: Tally = noTally) => {
    owed += lossesPerClear
    for (; owed >= 1; owed -= 1) record(target, noTally, false)
    record(target, tally, true)
  }

  /** Trains the team evenly (the lowest first) with the gold held, ascending whoever stands at a step and can; once none of it can move, the rest of the roster. */
  const spend = () => {
    const before = account
    for (;;) {
      let moved = false
      const inTeam = team()
      const bench = roster().filter((character) => !inTeam.includes(character))
      for (const group of [inTeam, bench]) {
        for (const character of [...group].sort((a, b) => level(a) - level(b))) {
          const ascended = ascend(tuning, account, character)
          const step = ascended.ok ? ascended : train(tuning, account, character)
          if (step.ok) {
            account = step.value
            moved = true
            break
          }
        }
        if (moved) break
      }
      if (!moved) break
    }
    if (account !== before) {
      options.observe?.({ kind: "spent", account, runs })
      checkMaxed()
    }
  }

  /** The trial rank to farm for `character`'s next step: her element's highest open at grade 1, else the highest open rank paying the step's grade. */
  const trialFor = (character: CharacterId): Play | null => {
    const step = ascensionStep(tuning, account, character)
    if (step === null) return null
    const element = tuning.characters[character].element
    const candidates = tracks.filter((id) => tuning.tracks[id].kind === "trial" && (step.grade > 1 || tuning.tracks[id].element === element)).flatMap((track) =>
      tuning.tracks[track].tiers.flatMap((tier, index): Array<{ play: Play; level: number }> => {
        const target: Play = { kind: "tier", track, tier: index + 1 }
        const grade = Math.min(3, tier.opensRank)
        return grade === step.grade && playLock(tuning, account, target) === null ? [{ play: target, level: tier.enemyLevel }] : []
      }))
    return candidates.sort((a, b) => b.level - a.level)[0]?.play ?? null
  }

  /** Every open track tier not cleared yet that the account takes on now: auditions whatever the team, hardcore tiers within reach. */
  const tiersOpen = (): ReadonlyArray<Play> => tracks.flatMap((track) => {
    const spec = tuning.tracks[track]
    if (spec.kind === "trial") return []
    return spec.tiers.flatMap((tier, index): Array<Play> => {
      const target: Play = { kind: "tier", track, tier: index + 1 }
      if ((tierProgress(account, track, index + 1)?.firstClearedAt ?? null) !== null || playLock(tuning, account, target) !== null) return []
      return spec.kind === "audition" || tier.enemyLevel <= average() + tierReach + ahead ? [target] : []
    })
  })

  /** Clears the tiers open now: an audition's part after `auditionTries - 1` losses. */
  const clearTiers = () => {
    for (let open = tiersOpen(); open.length > 0; open = tiersOpen()) {
      const target = open[0]!
      if (lentFor(tuning, target) !== null) for (let tries = 1; tries < auditionTries; tries++) record(target, noTally, false)
      play(target)
      spend()
    }
  }

  const rows: Array<ProgressionRow> = []
  // Every quest at every rank, played as it opens: the lowest enemies first (the main line before a side quest or a rank at the same level).
  const all = [...main, ...side].flatMap((quest) => Array.from({ length: tuning.ranks.count }, (_, index) => ({ quest, rank: index + 1 })))
  const order = (pick: { readonly quest: QuestId; readonly rank: number }) => questLevel(tuning, pick.quest, pick.rank) * 100 + pick.rank * 10 + (tuning.quests[pick.quest].line === "main" ? 0 : 1)
  let best: Play | null = null, bestLevel = 0

  /** Farms until the team's average reaches `enemyLevel`: a trial for a member at a step, else the best quest for gold. */
  const farmTo = (enemyLevel: number) => {
    let farmed = 0, trial = 0
    const walls = new Set<CharacterId>()
    while (average() < Math.min(enemyLevel - ahead, maxLevel) && farmed < 600 && runs < maxRuns) {
      const waiting = team().find((character) => {
        const step = ascensionStep(tuning, account, character)
        return step !== null && !ascend(tuning, account, character).ok && (account.wallet.gold ?? 0) >= step.gold
      })
      const rank = waiting === undefined ? null : trialFor(waiting)
      if (waiting !== undefined && rank === null) walls.add(waiting)
      if (rank !== null) {
        play(rank)
        trial += 1
      } else if (best !== null) play(best)
      else break
      farmed += 1
      spend()
    }
    return { farmed, trial, walls }
  }

  for (;;) {
    clearTiers()
    const next = all.filter(({ quest, rank }) => !cleared(quest, rank) && questLock(tuning, account, quest, rank) === null).sort((a, b) => order(a) - order(b))[0]
    if (next === undefined || runs >= maxRuns) break
    const spec = tuning.quests[next.quest], enemyLevel = questLevel(tuning, next.quest, next.rank)
    spend()
    const { farmed, trial, walls } = farmTo(enemyLevel)
    const entering = members()
    const target: Play = { kind: "quest", quest: next.quest, ...(next.rank === 1 ? {} : { rank: next.rank }) }
    // A quest-rank whose perfect clear gives something is played until it is perfect.
    const prize = perfectUnlock(tuning, next.quest, next.rank)
    if (prize !== null) {
      for (let tries = 1; tries < perfectTries; tries++) play(target, tallyFor(next.quest))
      play(target, tallyFor(next.quest, true))
    } else play(target, tallyFor(next.quest))
    if (enemyLevel >= bestLevel) {
      best = target
      bestLevel = enemyLevel
    }
    spend()
    const materials = Object.fromEntries(Object.entries(account.wallet).filter(([id, amount]) => Object.hasOwn(tuning.materials, id) && (amount ?? 0) > 0)) as Record<string, number>
    if (spec.line === "main") rows.push({ quest: next.quest, rank: next.rank, enemyLevel, team: entering, farmed, trial, walls: [...walls], after: members(), gold: account.wallet.gold ?? 0, materials, runs })
  }
  // Whatever tier is left (above the team's reach until now) is farmed up to and cleared.
  for (let guard = 0; guard < 50 && runs < maxRuns; guard++) {
    const left = tracks.flatMap((track) => tuning.tracks[track].kind === "hardcore" ? tuning.tracks[track].tiers.flatMap((tier, index) => {
      const target: Play = { kind: "tier", track, tier: index + 1 }
      return (tierProgress(account, track, index + 1)?.firstClearedAt ?? null) === null && playLock(tuning, account, target) === null ? [{ target, level: tier.enemyLevel }] : []
    }) : []).sort((a, b) => a.level - b.level)[0]
    if (left === undefined) break
    farmTo(left.level - tierReach)
    play(left.target)
    spend()
    clearTiers()
  }
  const everything = sourcesOf(tuning)
  const collected = everything.every((each) => owns(account, each.item)) ? (arrivals.at(-1)?.runs ?? runs) : null
  // Then levels: the roster farmed to the top (each one's next step's essence, else gold).
  while (allMaxed === null && runs < maxRuns) {
    const waiting = [...roster()].sort((a, b) => level(a) - level(b)).find((character) => {
      const step = ascensionStep(tuning, account, character)
      return step !== null && !ascend(tuning, account, character).ok && (account.wallet.gold ?? 0) >= step.gold
    })
    const rank = waiting === undefined ? null : trialFor(waiting)
    if (rank !== null) play(rank)
    else if (best !== null) play(best)
    else break
    spend()
  }
  return { rows, arrivals, collected, teamMaxed, allMaxed, runs, runsPerHour: options.runsPerHour }
}
