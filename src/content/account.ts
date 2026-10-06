/**
 * What a new account starts with: the characters and aspects it owns (each
 * character comes with her kit, and every class with its plain aspect), and
 * what it enters first. Everything else
 * is unlocked by playing (quest rewards); quests open by account level and
 * the main line's order.
 * Changing this only affects accounts created afterwards; granting something
 * to existing accounts is done as they load (see `fromRecord`).
 */
import type { CharacterId } from "./characters.ts"
import type { QuestId } from "./quests.ts"
import type { AspectId } from "./aspects.ts"

export interface StarterSet {
  readonly characters: ReadonlyArray<CharacterId>
  readonly aspects: ReadonlyArray<AspectId>
  /** Selected when the account is created. */
  readonly selection: { readonly character: CharacterId; readonly quest: QuestId }
}

export const newAccount: StarterSet = {
  characters: ["swordsman"],
  aspects: [],
  selection: { character: "swordsman", quest: "theSwarm" }
}
