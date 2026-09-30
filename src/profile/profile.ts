/**
 * The player's profile: what persists between sessions, owned by the
 * `ProfileStore` (never by the arena; a run only reports its `RunResult`).
 * Content ids here are checked against the content, so they are typed.
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
import type { StoredProfileLatest } from "./stored.ts"

export interface Profile {
  /** The last build and challenge entered: the menu starts from them. */
  readonly selection: { readonly build: BuildValue; readonly challenge: ChallengeId }
  readonly settings: { readonly muted: boolean }
}

export const defaultProfile: Profile = {
  selection: { build: defaultBuild, challenge: defaultChallenge },
  settings: { muted: false }
}

const known = <Id extends string>(ids: Record<Id, unknown>, value: string): value is Id => Object.hasOwn(ids, value)

/**
 * The profile a (migrated) save describes, with ids that no longer name
 * content dropped: an unknown character or challenge falls back to the
 * default, an unknown or unfitting weapon or skill to the character's own.
 * `dropped` says what was removed, for a notice.
 */
export const fromStored = (stored: StoredProfileLatest, tuning: Tuning): { readonly profile: Profile; readonly dropped: ReadonlyArray<string> } => {
  const dropped: Array<string> = []
  const saved = stored.selection.build
  const character: CharacterId = known(tuning.characters, saved.character) ? saved.character : defaultBuild.character
  if (character !== saved.character) dropped.push(`character ${saved.character}`)

  let weapon: WeaponId | undefined
  if (saved.weapon !== undefined) {
    if (known(tuning.weapons, saved.weapon) && tuning.weapons[saved.weapon].type === tuning.characters[character].weaponType) weapon = saved.weapon
    else dropped.push(`weapon ${saved.weapon}`)
  }

  const skills: { [Slot in SkillSlot]?: SkillId } = {}
  for (const slot of skillSlots) {
    const skill = saved.skills[slot]
    if (skill === undefined) continue
    if (known(tuning.skills, skill)) skills[slot] = skill
    else dropped.push(`skill ${skill}`)
  }

  const challenge: ChallengeId = known(tuning.challenges, stored.selection.challenge) ? stored.selection.challenge : defaultChallenge
  if (challenge !== stored.selection.challenge) dropped.push(`challenge ${stored.selection.challenge}`)

  const build: BuildValue = { character, ...(weapon === undefined ? {} : { weapon }), skills }
  return { profile: { selection: { build, challenge }, settings: stored.settings }, dropped }
}

/** The profile as saved, in the latest version. */
export const toStored = (profile: Profile): StoredProfileLatest => ({
  version: 1,
  selection: profile.selection,
  settings: profile.settings
})
