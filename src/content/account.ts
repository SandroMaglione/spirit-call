/**
 * What a new account starts with: the characters, weapons, skills, and
 * challenges it owns, and what it enters first. Everything else starts
 * locked. Changing this only affects accounts created afterwards; granting
 * something to existing accounts is a save migration (see
 * `account/stored.ts`).
 */
import type { ChallengeId } from "./challenges.ts"
import type { CharacterId } from "./characters.ts"
import type { SkillId } from "./skills.ts"
import type { WeaponId } from "./weapons.ts"

export interface StarterSet {
  readonly characters: ReadonlyArray<CharacterId>
  readonly weapons: ReadonlyArray<WeaponId>
  readonly skills: ReadonlyArray<SkillId>
  readonly challenges: ReadonlyArray<ChallengeId>
  /** Selected when the account is created. */
  readonly selection: { readonly character: CharacterId; readonly challenge: ChallengeId }
}

export const newAccount: StarterSet = {
  characters: ["swordsman"],
  weapons: ["trainingBlade"],
  skills: ["bladeWave", "nova"],
  challenges: ["swarm", "endless"],
  selection: { character: "swordsman", challenge: "swarm" }
}
