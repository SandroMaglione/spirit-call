/**
 * What a new account starts with: the characters and weapons it owns (each
 * character comes with her kit), and what it enters first. Everything else
 * is unlocked by playing (quest rewards); quests open by account level and
 * the main line's order.
 * Changing this only affects accounts created afterwards; granting something
 * to existing accounts is a save migration (see `account/stored.ts`).
 */
import type { CharacterId } from "./characters.ts"
import type { QuestId } from "./quests.ts"
import type { WeaponId } from "./weapons.ts"

export interface StarterSet {
  readonly characters: ReadonlyArray<CharacterId>
  readonly weapons: ReadonlyArray<WeaponId>
  /** Selected when the account is created. */
  readonly selection: { readonly character: CharacterId; readonly quest: QuestId }
}

export const newAccount: StarterSet = {
  characters: ["swordsman"],
  weapons: ["trainingBlade"],
  selection: { character: "swordsman", quest: "theSwarm" }
}
