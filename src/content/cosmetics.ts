/**
 * Looks (cosmetics): how a character's spirit shows, never how she fights
 * (see docs/relics.md, "Looks"). A tint recolors one character's spirit; a
 * trail changes what any spirit sheds as she moves. Each comes from one
 * place: the shop (for dust), the Spirit Call (its own light, and never
 * twice), or a hard goal (a hardcore tier's first reward). What each looks
 * like (its colors) is `presentation/looks.ts`, keyed by id: content holds
 * no colors or assets.
 */
import type { CharacterId } from "./characters.ts"

/** A look's kind: one of each worn at a time, per character. */
export const cosmeticKinds = ["tint", "trail"] as const
export type CosmeticKind = (typeof cosmeticKinds)[number]

/** Where a look comes from: the shop at a price in dust, the Spirit Call, or a reward (a hardcore tier names it). */
export type CosmeticSource = { readonly kind: "shop"; readonly dust: number } | { readonly kind: "call" } | { readonly kind: "reward" }

export interface CosmeticSpec {
  readonly name: string
  readonly kind: CosmeticKind
  /** Whose spirit it recolors (a tint); `null`: anyone's (a trail). */
  readonly character: CharacterId | null
  /** What it looks like, in a few words. */
  readonly about: string
  readonly source: CosmeticSource
}

const shop = (dust: number): CosmeticSource => ({ kind: "shop", dust })
const call: CosmeticSource = { kind: "call" }
const reward: CosmeticSource = { kind: "reward" }
const tint = (character: CharacterId, name: string, about: string, source: CosmeticSource): CosmeticSpec => ({ name, kind: "tint", character, about, source })
const trail = (name: string, about: string, source: CosmeticSource): CosmeticSpec => ({ name, kind: "trail", character: null, about, source })

/** Every look, by id. */
export const cosmetics = {
  // Tints: two per spirit, one from the shop and one from the Call.
  autumnWind: tint("swordsman", "Autumn Wind", "Leaves turned amber and red.", shop(400)),
  moonwind: tint("swordsman", "Moonwind", "A pale, silver-blue breeze.", call),
  ashen: tint("gunner", "Ashen Flame", "Smouldering grey and orange.", shop(400)),
  blueFlame: tint("gunner", "Blue Flame", "A fire burning blue-white.", call),
  abyss: tint("tidecaller", "Abyss", "Deep-sea indigo.", shop(400)),
  coral: tint("tidecaller", "Coral Tide", "Warm coral and sea-foam.", call),
  paleSky: tint("stormcaller", "Pale Sky", "A storm in soft daylight blues.", shop(400)),
  crimsonStorm: tint("stormcaller", "Crimson Storm", "Red lightning under a dark sky.", call),
  obsidian: tint("bastion", "Obsidian", "Black glassy stone, glowing seams.", shop(400)),
  jade: tint("bastion", "Jade", "Polished green stone.", call),
  // Trails: anyone's.
  starfall: trail("Starfall", "White and gold sparkles.", shop(300)),
  petals: trail("Petals", "Drifting pink petals.", shop(300)),
  aurora: trail("Aurora", "Ribbons of green, cyan, and violet.", call),
  nightshade: trail("Nightshade", "Dark violet wisps.", call),
  lastLight: trail("Last Light", "Bright gold sparks, for lasting until the end.", reward),
  stoneDust: trail("Siege Dust", "Grey grit and sparks, for breaking the siege.", reward),
  prism: trail("Prism", "Sparks in every color of the rainbow.", shop(500))
} satisfies { readonly [id: string]: CosmeticSpec }

export type CosmeticId = keyof typeof cosmetics

/** The look `id` in `all` (the tuning's looks). */
export const cosmeticOf = (all: { readonly [Id in CosmeticId]: CosmeticSpec }, id: CosmeticId): CosmeticSpec => (all as Readonly<Record<string, CosmeticSpec>>)[id]!
