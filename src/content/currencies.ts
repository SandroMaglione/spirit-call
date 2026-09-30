/**
 * The two currencies, each for one thing, so it is always clear where each
 * comes from and what it is for: one for pulls (the gacha, later), one for
 * upgrades (character and weapon levels). Both come from rewards given once
 * (a quest's first clear, a hardcore tier until its reset); runs themselves
 * give experience, not currency.
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
