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
  staff: icon(`<path d="M5 21L15.5 8.5"/><circle cx="17.5" cy="6.5" r="3" fill="currentColor" fill-opacity="0.35"/><path d="M21 2l-1 1M14 3l1 1M21 10l-1-1"/>`),
  // A fist: three knuckles over the palm.
  gauntlets: icon(`<path d="M5 11h13a2.5 2.5 0 0 1 2.5 2.5V16a6 6 0 0 1-6 6H10a5 5 0 0 1-5-5z" fill="currentColor" fill-opacity="0.35"/><path d="M5 11V8a2 2 0 0 1 4 0v3M9 11V7a2 2 0 0 1 4 0v4M13 11V8a2 2 0 0 1 4 0v3M9 16h6"/>`),
  // A hammer: a heavy head on a long haft.
  hammer: icon(`<path d="M4 6l7-3 4 4-3 7-4-4z" fill="currentColor" fill-opacity="0.35"/><path d="M10 10l10 10"/>`)
}

/** The dash: speed lines into an arrow. */
export const dashIcon = icon(`<path d="M3 8h7M2 12h9M3 16h7"/><path d="M13 5l7 7-7 7"/>`)

/** The special and ultimate buttons, by the skill in the slot. */
export const skillIcons: { readonly [Id in SkillId]: string } = {
  stoneGuard: icon(`<path d="m12 3 7 3v6c0 5-7 9-7 9s-7-4-7-9V6z"/><path d="m9 10 3-2 3 2-1 5h-4z"/>`),
  stoneRise: icon(`<path d="m2 20 2-8 3-2 3 10M8 20l2-13 3-4 4 17M15 20l2-9 3 2 2 7M2 22h20"/>`),
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
  thunderclap: icon(`<path d="M13.5 2L4.5 13.5h6.5L9.5 22l9.5-12h-6.5z" fill="currentColor" fill-opacity="0.35"/>`),
  // Spark Step: a bolt darting forward, speed lines behind it.
  sparkStep: icon(`<path d="M2 9h5M2 13h4M2 17h5"/><path d="M13 3l-4 9h5l-3 9 9-12h-5l3-6z" fill="currentColor" fill-opacity="0.35"/>`),
  // Storm Flurry: a bolt hopping between three points.
  stormFlurry: icon(`<circle cx="4.5" cy="18" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="19.5" cy="17" r="2"/><path d="M6 16l2.5-5h2l1-3M13.5 8l1.5 4h-2l4 3.5"/>`),
  // Brace: a blade held across, a blow breaking on it.
  brace: icon(`<path d="M4 18L18 4M15 4h3v3M5 15l4 4"/><path d="M15 15l5 5M19 13l2-1M13 19l-1 2M20 17h2" />`),
  // Fault Line: a crack running ahead, rocks along it.
  faultLine: icon(`<path d="M2 20l5-4 3 2 4-6 3 2 5-9"/><path d="M6 14l1-3 2 1M13 10l1-3 2 1M18 6l1-3 2 1"/>`),
  // Landslide: three rings shaking out from a slam.
  landslide: icon(`<circle cx="12" cy="14" r="2.5" fill="currentColor" fill-opacity="0.35"/><path d="M6.5 14a5.5 5.5 0 0 1 11 0M3.5 14a8.5 8.5 0 0 1 17 0M1 18h22"/>`),
  // Kindle: a flame over a cross of healing.
  kindle: icon(`<path d="M12 2c3 3 5 5.5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3.5 0-3 .5-5.5 1-8z" fill="currentColor" fill-opacity="0.35"/><path d="M12 17v5M9.5 19.5h5"/>`),
  // Wildfire: flames all around a ring.
  wildfire: icon(`<circle cx="12" cy="12" r="4"/><path d="M12 1.5l1.5 3h-3zM12 22.5l1.5-3h-3zM1.5 12l3-1.5v3zM22.5 12l-3-1.5v3zM4.5 4.5l3 1-2 2zM19.5 19.5l-3-1 2-2zM19.5 4.5l-1 3-2-2zM4.5 19.5l1-3 2 2z"/>`),
  // Gale Wall: a wall of wind, a shot breaking on it.
  galeWall: icon(`<path d="M14 3v18"/><path d="M17 6c2 0 2 2 4 2M17 12c2 0 2 2 4 2M17 18c2 0 2-2 4-2"/><path d="M3 12h6M8 9.5l2.5 2.5L8 14.5"/>`),
  // Eye of the Storm: a ring of wind around a still center.
  eyeOfTheStorm: icon(`<circle cx="12" cy="12" r="2" fill="currentColor" fill-opacity="0.35"/><path d="M12 3a9 9 0 0 1 9 9M21 12a9 9 0 0 1-9 9M12 21a9 9 0 0 1-9-9M3 12a9 9 0 0 1 9-9"/><path d="M19 3l2 2-2 1M5 21l-2-2 2-1"/>`),
  // Floodgate: a wave breaking out of a ring.
  floodgate: icon(`<circle cx="12" cy="12" r="9"/><path d="M5 14c2 0 2-2 3.5-2s1.5 2 3.5 2 2-2 3.5-2 1.5 2 3.5 2"/><path d="M12 3v4M12 17v4"/>`)
}

/** The state the one on the field is in, over her health bar. */
export const stateIcons: { readonly [Id in StateId]: string } = {
  cracked: icon(`<path d="m5 20-2-9 6-7 8 2 4 8-5 7zM12 5l-2 6 5 3-3 6"/>`),
  burning: icon(flame),
  soaked: icon(drop),
  // Charged: a small bolt.
  charged: icon(`<path d="M13.5 3L6 13h5l-1.5 8L18 11h-5z" fill="currentColor" fill-opacity="0.35"/>`),
  // Swept: three gusts.
  swept: icon(`<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>`)
}
