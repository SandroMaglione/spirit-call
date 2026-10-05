/**
 * The HUD's icons, as Genshin's: what a button does at a glance, no words.
 * One per class (the attack button), the dash, each skill, and each
 * state (over the health bar), keyed by content id like the looks (content
 * holds no art). Inline SVG on a 24 unit grid, drawn in `currentColor`: line
 * art, with a few solid shapes where a line would read too thin at a
 * button's size.
 */
import type { StateId } from "../content/elements.ts"
import type { SkillId } from "../content/skills.ts"
import type { ClassId } from "../content/classes.ts"

const icon = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

/** A flame, and a drop of water: fire's and water's shapes. */
const flame = `<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5.5.5 1.5 1.5 2.5 2.5 3 0-3 0-5 0-7.5z" fill="currentColor" fill-opacity="0.35"/>`
const drop = `<path d="M12 2.5c3 4.5 6.5 7.5 6.5 11.5a6.5 6.5 0 0 1-13 0c0-4 3.5-7 6.5-11.5z" fill="currentColor" fill-opacity="0.35"/>`

/** The attack button, by her class. */
export const classIcons: { readonly [Class in ClassId]: string } = {
  // A blade, its guard, and the grip.
  blade: icon(`<path d="M20 4v4L10.5 17.5l-4-4L16 4z" fill="currentColor" fill-opacity="0.35"/><path d="M5 12.5l6.5 6.5M8 16l-4 4"/>`),
  // A pistol in profile.
  gun: icon(`<path d="M3 7h16l2 2v2h-9l-1 6H6.5l1-6H3z" fill="currentColor" fill-opacity="0.35"/><path d="M11 11h2v2"/>`),
  // A ring with four blades.
  disc: icon(`<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>`),
  // A staff and its orb.
  staff: icon(`<path d="M5 21L15.5 8.5"/><circle cx="17.5" cy="6.5" r="3" fill="currentColor" fill-opacity="0.35"/><path d="M21 2l-1 1M14 3l1 1M21 10l-1-1"/>`)
}

/** The dash: speed lines into an arrow. */
export const dashIcon = icon(`<path d="M3 8h7M2 12h9M3 16h7"/><path d="M13 5l7 7-7 7"/>`)

/** The special and ultimate buttons, by the skill in the slot. */
export const skillIcons: { readonly [Id in SkillId]: string } = {
  // Gust: wind curling back on itself.
  bladeWave: icon(`<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 18h6"/>`),
  // Flare Jump: a flame, rising.
  flareJump: icon(flame),
  // Tidal Wave: a curling wave over the swell.
  tidalWave: icon(`<path d="M2 16c2.5 0 2.5-2.5 5-2.5s2.5 2.5 5 2.5 2.5-2.5 5-2.5 2.5 2.5 5 2.5"/><path d="M2 20.5c2.5 0 2.5-2.5 5-2.5s2.5 2.5 5 2.5 2.5-2.5 5-2.5 2.5 2.5 5 2.5"/><path d="M5 11c0-4 3-7 7-7 3 0 5 1.5 6 4-2-1-5-.5-5 2.5"/>`),
  // Cyclone: a funnel of wind.
  cyclone: icon(`<path d="M3 4h18M5 8.5h14M7.5 13h9M10 17.5h5M11.5 21.5h2"/>`),
  // Barrage: three shots flying out.
  barrage: icon(`<path d="M3 14l6-6M7 8h2v2"/><path d="M8 21l9-9M15 12h2v2"/><path d="M12 9l7-7M17 2h2v2"/>`),
  // Tide: a drop of water.
  tide: icon(`${drop}<path d="M9 14.5a3 3 0 0 0 3 3"/>`),
  // Spark Totem: a post with a spark over it.
  sparkTotem: icon(`<path d="M8 21h8M10 21V10h4v11M9 10l3-3.5L15 10"/><path d="M12 1.5l-1.5 2.5h3L12 6.5" />`),
  // Thunderclap: a bolt.
  thunderclap: icon(`<path d="M13.5 2L4.5 13.5h6.5L9.5 22l9.5-12h-6.5z" fill="currentColor" fill-opacity="0.35"/>`)
}

/** The state the one on the field is in, over her health bar. */
export const stateIcons: { readonly [Id in StateId]: string } = {
  burning: icon(flame),
  soaked: icon(drop),
  // Charged: a small bolt.
  charged: icon(`<path d="M13.5 3L6 13h5l-1.5 8L18 11h-5z" fill="currentColor" fill-opacity="0.35"/>`),
  // Swept: three gusts.
  swept: icon(`<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>`)
}
