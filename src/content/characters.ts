/**
 * Characters: base stats, body, her element and her class (fixed), and her
 * kit (her own special and ultimate).
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 *
 * Each body is different on purpose (bulky, quick, hard-hitting, frail),
 * and every one keeps to one budget (`bodyRules`).
 *
 * What enters the arena is a team of builds (a character at her level, and
 * the aspect of her class equipped on her), each resolved into final stats
 * and kit by `resolveBuild`. Her level gives all her stats; an aspect gives
 * none (see docs/aspects.md).
 */
import type { ClassId } from "./classes.ts"
import type { ElementId } from "./elements.ts"
import type { SkillId, SkillSlot } from "./skills.ts"

/** The most characters a team holds (one on the field, the others on the bench). */
export const teamSize = 3

/** The stats combat reads. Characters and enemies both have them. */
export interface Stats {
  /** Health. */
  readonly hp: number
  /** Attack: moves and skills deal their `power` as a percentage of it. */
  readonly atk: number
  /** Defense: reduces damage taken (see `Tuning.combat.defenseScale`). */
  readonly def: number
  /** Running speed (units per second). */
  readonly speed: number
}

/**
 * What her kit does for the team (see docs/roster.md): fight, heal it, or
 * guard it (stop blows before they land). It sets how much of her strength
 * sits in her body (see `bodyRules`): a healer's or a guardian's kit does
 * part of what her stats would.
 */
export type Role = "attacker" | "healer" | "guardian"

/** Each role's name, as menus show it. */
export const roleNames: { readonly [R in Role]: string } = { attacker: "Attacker", healer: "Healer", guardian: "Guardian" }

/** What a character's dash can change from the reference dash (see `Tuning.dash`). */
export interface DashProfile {
  /** Dashes ready at once. */
  readonly charges: number
  /** How far one dash carries her. */
  readonly distance: number
  /** Seconds for a spent dash to come back. */
  readonly cooldown: number
  /** Seconds she is untouchable from the start of a dash. */
  readonly invulnerability: number
}

export interface CharacterSpec {
  /** Shown in menus. */
  readonly name: string
  readonly stats: Stats
  /** Collision radius of the body against walls. */
  readonly radius: number
  /** Radius enemy attacks test against; smaller than the body, so near misses read as misses. */
  readonly hurtboxRadius: number
  /** Her element: what her skills, and her aspect's elemental moment, carry (see docs/elements.md). */
  readonly element: ElementId
  /** Her class: how her basic attack fights, shaped by the aspect equipped on her (see docs/aspects.md). */
  readonly class: ClassId
  /** What her kit does for the team; with her class's range, how much body she gets (see `bodyRules`). */
  readonly role: Role
  /** Her dash: what she changes from the reference dash (nothing: the reference's). */
  readonly dash: Partial<DashProfile>
  /** How hard her blows hit a break bar: 1 the reference, above 1 she breaks enemies sooner. */
  readonly impact: number
  /** How firmly she stands: 1 the reference; a heavier body is pushed less far by blows. */
  readonly weight: number
  /** Her kit: her own skill in each slot (no other character has them). */
  readonly skills: { readonly [Slot in SkillSlot]: SkillId }
}

const character = (spec: CharacterSpec): CharacterSpec => spec

/**
 * One budget for every body (see docs/balance.md, "Bodies"). A body's
 * score is its ATK, its effective health (HP, as DEF stretches it), and its
 * speed, each beside the `reference` body's, multiplied: a score of 1 is the
 * reference. Characters spend it differently (bulky, quick, hard-hitting,
 * fragile), but each one's score is her `role`'s share times her class's
 * `range` share, within `tolerance`: a healer's or a guardian's kit does
 * part of the work, and those fighting closer take more blows.
 * `validateContent` holds every character to it.
 */
export const bodyRules = {
  reference: { hp: 75, atk: 100, def: 15, speed: 295 } satisfies Stats,
  role: { attacker: 1, healer: 0.85, guardian: 0.95 } satisfies { readonly [R in Role]: number },
  range: { close: 1.05, middle: 1, long: 1 },
  /**
   * The reference dash (the Swordsman's, `Tuning.dash`), and how much her
   * dash, impact, and weight count beside her stats: their product, raised
   * to `personality` (a quarter: they shape how she plays more than how
   * strong she is).
   */
  dash: { charges: 2, distance: 170, cooldown: 1.1, invulnerability: 0.18 } satisfies DashProfile,
  personality: 0.25,
  tolerance: 0.05
}

