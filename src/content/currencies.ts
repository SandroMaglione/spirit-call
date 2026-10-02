/**
 * The two currencies, each for one thing, so it is always clear where each
 * comes from and what it is for (see docs/vision.md, "Progression"):
 * crystals for pulls (the gacha, later), from milestones only (first
 * clears, hardcore tiers once per period, account levels, discoveries);
 * gold for upgrades (character and weapon levels), from every run, and on
 * top from first clears and hardcore tiers.
 */
export interface CurrencySpec {
  readonly name: string
  /** What it is spent on, in a few words. */
  readonly use: string
}

export const currencies = {
  crystals: { name: "Crystals", use: "pulls" } satisfies CurrencySpec,
  gold: { name: "Gold", use: "upgrades" } satisfies CurrencySpec
}

export type CurrencyId = keyof typeof currencies

/** An amount of each currency; a missing one is none. */
export type Amounts = { readonly [Id in CurrencyId]?: number }
