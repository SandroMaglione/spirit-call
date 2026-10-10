/**
 * The Spirit Call: the gacha (see docs/calls.md). Crystals buy calls; a
 * call brings a character (the one focused on the banner, the gold light),
 * a rare thing (an aspect or a look not owned yet, purple), or a sigil
 * (white): the Call's own token, spent in its exchange on the same aspects
 * and looks, never on a character. Banners are pools of characters that
 * run for a while, in turn, and come back later. No character, aspect, or
 * look owned comes twice while one is left to get, and every count toward
 * a guarantee shows.
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
  emberAndStorm: banner({
    name: "Ember & Storm",
    theme: "An attacker who rains fire, and a healer who calls lightning.",
    characters: ["gunner", "stormcaller"]
  }),
  /** The roster's second banner (see docs/roster.md). Pairings are revisited with the Call's pace. */
  sparkAndFrost: banner({
    name: "Spark & Frost",
    theme: "An attacker who darts through a crowd in a flash, and a guardian who meets each blow.",
    characters: ["sparkfist", "tidewarden"]
  }),
  /** The roster's third banner (see docs/roster.md), holding the rest of it for now. Pairings are revisited with the Call's pace. */
  forgeAndGale: banner({
    name: "Forge & Gale",
    theme: "An attacker who splits the ground, and a healer who turns fire into health.",
    characters: ["quarry", "hearth"]
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
  /**
   * A rare thing (an aspect or a look not owned yet, one pool): at `rate`
   * on a call that brings no character, and certain by the `guarantee`th
   * such call since the last rare thing (a call that brings a character
   * neither resets the count nor adds to it).
   */
  readonly rare: { readonly rate: number; readonly guarantee: number }
  /** What a call that brings neither gives: this many sigils. */
  readonly sigils: number
  /** The exchange: what an aspect and a look cost in sigils. */
  readonly exchange: { readonly aspect: number; readonly look: number }
  /** Banners run `days` each, from `anchor` (epoch milliseconds), in the order of `banners`, round and round. */
  readonly rotation: { readonly anchor: number; readonly days: number }
  /** How many calls the history keeps. */
  readonly history: number
}

export const callRules: CallRules = {
  price: { crystals: 200 },
  opensAfter: "packLeader",
  character: { rate: 0.01, softFrom: 32, softStep: 0.08, guarantee: 45, firstGuarantee: 25 },
  rare: { rate: 0.06, guarantee: 20 },
  sigils: 1,
  exchange: { aspect: 40, look: 20 },
  rotation: { anchor: Date.UTC(2026, 0, 5), days: 14 },
  history: 60
}
