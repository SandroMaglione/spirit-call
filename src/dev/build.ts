/**
 * Picks the team and the challenge from the page URL, over the account's
 * last ones, to try them without the menu: `?team=swordsman,tidecaller`,
 * the first one's build with `?character=gunner&aspect=marksman` and
 * `&relics=echo:3,repel` (each in its slot, at a tier from 1 to 3; 1 when
 * missing), everyone's levels with `?level=20`, and
 * `?challenge=swarm&enemyLevel=15`, `?arena=cistern` to fight every
 * challenge in one arena, and `?wave=4` to start every challenge at its
 * fourth wave (to try a champion without the waves before it). Unknown ids and levels that are not whole numbers
 * from 1 are ignored, so a typo keeps the default.
 */
import type { Tuning } from "../config/tuning.ts"
import type { ArenaId } from "../content/arena.ts"
import type { ChallengeId } from "../content/challenges.ts"
import { teamSize } from "../content/characters.ts"
import type { CharacterId } from "../content/characters.ts"
import type { AspectId } from "../content/aspects.ts"
import { relicOf, relicTiers } from "../content/relics.ts"
import type { EquippedRelic, RelicId, RelicSlot, RelicTier } from "../content/relics.ts"
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

/** `tuning` with every challenge's scripted waves from the URL's `wave` on (a whole number from 2), or as it is. */
export const waveFromQuery = (tuning: Tuning, search: string): Tuning => {
  const wave = Number(new URLSearchParams(search).get("wave") ?? Number.NaN)
  if (!Number.isInteger(wave) || wave < 2) return tuning
  const challenges = Object.fromEntries(Object.entries(tuning.challenges).map(([id, challenge]) => {
    const scripted = challenge.waves.scripted
    return [id, scripted.length < wave ? challenge : { ...challenge, waves: { ...challenge.waves, scripted: scripted.slice(wave - 1) } }]
  }))
  return { ...tuning, challenges: challenges as Tuning["challenges"] }
}

/** The URL's challenge, or `fallback` when it names none. */
export const challengeFromQuery = (tuning: Tuning, search: string, fallback: ChallengeId = defaultChallenge): ChallengeId => {
  const challenge = new URLSearchParams(search).get("challenge")
  return known<ChallengeId>(tuning.challenges, challenge) ? challenge : fallback
}

/** Combat enemies selected for a direct Enemy Practice link (`?practice=brute,chaser&champion`); unknown ids and dummies are ignored. */
export const practiceFromQuery = (tuning: Tuning, search: string): PracticeValue | undefined => {
  const value = new URLSearchParams(search).get("practice")
  const kinds = [...new Set((value ?? "").split(","))].filter((id): id is EnemyKind =>
    known<EnemyKind>(tuning.enemies, id) && tuning.enemies[id].cost > 0)
  const query = new URLSearchParams(search)
  // `&elites` and `&champion` ask for them too.
  return kinds.length === 0 ? undefined : { kinds, elites: query.has("elites"), ...(query.has("champion") ? { champion: true } : {}) }
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

const buildKeys = ["character", "aspect", "relics"] as const

/** The URL's relics (`echo:3,repel`), each in its slot (the last one named for a slot wins). */
const relicsFromQuery = (tuning: Tuning, value: string | null): { readonly [Slot in RelicSlot]?: EquippedRelic } => {
  const relics: { [Slot in RelicSlot]?: EquippedRelic } = {}
  for (const entry of (value ?? "").split(",")) {
    const [id = "", tier] = entry.split(":")
    if (!known<RelicId>(tuning.relics, id)) continue
    const level = Number(tier ?? 1)
    relics[relicOf(tuning.relics, id).slot] = { id, tier: relicTiers.includes(level as RelicTier) ? (level as RelicTier) : 1 }
  }
  return relics
}

/** The URL's build (missing parts are the defaults), or `fallback` when it names no part of one. */
export const buildFromQuery = (tuning: Tuning, search: string, fallback: BuildValue = defaultBuild): BuildValue => {
  const query = new URLSearchParams(search)
  if (!buildKeys.some((key) => query.has(key))) return withLevels(query, fallback)
  const character = query.get("character")
  const aspect = query.get("aspect")
  // An aspect of another class is ignored when the build resolves (see `aspectFor`); a relic that does not fit her, as the team enters (see `withValidRelics`).
  return withLevels(query, {
    character: known<CharacterId>(tuning.characters, character) ? character : defaultBuild.character,
    ...(known<AspectId>(tuning.aspects, aspect) ? { aspect } : {}),
    ...(query.has("relics") ? { relics: relicsFromQuery(tuning, query.get("relics")) } : {})
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