/** Health as DEF stretches it: how much damage of no element it takes to fall (see `Tuning.combat.defenseScale`). */
export const effectiveHealth = (stats: Stats, defenseScale: number): number => stats.hp * (defenseScale + Math.max(0, stats.def)) / defenseScale

/**
 * A dash beside the reference dash (1): how many, how far, how soon back,
 * and (counting half) how long untouchable.
 */
export const dashScore = (dash: Partial<DashProfile>): number => {
  const reference = bodyRules.dash
  const own = { ...reference, ...dash }
  return (own.charges / reference.charges) * (own.distance / reference.distance) * (reference.cooldown / own.cooldown) * Math.sqrt(own.invulnerability / reference.invulnerability)
}

/**
 * A body's score beside the reference body's (1): ATK, effective health,
 * and speed, multiplied, and her dash, impact, and weight, counting a
 * quarter (`bodyRules.personality`).
 */
export const bodyScore = (spec: Pick<CharacterSpec, "stats" | "dash" | "impact" | "weight">, defenseScale: number): number => {
  const { stats } = spec
  const reference = bodyRules.reference
  const core = (stats.atk / reference.atk) * (effectiveHealth(stats, defenseScale) / effectiveHealth(reference, defenseScale)) * (stats.speed / reference.speed)
  return core * (dashScore(spec.dash) * spec.impact * spec.weight) ** bodyRules.personality
}

