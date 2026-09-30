/**
 * Picks the build and the challenge from the page URL, over the account's
 * last ones, to try them without the menu:
 * `?character=gunner&weapon=bloodthirst&special=bladeWave`, levels with
 * `?level=20&weaponLevel=10`, and `?challenge=swarm&enemyLevel=15`. Unknown
 * ids and levels that are not whole numbers from 1 are ignored, so a typo
 * keeps the default.
 */
import type { Tuning } from "../config/tuning.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId } from "../content/characters.ts"
import { skillSlots } from "../content/skills.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import { defaultBuild } from "../features/build.ts"
import { defaultChallenge } from "../features/challenges.ts"
import type { BuildValue } from "../schema.ts"

const known = <Id extends string>(ids: Record<Id, unknown>, value: string | null): value is Id => value !== null && Object.hasOwn(ids, value)

/** The URL's challenge, or `fallback` when it names none. */
export const challengeFromQuery = (tuning: Tuning, search: string, fallback: ChallengeId = defaultChallenge): ChallengeId => {
  const challenge = new URLSearchParams(search).get("challenge")
  return known<ChallengeId>(tuning.challenges, challenge) ? challenge : fallback
}

/** The URL's `key` as a level (a whole number from 1), or `undefined`. */
const levelFromQuery = (query: URLSearchParams, key: string): number | undefined => {
  const level = Number(query.get(key) ?? Number.NaN)
  return Number.isInteger(level) && level >= 1 ? level : undefined
}

/** The URL's enemy level, or `fallback` when it has none. */
export const enemyLevelFromQuery = (search: string, fallback: number): number => levelFromQuery(new URLSearchParams(search), "enemyLevel") ?? fallback

/** `build` with the URL's character and weapon levels over its own. */
const withLevels = (query: URLSearchParams, build: BuildValue): BuildValue => {
  const level = levelFromQuery(query, "level")
  const weaponLevel = levelFromQuery(query, "weaponLevel")
  return { ...build, ...(level === undefined ? {} : { level }), ...(weaponLevel === undefined ? {} : { weaponLevel }) }
}

const buildKeys = ["character", "weapon", ...skillSlots] as const

/** The URL's build (missing parts are the defaults), or `fallback` when it names no part of one. */
export const buildFromQuery = (tuning: Tuning, search: string, fallback: BuildValue = defaultBuild): BuildValue => {
  const query = new URLSearchParams(search)
  if (!buildKeys.some((key) => query.has(key))) return withLevels(query, fallback)
  const character = query.get("character")
  const skills: { [Slot in SkillSlot]?: SkillId } = {}
  for (const slot of skillSlots) {
    const skill = query.get(slot)
    if (known<SkillId>(tuning.skills, skill)) skills[slot] = skill
  }
  const weapon = query.get("weapon")
  return withLevels(query, {
    character: known<CharacterId>(tuning.characters, character) ? character : defaultBuild.character,
    ...(known<WeaponId>(tuning.weapons, weapon) ? { weapon } : {}),
    skills
  })
}
