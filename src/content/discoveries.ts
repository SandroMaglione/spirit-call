/**
 * Discoveries: a short list of one-time goals, each pointing at something
 * worth trying (a character, a full team, an element reaction), that pay
 * crystals the first time (see docs/vision.md, "Progression"). They are
 * kept few: each one should lead to a new way to play, not to collecting.
 * Only runs of a quest or a hardcore tier make them.
 *
 * A new kind of check is a new case here and in `discovered` (see
 * `account/account.ts`). Every character has her own "clear with her"
 * discovery (see `validateContent`). Numbers are live-tunable: they are
 * part of the `Tuning` resource.
 */
import type { CharacterId } from "./characters.ts"
import type { Amounts } from "./currencies.ts"
import type { ReactionKind } from "./elements.ts"

/** What makes a discovery. */
export type DiscoveryCheck =
  /** Clearing anything with her on the team. */
  | { readonly kind: "clearWith"; readonly character: CharacterId }
  /** Clearing anything with a full team. */
  | { readonly kind: "fullTeam" }
  /** Setting off this reaction once, cleared or not. */
  | { readonly kind: "reaction"; readonly reaction: ReactionKind }

export interface DiscoverySpec {
  readonly name: string
  /** What to do, in a few words. */
  readonly description: string
  readonly check: DiscoveryCheck
  readonly rewards: Amounts
}

const discovery = (spec: DiscoverySpec): DiscoverySpec => spec
const clearWith = (character: CharacterId): DiscoveryCheck => ({ kind: "clearWith", character })
const reaction = (kind: ReactionKind): DiscoveryCheck => ({ kind: "reaction", reaction: kind })

/** Every discovery, by id, in the order the menu lists them. */
export const discoveries = {
  withSwordsman: discovery({
    name: "Swordsman",
    description: "Clear a quest or tier with the Swordsman on the team.",
    check: clearWith("swordsman"),
    rewards: { crystals: 40 }
  }),
  withGunner: discovery({
    name: "Gunner",
    description: "Clear a quest or tier with the Gunner on the team.",
    check: clearWith("gunner"),
    rewards: { crystals: 40 }
  }),
  withTidecaller: discovery({
    name: "Tidecaller",
    description: "Clear a quest or tier with the Tidecaller on the team.",
    check: clearWith("tidecaller"),
    rewards: { crystals: 40 }
  }),
  fullTeam: discovery({
    name: "Full team",
    description: "Clear a quest or tier with three characters.",
    check: { kind: "fullTeam" },
    rewards: { crystals: 60 }
  }),
  steam: discovery({
    name: "Steam",
    description: "Put out a fire with water.",
    check: reaction("steam"),
    rewards: { crystals: 40 }
  }),
  wallSlam: discovery({
    name: "Wall slam",
    description: "Drive an enemy into a wall with wind.",
    check: reaction("stun"),
    rewards: { crystals: 40 }
  }),
  carried: discovery({
    name: "Carried along",
    description: "Drive a burning or soaked enemy into another with wind.",
    check: reaction("carry"),
    rewards: { crystals: 40 }
  })
}

export type DiscoveryId = keyof typeof discoveries
