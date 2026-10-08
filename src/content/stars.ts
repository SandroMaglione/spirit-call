/**
 * Stars: the goals a quest's cleared run can meet, three per quest (see
 * docs/quests.md). Every star is a goal on top of the clear: a clear alone
 * earns none. A goal is a tally the arena counts, with a bound. Every tally
 * counts something any team can do, whoever is in it and however many:
 * nothing here names a character, an element, a class, or a time, so every
 * star is open to every team (`validateContent` keeps goals to these
 * tallies).
 *
 * A new kind of goal is a new tally: an entry here, and its count in the
 * run (see `RecordTally`).
 */

/** What the arena counts in a run, for stars. */
export const tallies = {
  /** Blows that landed on the team (a burn's ticks are not blows). */
  hitsTaken: { name: "Hits taken", least: "Take at least # hits", most: "Take at most # hits" },
  perfectDodges: { name: "Perfect dodges", least: "Dodge perfectly # times", most: "Dodge perfectly at most # times" },
  /** Enemies broken (see `Poise`). */
  breaks: { name: "Breaks", least: "Break enemies # times", most: "Break enemies at most # times" },
  /** Members of the team who fell (a solo character falling loses the run). */
  falls: { name: "Falls", least: "Fall at least # times", most: "At most # falls" },
  /** The team's health at the end, as a share of all of it (fallen members count none), in whole percent. */
  healthLeft: { name: "Health left", least: "Finish with at least #% health", most: "Finish with at most #% health" },
  /** The longest chain of perfect dodges (see `DodgeChain`). */
  longestChain: { name: "Dodge chain", least: "Chain # perfect dodges", most: "Chain at most # perfect dodges" },
  /** Ultimates used. */
  ultimates: { name: "Ultimates", least: "Use # ultimates", most: "Use at most # ultimates" }
} as const satisfies Record<string, { readonly name: string; readonly least: string; readonly most: string }>

export type TallyId = keyof typeof tallies

/** The run's count of each tally. */
export type Tally = { readonly [Id in TallyId]: number }

/** A run's tally before anything happened in it. */
export const noTally: Tally = { hitsTaken: 0, perfectDodges: 0, breaks: 0, falls: 0, healthLeft: 100, longestChain: 0, ultimates: 0 }

/** A clear that meets no goal: hit often, fallen, ending low, with nothing done well (for models and tools). */
export const worstClear: Tally = { hitsTaken: 999, perfectDodges: 0, breaks: 0, falls: 2, healthLeft: 1, longestChain: 0, ultimates: 0 }

/** One star's goal, met by a run that clears: a tally of at least `least`, or at most `most`. */
export interface StarGoal {
  readonly tally: TallyId
  readonly least?: number
  readonly most?: number
}

export const atLeast = (tally: TallyId, least: number): StarGoal => ({ tally, least })
export const atMost = (tally: TallyId, most: number): StarGoal => ({ tally, most })
/** Nobody in the team falls. */
export const nobodyFalls = (): StarGoal => atMost("falls", 0)

/** Whether a run that ended `wasCleared` with `tally` meets `goal` (a star needs the clear). */
export const meets = (goal: StarGoal, wasCleared: boolean, tally: Tally): boolean => {
  if (!wasCleared) return false
  const count = tally[goal.tally]
  return (goal.least === undefined || count >= goal.least) && (goal.most === undefined || count <= goal.most)
}

/** `from`, each tally moved just enough to meet every one of `goals` (for models and tools). */
export const tallyMeeting = (goals: ReadonlyArray<StarGoal>, from: Tally = worstClear): Tally => {
  const tally: Record<TallyId, number> = { ...from }
  for (const goal of goals) {
    if (goal.least !== undefined) tally[goal.tally] = Math.max(tally[goal.tally], goal.least)
    if (goal.most !== undefined) tally[goal.tally] = Math.min(tally[goal.tally], goal.most)
  }
  return tally
}

/** What a run counted toward `goal`, in a word or two ("4", "62%"). */
export const describeCount = (goal: StarGoal, tally: Tally): string => goal.tally === "healthLeft" ? `${tally.healthLeft}%` : String(tally[goal.tally])

/** A goal in a few words, for the quest card ("Take at most 12 hits"). */
export const describeGoal = (goal: StarGoal): string => {
  if (goal.tally === "falls" && goal.most === 0) return "Nobody falls"
  const words = tallies[goal.tally]
  return goal.least !== undefined ? words.least.replace("#", String(goal.least)) : words.most.replace("#", String(goal.most ?? 0))
}
