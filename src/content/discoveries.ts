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
import type { ReactionRecord } from "./elements.ts"

/** What makes a discovery. */
export type DiscoveryCheck =
  /** Clearing anything with her on the team. */
  | { readonly kind: "clearWith"; readonly character: CharacterId }
  /** Clearing anything with a full team. */
  | { readonly kind: "fullTeam" }
  /** Setting off this burst (by the state it pays out) or a wall slam once, cleared or not. */
  | { readonly kind: "reaction"; readonly reaction: ReactionRecord }

export interface DiscoverySpec {
  readonly name: string
  /** What to do, in a few words. */
  readonly description: string
  readonly check: DiscoveryCheck
  readonly rewards: Amounts
}

const discovery = (spec: DiscoverySpec): DiscoverySpec => spec
const clearWith = (character: CharacterId): DiscoveryCheck => ({ kind: "clearWith", character })
const reaction = (kind: ReactionRecord): DiscoveryCheck => ({ kind: "reaction", reaction: kind })

/** Every discovery, by id, in the order the menu lists them. */
export const discoveries = {
  withSwordsman: discovery({
    name: "Swordsman",
    description: "Clear a quest or tier with the Swordsman on the team.",
    check: clearWith("swordsman"),
    rewards: { crystals: 30 }
  }),
  withGunner: discovery({
    name: "Gunner",
    description: "Clear a quest or tier with the Gunner on the team.",
    check: clearWith("gunner"),
    rewards: { crystals: 30 }
  }),
  withTidecaller: discovery({
    name: "Tidecaller",
    description: "Clear a quest or tier with the Tidecaller on the team.",
    check: clearWith("tidecaller"),
    rewards: { crystals: 30 }
  }),
  withStormcaller: discovery({
    name: "Stormcaller",
    description: "Clear a quest or tier with the Stormcaller on the team.",
    check: clearWith("stormcaller"),
    rewards: { crystals: 30 }
  }),
  withBastion: discovery({
    name: "Bastion",
    description: "Clear a quest or tier with Bastion on the team.",
    check: clearWith("bastion"),
    rewards: { crystals: 30 }
  }),
  withSparkfist: discovery({
    name: "Sparkfist",
    description: "Clear a quest or tier with Sparkfist on the team.",
    check: clearWith("sparkfist"),
    rewards: { crystals: 30 }
  }),
  withTidewarden: discovery({
    name: "Tidewarden",
    description: "Clear a quest or tier with Tidewarden on the team.",
    check: clearWith("tidewarden"),
    rewards: { crystals: 30 }
  }),
  withQuarry: discovery({
    name: "Quarry",
    description: "Clear a quest or tier with Quarry on the team.",
    check: clearWith("quarry"),
    rewards: { crystals: 30 }
  }),
  withHearth: discovery({
    name: "Hearth",
    description: "Clear a quest or tier with Hearth on the team.",
    check: clearWith("hearth"),
    rewards: { crystals: 30 }
  }),
  withWindwall: discovery({
    name: "Windwall",
    description: "Clear a quest or tier with Windwall on the team.",
    check: clearWith("windwall"),
    rewards: { crystals: 30 }
  }),
  fullTeam: discovery({
    name: "Full team",
    description: "Clear a quest or tier with three characters.",
    check: { kind: "fullTeam" },
    rewards: { crystals: 45 }
  }),
  wallSlam: discovery({
    name: "Wall slam",
    description: "Slam a swept enemy into a wall.",
    check: reaction("slam"),
    rewards: { crystals: 30 }
  }),
  flare: discovery({
    name: "Flare",
    description: "Burst a burning enemy with another element.",
    check: reaction("burning"),
    rewards: { crystals: 30 }
  }),
  splash: discovery({
    name: "Splash",
    description: "Burst a soaked enemy with another element.",
    check: reaction("soaked"),
    rewards: { crystals: 30 }
  }),
  discharge: discovery({
    name: "Discharge",
    description: "Burst a charged enemy with another element.",
    check: reaction("charged"),
    rewards: { crystals: 30 }
  }),
  gale: discovery({
    name: "Gale",
    description: "Burst a swept enemy with another element.",
    check: reaction("swept"),
    rewards: { crystals: 30 }
  }),
  shatter: discovery({
    name: "Shatter",
    description: "Burst a cracked enemy with another element.",
    check: reaction("cracked"),
    rewards: { crystals: 30 }
  })
}

export type DiscoveryId = keyof typeof discoveries
