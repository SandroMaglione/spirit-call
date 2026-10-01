/**
 * Characters: base stats, body, their own moveset, the type of weapon they
 * wield (and the one they start with), and the skills they start with.
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 *
 * What enters the arena is a team of builds (a character plus what is
 * equipped on it), each resolved into final stats and kit by
 * `resolveBuild`. Base stats are before the weapon: a character's ATK is
 * mostly its weapon's.
 */
import type { AttackId } from "./attacks.ts"
import type { SkillId, SkillSlot } from "./skills.ts"
import type { WeaponId, WeaponType } from "./weapons.ts"

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
  /** The character's moveset (see `content/attacks.ts`). */
  readonly attack: AttackId
  /** The weapons it can wield. */
  readonly weaponType: WeaponType
  /** The weapon it wields unless the build equips another of its type. */
  readonly weapon: WeaponId
  /** The skill in each slot unless the build equips another. */
  readonly skills: { readonly [Slot in SkillSlot]: SkillId }
}

const character = (spec: CharacterSpec): CharacterSpec => spec

/** Every character, by id. */
export const characters = {
  /** Close range: sturdy, with the sword combo and the Blade Wave. */
  swordsman: character({
    name: "Swordsman",
    stats: { hp: 100, atk: 80, def: 20, speed: 320 },
    radius: 16,
    hurtboxRadius: 11,
    attack: "sword",
    weaponType: "sword",
    weapon: "trainingBlade",
    skills: { special: "bladeWave", ultimate: "nova" }
  }),
  /** Range: quicker and frailer, with the gun and grenades. */
  gunner: character({
    name: "Gunner",
    stats: { hp: 85, atk: 80, def: 10, speed: 340 },
    radius: 16,
    hurtboxRadius: 11,
    attack: "gun",
    weaponType: "gun",
    weapon: "trainingPistol",
    skills: { special: "grenade", ultimate: "nova" }
  }),
  /** Middle range: discs that cut there and back, and water that soaks and slows. */
  tidecaller: character({
    name: "Tidecaller",
    stats: { hp: 92, atk: 80, def: 15, speed: 330 },
    radius: 16,
    hurtboxRadius: 11,
    attack: "disc",
    weaponType: "disc",
    weapon: "trainingDisc",
    skills: { special: "splash", ultimate: "nova" }
  })
}

export type CharacterId = keyof typeof characters
