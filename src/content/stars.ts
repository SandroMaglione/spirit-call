/**
 * Stars: the goals a quest's cleared run can meet, three per quest (see
 * docs/quests.md). A goal is the clear itself, or a tally the arena counts
 * with a bound. Every tally counts something any team can do, whoever is in
 * it and however many: nothing here names a character, an element, a class,
 * or a time, so every star is open to every team (`validateContent` keeps
 * goals to these tallies).
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
  breaks: { name: "Breaks", least: "Break enemies # times", most: "Break enemies at most # times" }
} as const satisfies Record<string, { readonly name: string; readonly least: string; readonly most: string }>

export type TallyId = keyof typeof tallies

/** The run's count of each tally. */
export type Tally = { readonly [Id in TallyId]: number }

export const noTally: Tally = { hitsTaken: 0, perfectDodges: 0, breaks: 0 }

/** One star's goal, met by a run that clears. */
export type StarGoal =
  /** Clearing it. */
  | { readonly kind: "cleared" }
  /** A tally of at least `least`, or at most `most`. */
  | { readonly kind: "tally"; readonly tally: TallyId; readonly least?: number; readonly most?: number }

export const cleared = (): StarGoal => ({ kind: "cleared" })
export const atLeast = (tally: TallyId, least: number): StarGoal => ({ kind: "tally", tally, least })
export const atMost = (tally: TallyId, most: number): StarGoal => ({ kind: "tally", tally, most })

/** Whether a run that ended `wasCleared` with `tally` meets `goal` (a star needs the clear). */
export const meets = (goal: StarGoal, wasCleared: boolean, tally: Tally): boolean => {
  if (!wasCleared) return false
  if (goal.kind === "cleared") return true
  const count = tally[goal.tally]
  return (goal.least === undefined || count >= goal.least) && (goal.most === undefined || count <= goal.most)
}

/** A goal in a few words, for the quest card ("Take at most 12 hits"). */
export const describeGoal = (goal: StarGoal): string => {
  if (goal.kind === "cleared") return "Clear it"
  const words = tallies[goal.tally]
  return goal.least !== undefined ? words.least.replace("#", String(goal.least)) : words.most.replace("#", String(goal.most ?? 0))
}
