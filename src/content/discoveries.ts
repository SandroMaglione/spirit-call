/**
 * Discoveries: a short list of one-time feats, each pointing at something
 * worth trying (a full team, an element's burst, a wall slam), that pay a
 * little gold the first time (see docs/collection.md). They are kept few:
 * each one should lead to a new way to play, not to collecting. Only runs
 * of a quest or a tier make them.
 *
 * A new kind of check is a new case here and in `discovered` (see
 * `account/account.ts`). Numbers are live-tunable: they are part of the
 * `Tuning` resource.
 */
import type { Amounts } from "./currencies.ts"
import type { ReactionRecord } from "./elements.ts"

/** What makes a discovery. */
export type DiscoveryCheck =
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
const reaction = (kind: ReactionRecord): DiscoveryCheck => ({ kind: "reaction", reaction: kind })

/** Every discovery, by id, in the order the menu lists them. */
export const discoveries = {
  fullTeam: discovery({
    name: "Full team",
    description: "Clear a quest or tier with three characters.",
    check: { kind: "fullTeam" },
    rewards: { gold: 1000 }
  }),
  wallSlam: discovery({
    name: "Wall slam",
    description: "Slam a swept enemy into a wall.",
    check: reaction("slam"),
    rewards: { gold: 500 }
  }),
  flare: discovery({
    name: "Flare",
    description: "Burst a burning enemy with another element.",
    check: reaction("burning"),
    rewards: { gold: 500 }
  }),
  splash: discovery({
    name: "Splash",
    description: "Burst a soaked enemy with another element.",
    check: reaction("soaked"),
    rewards: { gold: 500 }
  }),
  discharge: discovery({
    name: "Discharge",
    description: "Burst a charged enemy with another element.",
    check: reaction("charged"),
    rewards: { gold: 500 }
  }),
  gale: discovery({
    name: "Gale",
    description: "Burst a swept enemy with another element.",
    check: reaction("swept"),
    rewards: { gold: 500 }
  }),
  shatter: discovery({
    name: "Shatter",
    description: "Burst a cracked enemy with another element.",
    check: reaction("cracked"),
    rewards: { gold: 500 }
  })
}

export type DiscoveryId = keyof typeof discoveries
