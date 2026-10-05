/** Menu symbols share a fixed box, independent of the device's text font. */
const paths = {
  retry: "M4 10a8 8 0 1 1 1 8 M4 4v6h6",
  aspect: "m16 3 5 0 0 5-11 11-5-5z M3 21l4-4 M3 12l9 9 M14 7l3 3",
  play: "m9 5 11 7-11 7z",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 10v7 M12 7h.01",
  plus: "M12 5v14 M5 12h14",
  gold: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12",
  crystals: "m7 4-5 7 10 11 10-11-5-7z M2 11h20 M7 4l5 18 5-18 M7 4h10",
  home: "M4 11 12 4l8 7v9h-6v-6h-4v6H4z",
  challenge: "m12 3 9 9-9 9-9-9z M12 8v5 M12 16h.01",
  character: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  team: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M16 4a4 4 0 0 1 0 8 M22 20v-2a4 4 0 0 0-4-4",
  discovery: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  practice: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 11v2",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  back: "m15 5-7 7 7 7",
  next: "m9 5 7 7-7 7",
  close: "m6 6 12 12 M6 18 18 6",
  settings: "m9 3-.7 3-2.8 1-2.5-1.2-2 3.4L3 11v3l-2 1.8 2 3.4L5.5 18l2.8 1 .7 3h6l.7-3 2.8-1 2.5 1.2 2-3.4-2-1.8v-3l2-1.8-2-3.4L18.5 7l-2.8-1L15 3z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  lock: "M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3",
  wind: "M3 8h12a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h6a3 3 0 1 1-3 3",
  water: "M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12z M8 15a4 4 0 0 0 4 4",
  fire: "M12 2c2 6-2 7 0 11 2-1 3-3 3-5 4 4 6 8 3 12-4 5-12 2-12-4 0-4 3-7 6-14z",
  thunder: "m13 2-9 12h7l-1 8 10-12h-7z",
  check: "m5 12 4 4L19 6"
} as const

export type IconName = keyof typeof paths

export const Icon = ({ name }: { readonly name: IconName }) => <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={name === "more" ? 4 : 1.8} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>
