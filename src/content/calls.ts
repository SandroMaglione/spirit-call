/**
 * The Spirit Call: the gacha (see docs/calls.md). Crystals buy calls; a
 * call brings a character (the one focused on the banner), an aspect, a
 * look, a relic, or a supply bundle, rarest first. Banners are pools of
 * characters that run for a while, in turn, and come back later. No
 * character, aspect, or look owned comes twice while one is left to get;
 * a relic coming again raises its tier (then turns into dust); and every
 * count toward a guarantee shows.
 *
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { CharacterId } from "./characters.ts"
import type { Amounts } from "./currencies.ts"

/** A banner: a pool of characters, one of them focused by the player; it runs in turn with the others (see `CallRules.rotation`). */
export interface BannerSpec {
  readonly name: string
  /** Its theme, in a line. */
  readonly theme: string
  readonly characters: ReadonlyArray<CharacterId>
}

const banner = (spec: BannerSpec): BannerSpec => spec

/** Every banner, by id, in the order they run (see `CallRules.rotation`). */
export const banners = {
  stormAndStone: banner({
    name: "Storm & Stone",
    theme: "A healer who calls lightning, and a defender who raises the ground.",
    characters: ["stormcaller", "stonekeeper"]
  })
}

export type BannerId = keyof typeof banners

/**
 * How a character comes: at `rate` per call, rising by `softStep` per call
 * from the `softFrom`th call since the last one, and certain at the
 * `guarantee`th (the `firstGuarantee`th for the account's first).
 */
export interface CharacterOdds {
  readonly rate: number
  readonly softFrom: number
  readonly softStep: number
  readonly guarantee: number
  readonly firstGuarantee: number
}

export interface CallRules {
  /** What one call costs. */
  readonly price: Amounts
  /** The quest to clear before calls open (the end of chapter one; an id of `quests`). */
  readonly opensAfter: string
  readonly character: CharacterOdds
  /** An aspect not owned yet: at `rate` on a call that brings no character, and certain by the `guarantee`th call since the last aspect or character. */
  readonly aspect: { readonly rate: number; readonly guarantee: number }
  /** A look only the Call gives, not owned yet: at `rate` on a call that brings neither a character nor an aspect. */
  readonly look: { readonly rate: number }
  /**
   * A relic (any one; owned already, a tier up): at `rate` on a call that
   * brings nothing rarer, and certain by the `guarantee`th call since the
   * last relic or anything rarer. The shares of an aspect or a look with
   * none left to get go to relics.
   */
  readonly relic: { readonly rate: number; readonly guarantee: number }
  /** What a call that brings neither gives: gold, and `material` of the focused character's element. */
  readonly supply: { readonly gold: number; readonly material: number }
  /** Banners run `days` each, from `anchor` (epoch milliseconds), in the order of `banners`, round and round. */
  readonly rotation: { readonly anchor: number; readonly days: number }
  /** How many calls the history keeps. */
  readonly history: number
}

export const callRules: CallRules = {
  price: { crystals: 200 },
  opensAfter: "packLeader",
  character: { rate: 0.03, softFrom: 20, softStep: 0.1, guarantee: 30, firstGuarantee: 10 },
  aspect: { rate: 0.06, guarantee: 15 },
  look: { rate: 0.1 },
  relic: { rate: 0.4, guarantee: 4 },
  supply: { gold: 1200, material: 10 },
  rotation: { anchor: Date.UTC(2026, 0, 5), days: 14 },
  history: 60
}
