/**
 * A relic's mark: a six-sided charm with its slot's sign inside (a blade
 * for Strike, chevrons for Dash, its element's emblem for Element, a heart
 * for Survival), and a look's: a drop of paint for a tint, a sparkling
 * streak for a trail.
 */
import type { CosmeticKind } from "../content/cosmetics.ts"
import type { ElementId } from "../content/elements.ts"
import type { RelicSlot } from "../content/relics.ts"
import { EmblemIcon } from "./EmblemIcon.tsx"

const slotSigns: { readonly [Slot in Exclude<RelicSlot, "element">]: string } = {
  strike: "M9 23 21 11 M17 9h5v5 M9 18l5 5",
  dash: "m10 10 5 6-5 6 M16 10l5 6-5 6",
  survival: "M16 24c-5-4-7-6.5-7-9.5a3.5 3.5 0 0 1 7-1 3.5 3.5 0 0 1 7 1c0 3-2 5.5-7 9.5z"
}

export const RelicIcon = ({ slot, element = null }: { readonly slot: RelicSlot; readonly element?: ElementId | null }) =>
  <span class={`relic-icon relic-icon--${slot}`} aria-hidden="true">
    <svg class="relic-icon__charm" viewBox="0 0 32 32" focusable="false">
      <path d="M16 2 28 9v14l-12 7-12-7V9z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
      <path d="M16 5.5 25 11v10l-9 5.5L7 21V11z" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width=".8" />
      {slot !== "element" && <path d={slotSigns[slot]} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />}
    </svg>
    {slot === "element" && element !== null && <span class="relic-icon__emblem"><EmblemIcon kind={element} /></span>}
  </span>

export const LookIcon = ({ kind }: { readonly kind: CosmeticKind }) =>
  <svg class={`menu-icon look-icon look-icon--${kind}`} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    {kind === "tint"
      ? <>
        <path d="M16 4c4 6 8 10 8 15a8 8 0 0 1-16 0c0-5 4-9 8-15z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.6" />
        <path d="M12 19a4 4 0 0 0 4 4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />
      </>
      : <>
        <path d="M4 26c6-2 10-6 14-12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 3" />
        <path d="m22 4 1.8 4.6L28 10l-4.2 1.4L22 16l-1.8-4.6L16 10l4.2-1.4Z" fill="currentColor" />
        <circle cx="9" cy="21" r="1.4" fill="currentColor" />
        <circle cx="14" cy="16" r="1" fill="currentColor" />
      </>}
  </svg>

/**
 * A relic's tier as three diamonds overlapping left to right (the first on
 * top), the first `tier` of them lit; it fits under a card's icon.
 */
export const TierMarks = ({ tier }: { readonly tier: number }) =>
  <svg class="tier-marks" viewBox="0 0 30 12" aria-hidden="true" focusable="false">
    {[2, 1, 0].map((index) => <path key={index} d={`M${6 + index * 9} 1 ${11 + index * 9} 6 ${6 + index * 9} 11 ${1 + index * 9} 6z`} data-on={index < tier ? "" : undefined} />)}
  </svg>
