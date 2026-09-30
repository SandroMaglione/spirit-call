/**
 * Builds and the damage formula.
 *
 * A `Build` (a character plus what is equipped on it) resolves into the
 * final stats and kit the player spawns with. Damage comes from stats: an
 * attack deals its `power` as a percentage of the attacker's ATK, and the
 * target's DEF reduces it (see `Tuning.combat`).
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { AttackId } from "../content/attacks.ts"
import type { Stats } from "../content/characters.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import type { BuildValue } from "../schema.ts"
import { bySlot } from "./skills.ts"

export interface ResolvedBuild {
  readonly stats: Stats
  readonly radius: number
  readonly hurtboxRadius: number
  readonly attack: AttackId
  readonly skills: { readonly [Slot in SkillSlot]: SkillId }
}

/** The build the game starts with: the first character, with its own skills. */
export const defaultBuild: BuildValue = { character: "swordsman", skills: {} }

/** Final stats and kit of `build`: the character's, with equipped skills in place of its defaults. */
export const resolveBuild = (tuning: TuningValue, build: BuildValue): ResolvedBuild => {
  const character = tuning.characters[build.character]
  return {
    stats: character.stats,
    radius: character.radius,
    hurtboxRadius: character.hurtboxRadius,
    attack: character.attack,
    skills: bySlot((slot) => build.skills[slot] ?? character.skills[slot])
  }
}

/** Damage an attack of `power` (percent) deals from an attacker with `atk`, before the target's DEF. */
export const damageDealt = (atk: number, power: number): number => (atk * power) / 100

/** Damage a target with `def` takes from `amount`. */
export const damageTaken = (tuning: TuningValue, amount: number, def: number): number =>
  (amount * tuning.combat.defenseScale) / (tuning.combat.defenseScale + Math.max(0, def))
