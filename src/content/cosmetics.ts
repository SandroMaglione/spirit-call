/**
 * Looks (cosmetics): how a character's spirit shows, never how she fights
 * (see docs/relics.md, "Looks"). A tint recolors one character's spirit; a
 * trail changes what any spirit sheds as she moves. Each comes from one
 * card (see docs/collection.md): a tint from its character's mastery
 * audition, a trail from a hardcore tier (`content/collection.ts` lists
 * them). What each looks like (its colors) is `presentation/looks.ts`,
 * keyed by id: content holds no colors or assets.
 */
import type { CharacterId } from "./characters.ts"

/** A look's kind: one of each worn at a time, per character. */
export const cosmeticKinds = ["tint", "trail"] as const
export type CosmeticKind = (typeof cosmeticKinds)[number]

export interface CosmeticSpec {
  readonly name: string
  readonly kind: CosmeticKind
  /** Whose spirit it recolors (a tint); `null`: anyone's (a trail). */
  readonly character: CharacterId | null
  /** What it looks like, in a few words. */
  readonly about: string
}

const tint = (character: CharacterId, name: string, about: string): CosmeticSpec => ({ name, kind: "tint", character, about })
const trail = (name: string, about: string): CosmeticSpec => ({ name, kind: "trail", character: null, about })

/** Every look, by id. */
export const cosmetics = {
  // Tints: one per spirit, from her mastery audition.
  moonwind: tint("swordsman", "Moonwind", "A pale, silver-blue breeze."),
  blueFlame: tint("gunner", "Blue Flame", "A fire burning blue-white."),
  coral: tint("tidecaller", "Coral Tide", "Warm coral and sea-foam."),
  crimsonStorm: tint("stormcaller", "Crimson Storm", "Red lightning under a dark sky."),
  jade: tint("bastion", "Jade", "Polished green stone."),
  verdantSpark: tint("sparkfist", "Verdant Spark", "Lightning gone green as new leaves."),
  glacier: tint("tidewarden", "Glacier", "Pale, icy blue-white water."),
  rust: tint("quarry", "Rust", "Iron-red stone, weathered warm."),
  emberRose: tint("hearth", "Ember Rose", "A fire burning pink and rose."),
  duskGale: tint("windwall", "Dusk Gale", "A lavender wind at sundown."),
  // Trails: anyone's, from hardcore tiers.
  starfall: trail("Starfall", "White and gold sparkles."),
  petals: trail("Petals", "Drifting pink petals."),
  aurora: trail("Aurora", "Ribbons of green, cyan, and violet."),
  nightshade: trail("Nightshade", "Dark violet wisps."),
  lastLight: trail("Last Light", "Bright gold sparks, for lasting until the end."),
  stoneDust: trail("Siege Dust", "Grey grit and sparks, for breaking the siege."),
  prism: trail("Prism", "Sparks in every color of the rainbow.")
} satisfies { readonly [id: string]: CosmeticSpec }
export type CosmeticId = keyof typeof cosmetics

/** The look `id` in `all` (the tuning's looks). */
export const cosmeticOf = (all: { readonly [Id in CosmeticId]: CosmeticSpec }, id: CosmeticId): CosmeticSpec => (all as Readonly<Record<string, CosmeticSpec>>)[id]!
