/**
 * Characters: base stats, body, her element and her class (fixed), and her
 * kit (her own special and ultimate).
 * Numbers are live-tunable: they are part of the `Tuning` resource.
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
  /** Her kit: her own skill in each slot (no other character has them). */
  readonly skills: { readonly [Slot in SkillSlot]: SkillId }
}

const character = (spec: CharacterSpec): CharacterSpec => spec

/** Every character, by id. */
export const characters = {
  /** Wind, Blade: sturdy and close; the Gust throws a crowd off, the Cyclone draws it in. */
  swordsman: character({
    name: "Swordsman",
    stats: { hp: 75, atk: 100, def: 20, speed: 290 },
    radius: 16,
    hurtboxRadius: 11,
    element: "wind",
    class: "blade",
    skills: { special: "bladeWave", ultimate: "cyclone" }
  }),
  /** Fire, Gun: quicker and frailer, at range; the Flare Jump leaps out of a crowd, the Barrage rains fire. */
  gunner: character({
    name: "Gunner",
    stats: { hp: 64, atk: 100, def: 10, speed: 305 },
    radius: 16,
    hurtboxRadius: 11,
    element: "fire",
    class: "gun",
    skills: { special: "flareJump", ultimate: "barrage" }
  }),
  /** Water, Disc: at middle range; the Tidal Wave shoves and soaks, the Tide soaks everything around her. */
  tidecaller: character({
    name: "Tidecaller",
    stats: { hp: 69, atk: 100, def: 15, speed: 298 },
    radius: 16,
    hurtboxRadius: 11,
    element: "water",
    class: "disc",
    skills: { special: "tidalWave", ultimate: "tide" }
  }),
  /** Rock, Disc: a slow, sturdy defender whose ground impacts help break enemies. */
  stonekeeper: character({
    name: "Stonekeeper",
    stats: { hp: 75, atk: 100, def: 20, speed: 235 },
    radius: 16,
    hurtboxRadius: 11,
    element: "rock",
    class: "disc",
    skills: { special: "stoneGuard", ultimate: "stoneRise" }
  }),
  /** Thunder, Staff: support at middle range; a totem that zaps enemies or heals whoever stands by it, and a thunderclap that heals the team. */
  stormcaller: character({
    name: "Stormcaller",
    stats: { hp: 66, atk: 100, def: 12, speed: 298 },
    radius: 16,
    hurtboxRadius: 11,
    element: "thunder",
    class: "staff",
    skills: { special: "sparkTotem", ultimate: "thunderclap" }
  })
}

export type CharacterId = keyof typeof characters
