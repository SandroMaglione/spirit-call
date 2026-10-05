import { CurrencyIcon } from "./CurrencyIcon.tsx"
import { EmblemIcon } from "./EmblemIcon.tsx"
import type { EmblemKind } from "./EmblemIcon.tsx"
import type { CurrencyId } from "../content/currencies.ts"

/** Menu symbols share a fixed box, independent of the device's text font. */
const paths = {
  retry: "M4 10a8 8 0 1 1 1 8 M4 4v6h6",
  aspect: "m12 3 9 9-9 9-9-9z M8 8c7-3 11 1 8 8 M8 16c-3-7 1-11 8-8 M9 12l3-3 3 3-3 3z",
  play: "m9 5 11 7-11 7z",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 10v7 M12 7h.01",
  plus: "M12 5v14 M5 12h14",
  attributes: "M5 20V11h3v9z M11 20V4h3v16z M17 20V8h3v12z",
  account: "M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  home: "M4 11 12 4l8 7v9h-6v-6h-4v6H4z",
  challenge: "m12 3 9 9-9 9-9-9z M12 8v5 M12 16h.01",
  character: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  team: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M16 4a4 4 0 0 1 0 8 M22 20v-2a4 4 0 0 0-4-4",
  formation: "M8 3h8v17l-4 3-4-3z M3 7h2v11l-2 2-2-2V7z M21 7h2v11l-2 2-2-2V7z M12 7v6 M10 10h4",
  quests: "M4 2h3l8 13-3 2L4 5z M20 2h-3L9 15l3 2 8-12z M7 14l6 4 M17 14l-6 4 M10 18l-3 4 M14 18l3 4",
  discovery: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  practice: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 11v2",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  back: "m15 5-7 7 7 7",
  next: "m9 5 7 7-7 7",
  close: "m6 6 12 12 M6 18 18 6",
  settings: "m9 3-.7 3-2.8 1-2.5-1.2-2 3.4L3 11v3l-2 1.8 2 3.4L5.5 18l2.8 1 .7 3h6l.7-3 2.8-1 2.5 1.2 2-3.4-2-1.8v-3l2-1.8-2-3.4L18.5 7l-2.8-1L15 3z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  lock: "M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3",
  check: "m5 12 4 4L19 6",
  swap: "M4 8h14l-4-4 M20 16H6l4 4",
  hp: "M12 20C6 15 3 12 3 8.5a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1C21 12 18 15 12 20z",
  atk: "M5 19 19 5 M13 5h6v6 M5 14l5 5",
  def: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
  speed: "m5 6 6 6-6 6 M13 6l6 6-6 6",
  star: "m12 3 2.7 5.7 6.2.8-4.5 4.3 1.1 6.2L12 17l-5.5 3 1.1-6.2-4.5-4.3 6.2-.8z",
  chest: "M3 11h18v9H3z M3 11l2-5h14l2 5 M10 11v4h4v-4"
} as const

export type IconName = keyof typeof paths | CurrencyId | EmblemKind

export const Icon = ({ name }: { readonly name: IconName }) => {
  if (name === "gold" || name === "crystals") return <CurrencyIcon currency={name} />
  if (name === "xp" || name === "wind" || name === "water" || name === "fire" || name === "thunder" || name === "rock") return <EmblemIcon kind={name} />
  return <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={name === "more" ? 4 : 1.8} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>
}
