/**
 * Picks the build and the challenge from the page URL, to try them without a
 * menu: `?character=gunner&weapon=bloodthirst&special=bladeWave` and
 * `?challenge=swarm`. Unknown ids are ignored, so a typo keeps the default.
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

export const challengeFromQuery = (tuning: Tuning, search: string): ChallengeId => {
  const challenge = new URLSearchParams(search).get("challenge")
  return known<ChallengeId>(tuning.challenges, challenge) ? challenge : defaultChallenge
}

export const buildFromQuery = (tuning: Tuning, search: string): BuildValue => {
  const query = new URLSearchParams(search)
  const character = query.get("character")
  const skills: { [Slot in SkillSlot]?: SkillId } = {}
  for (const slot of skillSlots) {
    const skill = query.get(slot)
    if (known<SkillId>(tuning.skills, skill)) skills[slot] = skill
  }
  const weapon = query.get("weapon")
  return {
    character: known<CharacterId>(tuning.characters, character) ? character : defaultBuild.character,
    ...(known<WeaponId>(tuning.weapons, weapon) ? { weapon } : {}),
    skills
  }
}
