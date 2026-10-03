/**
 * Characters: base stats, body, their own moveset, the type of weapon they
 * wield (and the one they start with), and their kit (their own special and
 * ultimate).
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 *
 * What enters the arena is a team of builds (a character plus the weapon
 * equipped on her), each resolved into final stats and kit by
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
  /** Her kit: her own skill in each slot (no other character has them). */
  readonly skills: { readonly [Slot in SkillSlot]: SkillId }
}

const character = (spec: CharacterSpec): CharacterSpec => spec

/** Every character, by id. */
export const characters = {
  /** Close range: sturdy, with the sword combo, the Blade Wave, and the Cyclone (wind). */
  swordsman: character({
    name: "Swordsman",
    stats: { hp: 100, atk: 80, def: 20, speed: 265 },
    radius: 16,
    hurtboxRadius: 11,
    attack: "sword",
    weaponType: "sword",
    weapon: "trainingBlade",
    skills: { special: "bladeWave", ultimate: "cyclone" }
  }),
  /** Range: quicker and frailer, with the gun, grenades, and the Barrage (fire). */
  gunner: character({
    name: "Gunner",
    stats: { hp: 85, atk: 80, def: 10, speed: 280 },
    radius: 16,
    hurtboxRadius: 11,
    attack: "gun",
    weaponType: "gun",
    weapon: "trainingPistol",
    skills: { special: "grenade", ultimate: "barrage" }
  }),
  /** Middle range: discs that cut there and back, water that soaks and slows, and the Tide. */
  tidecaller: character({
    name: "Tidecaller",
    stats: { hp: 92, atk: 80, def: 15, speed: 272 },
    radius: 16,
    hurtboxRadius: 11,
    attack: "disc",
    weaponType: "disc",
    weapon: "trainingDisc",
    skills: { special: "splash", ultimate: "tide" }
  }),
  /** Support at middle range: a staff, a totem that zaps enemies or heals whoever stands by it, and a thunderclap that heals the team. */
  stormcaller: character({
    name: "Stormcaller",
    stats: { hp: 88, atk: 80, def: 12, speed: 272 },
    radius: 16,
    hurtboxRadius: 11,
    attack: "staff",
    weaponType: "staff",
    weapon: "trainingStaff",
    skills: { special: "sparkTotem", ultimate: "thunderclap" }
  })
}

export type CharacterId = keyof typeof characters
