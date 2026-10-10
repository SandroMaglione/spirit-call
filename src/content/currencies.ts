/**
 * The currency: gold, for levelling characters (see docs/vision.md,
 * "Progression"), from every run and on top from first clears, chests,
 * hardcore tiers, and feats. The wallet also holds the essences (see
 * `content/materials.ts`), so rewards and costs are one kind of amount.
 * Nothing else is spent: characters, aspects, relics, and looks are each
 * a reward written on one card (see docs/collection.md).
 */
import type { MaterialId } from "./materials.ts"

export interface CurrencySpec {
  readonly name: string
  /** What it is spent on, in a few words. */
  readonly use: string
}

export const currencies = {
  gold: { name: "Gold", use: "upgrades" } satisfies CurrencySpec
}

export type CurrencyId = keyof typeof currencies

/** What the wallet holds: a currency or a material. */
export type ResourceId = CurrencyId | MaterialId

/** An amount of each currency and material; a missing one is none. */
export type Amounts = { readonly [Id in ResourceId]?: number }
