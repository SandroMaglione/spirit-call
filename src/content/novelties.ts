/**
 * Novelties: the one new thing a main quest brings (see docs/quests.md, "A
 * quest is a question"), and what a challenge shows of each kind. The main
 * line introduces everything in order; whatever opens after a quest (the
 * next quests, side quests, ranks, hardcore tiers, Enemy Practice's picks)
 * shows only what was introduced up to it. `validateContent` holds the
 * content to it; the account knows what a player has met from the quests
 * she cleared.
 */
import type { ArenaId, ArenaSpec } from "./arena.ts"
import { entryChampion, entryElite, entryKind, entryShield } from "./challenges.ts"
import type { ChallengeId, ChallengeSpec, EliteElement } from "./challenges.ts"
import type { EnemyKind } from "./enemies.ts"
import type { QuestId, QuestSpec } from "./quests.ts"

/** Floors that hurt (see `HazardSpec`). */
export type HazardElement = ArenaSpec["hazards"][number]["element"]

/** One new thing: an enemy, a kind of floor, elites of some elements, a kind's champion, or shields. */
export type Novelty =
  | { readonly kind: "enemy"; readonly enemy: EnemyKind }
  | { readonly kind: "hazard"; readonly element: HazardElement }
  | { readonly kind: "elites"; readonly elements: ReadonlyArray<EliteElement> }
  | { readonly kind: "champion"; readonly enemy: EnemyKind }
  | { readonly kind: "shield" }

/** What a challenge shows, or what a player has met, by kind. */
export interface Seen {
  readonly enemies: ReadonlySet<EnemyKind>
  readonly hazards: ReadonlySet<HazardElement>
  readonly elites: ReadonlySet<EliteElement>
  /** The kinds whose champions come. */
  readonly champions: ReadonlySet<EnemyKind>
  readonly shield: boolean
}

export const nothingSeen: Seen = { enemies: new Set(), hazards: new Set(), elites: new Set(), champions: new Set(), shield: false }

/** What the content needs to tell what a challenge shows. */
interface Content {
  readonly challenges: { readonly [Id in ChallengeId]: ChallengeSpec }
  readonly arenas: { readonly [Id in ArenaId]: ArenaSpec }
}

/** What `challenge` shows: its enemies (scripted and endless), its arena's floors, its elites' elements, its champions' kinds, and whether a shield comes. A champion's element is part of the champion, not an elite. */
export const challengeShows = (content: Content, challenge: ChallengeId): Seen => {
  const spec = content.challenges[challenge]
  const entries = spec.waves.scripted.flat()
  return {
    enemies: new Set([...entries.map(entryKind), ...(spec.waves.endless?.kinds ?? [])]),
    hazards: new Set(content.arenas[spec.arena].hazards.map((hazard) => hazard.element)),
    elites: new Set([...entries.filter((entry) => !entryChampion(entry)).flatMap((entry) => entryElite(entry) ?? []), ...(spec.waves.endless?.elites ?? [])]),
    champions: new Set(entries.filter(entryChampion).map(entryKind)),
    shield: entries.some(entryShield)
  }
}

/** `seen` with `novelty` added. */
export const withNovelty = (seen: Seen, novelty: Novelty): Seen => {
  switch (novelty.kind) {
    case "enemy":
      return { ...seen, enemies: new Set([...seen.enemies, novelty.enemy]) }
    case "hazard":
      return { ...seen, hazards: new Set([...seen.hazards, novelty.element]) }
    case "elites":
      return { ...seen, elites: new Set([...seen.elites, ...novelty.elements]) }
    case "champion":
      return { ...seen, champions: new Set([...seen.champions, novelty.enemy]) }
    case "shield":
      return { ...seen, shield: true }
  }
}

/** Whether `seen` already holds `novelty`. */
export const holds = (seen: Seen, novelty: Novelty): boolean => {
  switch (novelty.kind) {
    case "enemy":
      return seen.enemies.has(novelty.enemy)
    case "hazard":
      return seen.hazards.has(novelty.element)
    case "elites":
      return novelty.elements.every((element) => seen.elites.has(element))
    case "champion":
      return seen.champions.has(novelty.enemy)
    case "shield":
      return seen.shield
  }
}

/** What `shows` holds beyond `known`, in words (empty when nothing). */
export const beyond = (shows: Seen, known: Seen): Array<string> => [
  ...[...shows.enemies].filter((kind) => !known.enemies.has(kind)).map((kind) => `the ${kind}`),
  ...[...shows.hazards].filter((element) => !known.hazards.has(element)).map((element) => `${element} floors`),
  ...[...shows.elites].filter((element) => !known.elites.has(element)).map((element) => `${element} elites`),
  ...[...shows.champions].filter((kind) => !known.champions.has(kind)).map((kind) => `the champion ${kind}`),
  ...(shows.shield && !known.shield ? ["shields"] : [])
]

/**
 * What the main line has introduced once `quest` is cleared: every main
 * quest up to it (along `after`), its own included. A side quest introduces
 * nothing: it knows what the quest it comes after knows.
 */
export const introducedBy = (quests: { readonly [Id in QuestId]: QuestSpec }, quest: QuestId): Seen => {
  const chain: Array<QuestSpec> = []
  const visited = new Set<string>()
  for (let at: string | null = quest; at !== null && Object.hasOwn(quests, at) && !visited.has(at); at = quests[at as QuestId].after) {
    visited.add(at)
    chain.unshift(quests[at as QuestId])
  }
  return chain.reduce((seen, spec) => (spec.introduces === null ? seen : withNovelty(seen, spec.introduces.novelty)), nothingSeen)
}

/** What a player who cleared `cleared` has met: everything those quests introduced. */
export const metIn = (quests: { readonly [Id in QuestId]: QuestSpec }, cleared: ReadonlyArray<QuestId>): Seen =>
  cleared.reduce((seen, quest) => {
    const novelty = quests[quest].introduces?.novelty
    return novelty === undefined ? seen : withNovelty(seen, novelty)
  }, nothingSeen)
