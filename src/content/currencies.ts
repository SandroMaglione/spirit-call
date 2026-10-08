/**
 * The currencies, each for one thing, so it is always clear where each
 * comes from and what it is for (see docs/vision.md, "Progression"):
 * crystals for calls (the Spirit Call, see content/calls.ts), from milestones only (first
 * clears, hardcore tiers once per period, account levels, discoveries);
 * gold for upgrades (character levels), from every run, and on
 * top from first clears and hardcore tiers; dust for the shop (a relic's
 * next tier, and looks; see docs/relics.md), from milestones off the main
 * line (side quests, ranks, hardcore tiers, trials) and from relics called
 * past their last tier. The wallet also holds the ascension materials (see
 * `content/materials.ts`), so rewards and costs are one kind of amount.
 */
import type { MaterialId } from "./materials.ts"

export interface CurrencySpec {
  readonly name: string
  /** What it is spent on, in a few words. */
  readonly use: string
}

export const currencies = {
  crystals: { name: "Crystals", use: "pulls" } satisfies CurrencySpec,
  gold: { name: "Gold", use: "upgrades" } satisfies CurrencySpec,
  dust: { name: "Dust", use: "the shop" } satisfies CurrencySpec
}

export type CurrencyId = keyof typeof currencies

/** What the wallet holds: a currency or a material. */
export type ResourceId = CurrencyId | MaterialId

/** An amount of each currency and material; a missing one is none. */
export type Amounts = { readonly [Id in ResourceId]?: number }
