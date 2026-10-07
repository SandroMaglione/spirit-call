/**
 * Builds and the damage formula.
 *
 * A build (a character, at her level, with the aspect equipped on her)
 * resolves into the final stats, kit (her own skills), basic attack (her
 * class's, shaped by the aspect), and passives she enters the arena with.
 * Her level gives all her stats; an aspect gives none.
 *
 * Damage comes from stats: an attack deals its `power` as a percentage of the
 * attacker's ATK, and the target's DEF reduces it (see `Tuning.combat`).
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { aspectOf, basicAttack } from "../content/aspects.ts"
import type { AspectId } from "../content/aspects.ts"
import type { BasicAttackSpec } from "../content/attacks.ts"
import type { CharacterId, Stats } from "../content/characters.ts"
import type { ElementId } from "../content/elements.ts"
import type { StatCurve } from "../content/progression.ts"
import type { Passive } from "../content/passives.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import type { AttackRef, BuildValue } from "../schema.ts"

export interface ResolvedBuild {
  readonly character: CharacterId
  readonly stats: Stats
  readonly radius: number
  readonly hurtboxRadius: number
  readonly element: ElementId
  /** Her basic attack: her class, and the aspect equipped (`null`: its plain one). */
  readonly attack: AttackRef
  readonly skills: { readonly [Slot in SkillSlot]: SkillId }
  readonly passives: ReadonlyArray<Passive>
}

/**
 * How much stronger level `level` is than level 1: 1 at level 1, `curve.band`
 * at level `curve.at`, and on along the same curve past it (see
 * `StatCurve`). The one stat curve every level follows.
 */
export const levelScale = (curve: StatCurve, level: number): number => {
  if (curve.at <= 1) return 1
  const reached = Math.max(0, (level - 1) / (curve.at - 1))
  return 1 + (curve.band - 1) * reached ** curve.shape
}

/** `base` at character level `level`: HP, ATK, and DEF scaled (to whole numbers), speed as it is. */
export const statsAtLevel = (tuning: TuningValue, base: Stats, level: number): Stats => {
  const scale = levelScale(tuning.progression.stats, level)
  return { hp: Math.round(base.hp * scale), atk: Math.round(base.atk * scale), def: Math.round(base.def * scale), speed: base.speed }
}

/** The build the game starts with: the first character, fighting with her class's plain aspect. */
export const defaultBuild: BuildValue = { character: "swordsman" }

/** The team the game starts with: the default build alone. */
export const defaultTeam: ReadonlyArray<BuildValue> = [defaultBuild]

/** The aspect `id`, when it is one of `character`'s class; otherwise none (her plain one). */
export const aspectFor = (tuning: TuningValue, character: CharacterId, id: AspectId | null | undefined): AspectId | null => {
  if (id === null || id === undefined || !Object.hasOwn(tuning.aspects, id)) return null
  return aspectOf(tuning.aspects, id).class === tuning.characters[character].class ? id : null
}

/**
 * Final stats and kit of `build`: the character's stats at its level, her
 * own skills, and her basic attack (her class with the aspect equipped, if
 * it is of her class) with its passives.
 */
export const resolveBuild = (tuning: TuningValue, build: BuildValue): ResolvedBuild => {
  const character = tuning.characters[build.character]
  const aspect = aspectFor(tuning, build.character, build.aspect)
  return {
    character: build.character,
    stats: statsAtLevel(tuning, character.stats, build.level ?? 1),
    radius: character.radius,
    hurtboxRadius: character.hurtboxRadius,
    element: character.element,
    attack: { class: character.class, aspect },
    skills: character.skills,
    passives: aspect === null ? [] : aspectOf(tuning.aspects, aspect).passives
  }
}

/** What breaks the aspect rules in a team (see docs/aspects.md): an aspect of another class than hers, or one on two members. */
export type AspectProblem =
  | { readonly kind: "otherClass"; readonly character: CharacterId; readonly aspect: AspectId }
  | { readonly kind: "twice"; readonly aspect: AspectId; readonly characters: ReadonlyArray<CharacterId> }

/** What breaks the aspect rules in `team` (each member with the aspect equipped on her, if any). */
export const aspectProblems = (tuning: TuningValue, team: ReadonlyArray<{ readonly character: CharacterId; readonly aspect?: AspectId | undefined }>): Array<AspectProblem> => {
  const problems: Array<AspectProblem> = []
  const holders = new Map<AspectId, Array<CharacterId>>()
  for (const { character, aspect } of team) {
    if (aspect === undefined) continue
    if (!Object.hasOwn(tuning.aspects, aspect) || aspectOf(tuning.aspects, aspect).class !== tuning.characters[character].class) {
      problems.push({ kind: "otherClass", character, aspect })
      continue
    }
    holders.set(aspect, [...(holders.get(aspect) ?? []), character])
  }
  for (const [aspect, characters] of holders) if (characters.length > 1) problems.push({ kind: "twice", aspect, characters })
  return problems
}

/**
 * `team` keeping only the aspects the rules allow: one of her class, on one
 * member (the first to hold it keeps it); the others fight with their plain
 * aspect. What enters the arena goes through it, quick-start links included.
 */
export const withValidAspects = <Build extends { readonly character: CharacterId; readonly aspect?: AspectId | undefined }>(tuning: TuningValue, team: ReadonlyArray<Build>): ReadonlyArray<Build> => {
  const taken = new Set<AspectId>()
  return team.map((build) => {
    const { aspect } = build
    if (aspect === undefined) return build
    const fits = Object.hasOwn(tuning.aspects, aspect) && aspectOf(tuning.aspects, aspect).class === tuning.characters[build.character].class
    if (fits && !taken.has(aspect)) {
      taken.add(aspect)
      return build
    }
    const { aspect: _dropped, ...plain } = build
    return plain as Build
  })
}

const attacks = new WeakMap<TuningValue, Map<string, BasicAttackSpec>>()

/** The basic attack `ref` names: its class's handling and its aspect's moves (made once per tuning, see `basicAttack`). */
export const attackOf = (tuning: TuningValue, ref: AttackRef): BasicAttackSpec => {
  let made = attacks.get(tuning)
  if (made === undefined) {
    made = new Map()
    attacks.set(tuning, made)
  }
  const key = `${ref.class}/${ref.aspect ?? ""}`
  let attack = made.get(key)
  if (attack === undefined) {
    attack = basicAttack(tuning.classes[ref.class], ref.aspect === null ? null : aspectOf(tuning.aspects, ref.aspect))
    made.set(key, attack)
  }
  return attack
}

/** Damage an attack of `power` (percent) deals from an attacker with `atk`, before the target's DEF. */
export const damageDealt = (atk: number, power: number): number => (atk * power) / 100

/** Damage a target with `def` takes from `amount`. */
export const damageTaken = (tuning: TuningValue, amount: number, def: number): number =>
  (amount * tuning.combat.defenseScale) / (tuning.combat.defenseScale + Math.max(0, def))
