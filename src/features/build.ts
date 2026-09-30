/**
 * Builds and the damage formula.
 *
 * A `Build` (a character plus the weapon and skills equipped on it) resolves
 * into the final stats, kit, and passives the player spawns with. The weapon
 * adds its ATK to the character's, then its bonus raises one stat by a
 * percentage.
 *
 * Damage comes from stats: an attack deals its `power` as a percentage of the
 * attacker's ATK, and the target's DEF reduces it (see `Tuning.combat`).
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { AttackId } from "../content/attacks.ts"
import type { Stats } from "../content/characters.ts"
import type { StatCurve } from "../content/progression.ts"
import type { Passive } from "../content/passives.ts"
import { bySlot } from "../content/skills.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import type { WeaponId, WeaponSpec } from "../content/weapons.ts"
import type { BuildValue } from "../schema.ts"

export interface ResolvedBuild {
  readonly stats: Stats
  readonly radius: number
  readonly hurtboxRadius: number
  readonly attack: AttackId
  readonly weapon: WeaponId
  readonly skills: { readonly [Slot in SkillSlot]: SkillId }
  readonly passives: ReadonlyArray<Passive>
}

/**
 * How much stronger level `level` is than level 1, for something whose
 * levels go up to `maxLevel`: 1 at level 1, `curve.band` at the maximum (see
 * `StatCurve`). The one stat curve every level follows.
 */
export const levelScale = (curve: StatCurve, level: number, maxLevel: number): number => {
  if (maxLevel <= 1) return 1
  const reached = Math.min(1, Math.max(0, (level - 1) / (maxLevel - 1)))
  return 1 + (curve.band - 1) * reached ** curve.shape
}

/** `base` at character level `level`: HP, ATK, and DEF scaled (to whole numbers), speed as it is. */
export const statsAtLevel = (tuning: TuningValue, base: Stats, level: number): Stats => {
  const scale = levelScale(tuning.progression.stats, level, tuning.progression.character.curve.maxLevel)
  return { hp: Math.round(base.hp * scale), atk: Math.round(base.atk * scale), def: Math.round(base.def * scale), speed: base.speed }
}

/** The build the game starts with: the first character, with its own weapon and skills. */
export const defaultBuild: BuildValue = { character: "swordsman", skills: {} }

/**
 * Final stats and kit of `build`: the character's stats at its level, with
 * its weapon (the equipped one if it is of the character's type, else the
 * character's own) and equipped skills in place of its defaults.
 */
export const resolveBuild = (tuning: TuningValue, build: BuildValue): ResolvedBuild => {
  const character = tuning.characters[build.character]
  const weapon = build.weapon !== undefined && tuning.weapons[build.weapon].type === character.weaponType ? build.weapon : character.weapon
  return {
    stats: withWeapon(statsAtLevel(tuning, character.stats, build.level ?? 1), tuning.weapons[weapon]),
    radius: character.radius,
    hurtboxRadius: character.hurtboxRadius,
    attack: character.attack,
    weapon,
    skills: bySlot((slot) => build.skills[slot] ?? character.skills[slot]),
    passives: tuning.weapons[weapon].passives
  }
}

/** `base` with `weapon`'s ATK added, then its bonus stat raised by its percentage (rounded to a whole number). */
export const withWeapon = (base: Stats, weapon: WeaponSpec): Stats => {
  const stats = { ...base, atk: base.atk + weapon.atk }
  if (weapon.bonus === null) return stats
  return { ...stats, [weapon.bonus.stat]: Math.round(stats[weapon.bonus.stat] * (1 + weapon.bonus.percent / 100)) }
}

/** Damage an attack of `power` (percent) deals from an attacker with `atk`, before the target's DEF. */
export const damageDealt = (atk: number, power: number): number => (atk * power) / 100

/** Damage a target with `def` takes from `amount`. */
export const damageTaken = (tuning: TuningValue, amount: number, def: number): number =>
  (amount * tuning.combat.defenseScale) / (tuning.combat.defenseScale + Math.max(0, def))
