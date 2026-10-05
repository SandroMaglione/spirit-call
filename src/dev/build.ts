/**
 * Picks the team and the challenge from the page URL, over the account's
 * last ones, to try them without the menu: `?team=swordsman,tidecaller`,
 * the first one's build with `?character=gunner&aspect=marksman`,
 * everyone's levels with `?level=20`, and
 * `?challenge=swarm&enemyLevel=15`, and `?arena=cistern` to fight every
 * challenge in one arena. Unknown ids and levels that are not whole numbers
 * from 1 are ignored, so a typo keeps the default.
 */
import type { Tuning } from "../config/tuning.ts"
import type { ArenaId } from "../content/arena.ts"
import type { ChallengeId } from "../content/challenges.ts"
import { teamSize } from "../content/characters.ts"
import type { CharacterId } from "../content/characters.ts"
import type { AspectId } from "../content/aspects.ts"
import { defaultBuild, defaultTeam } from "../features/build.ts"
import { defaultChallenge } from "../features/challenges.ts"
import type { BuildValue, EnemyKind, PracticeValue } from "../schema.ts"

const known = <Id extends string>(ids: Record<Id, unknown>, value: string | null): value is Id => value !== null && Object.hasOwn(ids, value)

/** `tuning` with every challenge fought in the URL's arena, or as it is when it names none. */
export const arenaFromQuery = (tuning: Tuning, search: string): Tuning => {
  const arena = new URLSearchParams(search).get("arena")
  if (!known<ArenaId>(tuning.arenas, arena)) return tuning
  const challenges = Object.fromEntries(Object.entries(tuning.challenges).map(([id, challenge]) => [id, { ...challenge, arena }]))
  return { ...tuning, challenges: challenges as Tuning["challenges"] }
}

/** The URL's challenge, or `fallback` when it names none. */
export const challengeFromQuery = (tuning: Tuning, search: string, fallback: ChallengeId = defaultChallenge): ChallengeId => {
  const challenge = new URLSearchParams(search).get("challenge")
  return known<ChallengeId>(tuning.challenges, challenge) ? challenge : fallback
}

/** Combat enemies selected for a direct Enemy Practice link; unknown ids and dummies are ignored. */
export const practiceFromQuery = (tuning: Tuning, search: string): PracticeValue | undefined => {
  const value = new URLSearchParams(search).get("practice")
  const kinds = [...new Set((value ?? "").split(","))].filter((id): id is EnemyKind =>
    known<EnemyKind>(tuning.enemies, id) && tuning.enemies[id].cost > 0)
  return kinds.length === 0 ? undefined : { kinds, elites: false }
}

/** The URL's `key` as a level (a whole number from 1), or `undefined`. */
const levelFromQuery = (query: URLSearchParams, key: string): number | undefined => {
  const level = Number(query.get(key) ?? Number.NaN)
  return Number.isInteger(level) && level >= 1 ? level : undefined
}

/** The URL's enemy level, or `fallback` when it has none. */
export const enemyLevelFromQuery = (search: string, fallback: number): number => levelFromQuery(new URLSearchParams(search), "enemyLevel") ?? fallback

/** `build` with the URL's character level over its own. */
const withLevels = (query: URLSearchParams, build: BuildValue): BuildValue => {
  const level = levelFromQuery(query, "level")
  return { ...build, ...(level === undefined ? {} : { level }) }
}

const buildKeys = ["character", "aspect"] as const

/** The URL's build (missing parts are the defaults), or `fallback` when it names no part of one. */
export const buildFromQuery = (tuning: Tuning, search: string, fallback: BuildValue = defaultBuild): BuildValue => {
  const query = new URLSearchParams(search)
  if (!buildKeys.some((key) => query.has(key))) return withLevels(query, fallback)
  const character = query.get("character")
  const aspect = query.get("aspect")
  // An aspect of another class is ignored when the build resolves (see `aspectFor`).
  return withLevels(query, {
    character: known<CharacterId>(tuning.characters, character) ? character : defaultBuild.character,
    ...(known<AspectId>(tuning.aspects, aspect) ? { aspect } : {})
  })
}

/**
 * The URL's team: the characters of `?team=` (each as `buildFor` has her, at
 * most `teamSize`, each once), or `fallback`; the first one's build changed
 * by the URL (see `buildFromQuery`), and everyone's levels.
 */
export const teamFromQuery = (
  tuning: Tuning,
  search: string,
  fallback: ReadonlyArray<BuildValue> = defaultTeam,
  buildFor: (character: CharacterId) => BuildValue = (character) => ({ character })
): ReadonlyArray<BuildValue> => {
  const query = new URLSearchParams(search)
  const named = [...new Set((query.get("team") ?? "").split(","))].filter((id): id is CharacterId => known<CharacterId>(tuning.characters, id)).slice(0, teamSize)
  const [first = defaultBuild, ...rest] = named.length > 0 ? named.map(buildFor) : fallback
  return [buildFromQuery(tuning, search, first), ...rest.map((build) => withLevels(query, build))]
}
