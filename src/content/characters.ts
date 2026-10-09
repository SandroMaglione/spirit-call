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
 * What her kit does for the team: fight, support it (heal, keep it going),
 * or guard it (shield it). It sets how much of her strength sits in her body
 * (see `bodyRules`): a support's or a guardian's kit does part of what her
 * stats would.
 */
export type Role = "fighter" | "support" | "guardian"

/** Each role's name, as menus show it. */
export const roleNames: { readonly [R in Role]: string } = { fighter: "Fighter", support: "Support", guardian: "Guardian" }

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
 * `range` share, within `tolerance`: a support's or a guardian's kit does
 * part of the work, and those fighting closer take more blows.
 * `validateContent` holds every character to it.
 */
export const bodyRules = {
  reference: { hp: 75, atk: 100, def: 15, speed: 295 } satisfies Stats,
  role: { fighter: 1, support: 0.85, guardian: 0.95 } satisfies { readonly [R in Role]: number },
  range: { close: 1.05, middle: 1, long: 0.95 },
  tolerance: 0.05
}

/** Health as DEF stretches it: how much damage of no element it takes to fall (see `Tuning.combat.defenseScale`). */
export const effectiveHealth = (stats: Stats, defenseScale: number): number => stats.hp * (defenseScale + Math.max(0, stats.def)) / defenseScale

/** A body's score beside the reference body's (1): ATK, effective health, and speed, multiplied. */
export const bodyScore = (stats: Stats, defenseScale: number): number => {
  const reference = bodyRules.reference
  return (stats.atk / reference.atk) * (effectiveHealth(stats, defenseScale) / effectiveHealth(reference, defenseScale)) * (stats.speed / reference.speed)
}

/** Every character, by id. */
export const characters = {
  /** Wind, Blade, fighter: a bruiser, sturdy and steady in close; the Gust throws a crowd off, the Cyclone draws it in. */
  swordsman: character({
    name: "Swordsman",
    stats: { hp: 82, atk: 92, def: 22, speed: 290 },
    radius: 16,
    hurtboxRadius: 11,
    element: "wind",
    class: "blade",
    role: "fighter",
    skills: { special: "bladeWave", ultimate: "cyclone" }
  }),
  /** Fire, Gun, fighter: a glass cannon, quick, hard-hitting, and frail, at range; the Flare Jump leaps out of a crowd, the Barrage rains fire. */
  gunner: character({
    name: "Gunner",
    stats: { hp: 58, atk: 125, def: 8, speed: 310 },
    radius: 16,
    hurtboxRadius: 11,
    element: "fire",
    class: "gun",
    role: "fighter",
    skills: { special: "flareJump", ultimate: "barrage" }
  }),
  /** Water, Disc, fighter: an agile skirmisher at middle range, quick and sharp; the Tidal Wave shoves and soaks, the Tide soaks everything around her. */
  tidecaller: character({
    name: "Tidecaller",
    stats: { hp: 70, atk: 105, def: 12, speed: 310 },
    radius: 16,
    hurtboxRadius: 11,
    element: "water",
    class: "disc",
    role: "fighter",
    skills: { special: "tidalWave", ultimate: "tide" }
  }),
  /** Thunder, Staff, support: at middle range, her strength in her kit (a totem that zaps enemies or heals whoever stands by it, and a thunderclap that heals the team), not her blows. */
  stormcaller: character({
    name: "Stormcaller",
    stats: { hp: 72, atk: 88, def: 15, speed: 295 },
    radius: 16,
    hurtboxRadius: 11,
    element: "thunder",
    class: "staff",
    role: "support",
    skills: { special: "sparkTotem", ultimate: "thunderclap" }
  }),
  /** Rock, Disc, guardian: a tank, the sturdiest and slowest, hitting lightly; cracks the toughest with an Earthrise, and guards the team with stone plates. */
  stonekeeper: character({
    name: "Bastion",
    stats: { hp: 85, atk: 80, def: 30, speed: 275 },
    radius: 16,
    hurtboxRadius: 11,
    element: "rock",
    class: "disc",
    role: "guardian",
    skills: { special: "stoneRise", ultimate: "stoneGuard" }
  })
}

export type CharacterId = keyof typeof characters
