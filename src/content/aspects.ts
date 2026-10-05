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
import { disc, shot, thrust } from "./attacks.ts"
import type { BasicAttackSpec } from "./attacks.ts"
import type { ClassId, ClassSpec, Moves } from "./classes.ts"
import { combo, counter, damageBonus, lastRound, targetHealthBelow, targetInState, withMove } from "./passives.ts"
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

const aspect = (spec: AspectSpec): AspectSpec => spec

/** Every aspect, by id. */
export const aspects = {
  /**
   * Duelist (Blade): three thrusts, each harder than the last; charged, a
   * long lunge. Its counter (the dash strike out of a dash that perfectly
   * dodged a blow) is a heavy blow that deals double, and carries her
   * element. For elites and armored enemies; weaker against a crowd.
   */
  duelist: aspect({
    name: "Duelist",
    description: "Three thrusts, each harder than the last; charged, a long lunge. A counter right after a perfect dodge deals double and carries her element. For elites and armor, weaker against a crowd.",
    class: "blade",
    combo: [
      thrust({ reach: 175, width: 52, power: 20, knockback: 380, recovery: 0.22, hitStop: 0.06, heavy: false, lunge: 28 }),
      thrust({ reach: 180, width: 52, power: 28, knockback: 460, recovery: 0.26, hitStop: 0.07, heavy: false, lunge: 32 }),
      thrust({ reach: 195, width: 60, power: 44, knockback: 900, recovery: 0.5, hitStop: 0.12, heavy: true, lunge: 44 })
    ],
    charged: { chargeTime: 0.5, move: thrust({ reach: 260, width: 70, power: 60, knockback: 1000, recovery: 0.5, hitStop: 0.14, heavy: true, lunge: 160 }) },
    /** A heavy lunge out of the dash: the counter. */
    dash: thrust({ reach: 185, width: 64, power: 28, knockback: 620, recovery: 0.3, hitStop: 0.1, heavy: true, lunge: 90 }),
    magazine: null,
    chain: null,
    passives: [damageBonus(100, withMove(counter()))],
    infuse: counter()
  }),
  /**
   * Marksman (Gun): slow shots that pierce, three rounds; charged, a rail
   * shot through every enemy in a line. Its last round carries her element;
   * its shots deal more to the wounded. From afar, against enemies at range.
   */
  marksman: aspect({
    name: "Marksman",
    description: "Slow shots that pierce, three rounds; charged, a rail shot through a whole line. The last round carries her element, and shots deal more to the wounded. From afar, against enemies at range.",
    class: "gun",
    combo: [
      shot({ count: 1, spreadDegrees: 0, speed: 1500, radius: 7, range: 820, pierce: 1, power: 34, knockback: 360, recovery: 0.3, hitStop: 0.05, heavy: false, lunge: -6 })
    ],
    charged: { chargeTime: 0.7, move: shot({ count: 1, spreadDegrees: 0, speed: 1900, radius: 9, range: 900, pierce: 12, power: 70, knockback: 520, recovery: 0.5, hitStop: 0.1, heavy: true, lunge: -20 }) },
    /** A piercing shot out of the dash. */
    dash: shot({ count: 1, spreadDegrees: 0, speed: 1500, radius: 7, range: 700, pierce: 2, power: 26, knockback: 300, recovery: 0.3, hitStop: 0.05, heavy: false, lunge: -10 }),
    magazine: { rounds: 3, reload: 1.1 },
    chain: null,
    passives: [damageBonus(50, targetHealthBelow(0.3))],
    infuse: lastRound()
  }),
  /**
   * Riptide (Disc): the Ring's throws, bouncing on between enemies in a
   * state and dealing them half again as much; the pair in a V carries her
   * element. Feeds on states, hers or her team's.
   */
  riptide: aspect({
    name: "Riptide",
    description: "Discs bounce on between enemies in a state, and deal half again as much to them; the pair in a V carries her element. Feeds on states, hers or her team's.",
    class: "disc",
    combo: [
      disc({ count: 1, spreadDegrees: 0, speed: 1250, radius: 15, range: 360, hover: 0, hoverTick: 0, bounces: 2, power: 11, knockback: 340, recovery: 0.2, hitStop: 0.04, heavy: false, lunge: 0 }),
      disc({ count: 1, spreadDegrees: 0, speed: 1250, radius: 15, range: 360, hover: 0, hoverTick: 0, bounces: 2, power: 11, knockback: 340, recovery: 0.2, hitStop: 0.04, heavy: false, lunge: 0 }),
      disc({ count: 2, spreadDegrees: 26, speed: 1300, radius: 15, range: 380, hover: 0, hoverTick: 0, bounces: 2, power: 10, knockback: 420, recovery: 0.38, hitStop: 0.05, heavy: false, lunge: -6 })
    ],
    charged: { chargeTime: 0.6, move: disc({ count: 1, spreadDegrees: 0, speed: 1100, radius: 22, range: 340, hover: 1.2, hoverTick: 0.2, power: 9, knockback: 30, recovery: 0.5, hitStop: 0.04, heavy: true, lunge: -12 }) },
    dash: disc({ count: 1, spreadDegrees: 0, speed: 1150, radius: 16, range: 280, hover: 0, hoverTick: 0, bounces: 2, power: 14, knockback: 320, recovery: 0.3, hitStop: 0.05, heavy: false, lunge: 0 }),
    magazine: null,
    chain: null,
    passives: [damageBonus(50, targetInState())],
    infuse: combo(3)
  }),
  /**
   * Arc (Staff): the Spark's bolts, each jumping on to one more enemy
   * nearby with 60% of its damage; the pair in a V carries her element. For
   * spread-out groups.
   */
  arc: aspect({
    name: "Arc",
    description: "Bolts jump on to one more enemy nearby; the pair in a V carries her element. For spread-out groups.",
    class: "staff",
    combo: [
      shot({ count: 1, spreadDegrees: 0, speed: 860, radius: 7, range: 560, pierce: 1, power: 12, knockback: 220, recovery: 0.16, hitStop: 0.03, heavy: false, lunge: 0 }),
      shot({ count: 1, spreadDegrees: 0, speed: 860, radius: 7, range: 560, pierce: 1, power: 12, knockback: 220, recovery: 0.16, hitStop: 0.03, heavy: false, lunge: 0 }),
      shot({ count: 2, spreadDegrees: 14, speed: 860, radius: 7, range: 520, pierce: 1, power: 11, knockback: 300, recovery: 0.32, hitStop: 0.045, heavy: false, lunge: -6 })
    ],
    charged: { chargeTime: 0.6, move: shot({ count: 1, spreadDegrees: 0, speed: 560, radius: 13, range: 640, pierce: 6, power: 32, knockback: 420, recovery: 0.45, hitStop: 0.1, heavy: true, lunge: -24 }) },
    dash: shot({ count: 1, spreadDegrees: 0, speed: 900, radius: 11, range: 460, pierce: 3, power: 18, knockback: 360, recovery: 0.3, hitStop: 0.06, heavy: false, lunge: -12 }),
    magazine: null,
    chain: { range: 150, share: 0.6 },
    passives: [],
    infuse: combo(3)
  })
} satisfies { readonly [id: string]: AspectSpec }

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
