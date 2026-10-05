/**
 * Aspects: the ways of using a class (see docs/aspects.md). An aspect sets a
 * character's combo, charged attack, dash strike, and one passive, and may
 * give one moment to her element (`infuse`): it never names an element, so
 * the same aspect works for every character of its class, with her element
 * in that moment. Every class also has its plain aspect (see
 * `content/classes.ts`), which no one collects. The account owns aspects,
 * and a team equips each on one character at most. Numbers are
 * live-tunable: they are part of the `Tuning` resource.
 */
import type { BasicAttackSpec } from "./attacks.ts"
import type { ClassId, ClassSpec, Moves } from "./classes.ts"
import type { MoveFilter, Passive } from "./passives.ts"

export interface AspectSpec extends Moves {
  /** Shown in menus. */
  readonly name: string
  /** How it plays and what it is good against, in a sentence or two. */
  readonly description: string
  /** The class it belongs to: any character of it can equip it. */
  readonly class: ClassId
  /** Its passive: effects made of the shared vocabulary (see `content/passives.ts`), reading only facts that belong to no element. */
  readonly passives: ReadonlyArray<Passive>
  /** Its one elemental moment: the move whose blows carry her element; `null`: none. */
  readonly infuse: MoveFilter | null
}

/** Every aspect, by id. */
export const aspects = {} satisfies { readonly [id: string]: AspectSpec }

export type AspectId = keyof typeof aspects

/** The aspect `id` in `all` (the tuning's aspects). */
export const aspectOf = (all: { readonly [Id in AspectId]: AspectSpec }, id: AspectId): AspectSpec => (all as Readonly<Record<string, AspectSpec>>)[id]!

/** The basic attack of a class with an aspect (or its plain one, `null`): the class's handling, the aspect's moves. */
export const basicAttack = (spec: ClassSpec, aspect: AspectSpec | null): BasicAttackSpec => {
  const moves: Moves = aspect ?? spec.plain
  const { handling } = spec
  return {
    name: aspect?.name ?? spec.plain.name,
    combo: moves.combo,
    comboWindow: handling.comboWindow,
    inputBuffer: handling.inputBuffer,
    active: handling.active,
    lungeStop: handling.lungeStop,
    attackingSpeed: handling.attackingSpeed,
    power: moves.charged === null ? null : { holdDelay: handling.holdDelay, chargeTime: moves.charged.chargeTime, moveSpeedMultiplier: handling.chargingSpeed, move: moves.charged.move },
    dash: moves.dash,
    magazine: moves.magazine,
    chain: moves.chain,
    infuse: aspect?.infuse ?? null
  }
}
