/**
 * Characters: base stats, body, their own moveset (the weapon is the
 * character's), and the skills they start with. Numbers are live-tunable:
 * they are part of the `Tuning` resource.
 *
 * What enters the arena is a `Build` (a character plus what is equipped on
 * it), resolved into final stats and kit by `resolveBuild`.
 */
import type { AttackId } from "./attacks.ts"
import type { SkillId, SkillSlot } from "./skills.ts"

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
  /** The character's moveset: its weapon (see `content/attacks.ts`). */
  readonly attack: AttackId
  /** The skill in each slot unless the build equips another. */
  readonly skills: { readonly [Slot in SkillSlot]: SkillId }
}

const character = (spec: CharacterSpec): CharacterSpec => spec

/** Every character, by id. */
export const characters = {
  /** Close range: sturdy, with the sword combo and the Blade Wave. */
  swordsman: character({
    name: "Swordsman",
    stats: { hp: 100, atk: 100, def: 20, speed: 320 },
    radius: 16,
    hurtboxRadius: 11,
    attack: "sword",
    skills: { special: "bladeWave", ultimate: "nova" }
  }),
  /** Range: quicker and frailer, with the gun and grenades. */
  gunner: character({
    name: "Gunner",
    stats: { hp: 85, atk: 100, def: 10, speed: 340 },
    radius: 16,
    hurtboxRadius: 11,
    attack: "gun",
    skills: { special: "grenade", ultimate: "nova" }
  })
}

export type CharacterId = keyof typeof characters