/** Every character, by id. */
export const characters = {
  /** Wind, Blade, attacker: a bruiser, sturdy and steady in close; the Gust throws a crowd off, the Cyclone draws it in. */
  swordsman: character({
    name: "Swordsman",
    stats: { hp: 82, atk: 86, def: 22, speed: 290 },
    radius: 16,
    hurtboxRadius: 11,
    element: "wind",
    class: "blade",
    role: "attacker",
    dash: {},
    impact: 1.15,
    weight: 1.2,
    skills: { special: "bladeWave", ultimate: "cyclone" }
  }),
  /** Fire, Gun, attacker: a glass cannon, quick, hard-hitting, and frail, at range; the Flare Jump leaps out of a crowd, the Barrage rains fire. */
  gunner: character({
    name: "Gunner",
    stats: { hp: 64, atk: 128, def: 8, speed: 310 },
    radius: 16,
    hurtboxRadius: 11,
    element: "fire",
    class: "gun",
    role: "attacker",
    dash: { distance: 200 },
    impact: 0.85,
    weight: 0.8,
    skills: { special: "flareJump", ultimate: "barrage" }
  }),
  /**
   * Water, Disc, healer: agile at middle range, her strength in her kit. Her
   * healing asks for blows: the Tidal Wave marks what it hits, and hitting the
   * marked heals whoever is on the field; the Tide heals the whole team, more
   * for each enemy already soaked.
   */
  tidecaller: character({
    name: "Tidecaller",
    stats: { hp: 74, atk: 88, def: 12, speed: 305 },
    radius: 16,
    hurtboxRadius: 11,
    element: "water",
    class: "disc",
    role: "healer",
    dash: { charges: 3, distance: 140, cooldown: 1.2, invulnerability: 0.16 },
    impact: 0.9,
    weight: 0.85,
    skills: { special: "tidalWave", ultimate: "tide" }
  }),
  /** Thunder, Staff, healer: at middle range, her strength in her kit (a totem that zaps enemies or heals whoever stands by it, and a thunderclap that heals the team), not her blows. */
  stormcaller: character({
    name: "Stormcaller",
    stats: { hp: 74, atk: 88, def: 15, speed: 295 },
    radius: 16,
    hurtboxRadius: 11,
    element: "thunder",
    class: "staff",
    role: "healer",
    dash: {},
    impact: 0.9,
    weight: 1,
    skills: { special: "sparkTotem", ultimate: "thunderclap" }
  }),
  /** Rock, Disc, guardian: a tank, the sturdiest and slowest, hitting lightly; cracks the toughest with an Earthrise, and guards the team with stone plates. */
  bastion: character({
    name: "Bastion",
    stats: { hp: 85, atk: 72, def: 30, speed: 275 },
    radius: 16,
    hurtboxRadius: 11,
    element: "rock",
    class: "disc",
    role: "guardian",
    dash: { distance: 150, cooldown: 1.35, invulnerability: 0.24 },
    impact: 1.25,
    weight: 1.4,
    skills: { special: "stoneRise", ultimate: "stoneGuard" }
  }),
  /**
   * Thunder, Gauntlets, attacker (a working name): the fast one, very close,
   * hard-hitting, light and frail. The Spark Step darts her through a line
   * of enemies, charging them; the Overcharge turns her to lightning for a
   * while, every dash a Spark Step of its own and all but endless. Her dash
   * is a little slower than her quickness suggests: the Gauntlets' blows
   * bring it back (see `Handling.dashFeed`).
   */
  sparkfist: character({
    name: "Sparkfist",
    stats: { hp: 68, atk: 121, def: 10, speed: 330 },
    radius: 16,
    hurtboxRadius: 11,
    element: "thunder",
    class: "gauntlets",
    role: "attacker",
    dash: { distance: 150, cooldown: 1, invulnerability: 0.15 },
    impact: 0.9,
    weight: 0.8,
    skills: { special: "sparkStep", ultimate: "stormFlurry" }
  }),
  /**
   * Water, Blade, guardian (a working name): steady in close, a guardian
   * who times blows rather than outlasting them. The Brace takes one blow
   * whole and answers it, disarming the attacker; the Floodgate soaks the
   * crowd and, for a while, readies every brace that takes a blow at once.
   */
  tidewarden: character({
    name: "Tidewarden",
    stats: { hp: 82, atk: 78, def: 26, speed: 285 },
    radius: 16,
    hurtboxRadius: 11,
    element: "water",
    class: "blade",
    role: "guardian",
    dash: {},
    impact: 1.15,
    weight: 1.25,
    skills: { special: "brace", ultimate: "floodgate" }
  }),
  /**
   * Rock, Hammer, attacker (a working name): the slow, heavy hitter, frail
   * for her strength and slow on her feet, her dash short. With Splinters
   * her blows throw rock splinters that burst a moment later; the
   * Rockburst bursts them out all around her.
   */
  quarry: character({
    name: "Quarry",
    stats: { hp: 74, atk: 110, def: 12, speed: 260 },
    radius: 16,
    hurtboxRadius: 11,
    element: "rock",
    class: "hammer",
    role: "attacker",
    dash: { distance: 150, cooldown: 1.25 },
    impact: 1.4,
    weight: 1.5,
    skills: { special: "faultLine", ultimate: "landslide" }
  }),
  /**
   * Fire, Hammer, healer (a working name): close and sturdy for a healer,
   * her strength in her kit. Her healing asks for fire: the Kindle turns
   * the burns around her into the team's health, more for each enemy kept
   * burning; the Wildfire sets the crowd alight for it.
   */
  hearth: character({
    name: "Hearth",
    stats: { hp: 78, atk: 80, def: 18, speed: 280 },
    radius: 16,
    hurtboxRadius: 11,
    element: "fire",
    class: "hammer",
    role: "healer",
    dash: { distance: 160, cooldown: 1.2 },
    impact: 1.2,
    weight: 1.3,
    skills: { special: "kindle", ultimate: "wildfire" }
  }),
  /**
   * Wind, Staff, guardian (a working name): quick at middle range, a
   * guardian who stops shots by where she puts her walls. The Gale Wall
   * stands across her aim; the Eye of the Storm rings her round.
   */
  windwall: character({
    name: "Windwall",
    stats: { hp: 78, atk: 84, def: 22, speed: 300 },
    radius: 16,
    hurtboxRadius: 11,
    element: "wind",
    class: "staff",
    role: "guardian",
    dash: { distance: 180 },
    impact: 1,
    weight: 0.95,
    skills: { special: "galeWall", ultimate: "eyeOfTheStorm" }
  })
}

export type CharacterId = keyof typeof characters
