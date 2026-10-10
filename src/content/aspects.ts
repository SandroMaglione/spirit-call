/**
 * Aspects: the ways of using a class (see docs/aspects.md). An aspect sets a
 * character's combo, charged attack, and dash strike (with what its moves
 * also set off, part of the pattern), and may give one moment to her
 * element (`infuse`): it never names an element, so the same aspect works
 * for every character of its class, with her element in that moment. It
 * changes how she fights, never how strong she is: bonuses are relics' (see
 * `content/relics.ts`). Every class also has its plain aspect (see
 * `content/classes.ts`), which no one collects. The account owns aspects,
 * and a team equips each on one character at most. Numbers are
 * live-tunable: they are part of the `Tuning` resource.
 */
import { arc, disc, shot, slam, spin, thrust } from "./attacks.ts"
import type { BasicAttackSpec } from "./attacks.ts"
import type { ClassId, ClassSpec, Moves } from "./classes.ts"
import { combo, counter, finisher, lastRound, power } from "./passives.ts"
import { nova, totem } from "./skills.ts"
import type { SkillEffect } from "./skills.ts"
import type { MoveFilter } from "./passives.ts"

/** Something a move of an aspect also sets off, as part of its pattern (Whirlpool's finisher pushing back): from her, along her aim; `own`: carrying her element (its elemental moment). */
export interface MoveEffect {
  readonly move: MoveFilter
  readonly effect: SkillEffect
  readonly own: boolean
}

export interface AspectSpec extends Moves {
  /** Shown in menus. */
  readonly name: string
  /**
   * How its moves play, in a sentence or two, in words that hold for every
   * element: a pull or a push is the move's own, never an element's. Which
   * move carries her element is said apart (from `infuse`), with her
   * element named, so the same aspect reads right on every character.
   */
  readonly description: string
  /** What it is good against, in a few words. */
  readonly against: string
  /** The class it belongs to: any character of it can equip it. */
  readonly class: ClassId
  /** What its moves also set off: part of the pattern, never a bonus (see `MoveEffect`). */
  readonly effects: ReadonlyArray<MoveEffect>
  /** Its one elemental moment: the move whose blows carry her element; `null`: none. */
  readonly infuse: MoveFilter | null
}

const aspect = (spec: AspectSpec): AspectSpec => spec

/** Every aspect, by id. */
export const aspects = {
  /**
   * Duelist (Blade): three thrusts, each harder than the last; charged, a
   * long lunge. Its counter (the dash strike out of a dash that perfectly
   * dodged a blow) is a heavy lunge that carries her element. For elites and
   * armored enemies; weaker against a crowd.
   */
  duelist: aspect({
    name: "Duelist",
    description: "Three thrusts, each harder than the last. Charged: a long lunge. A counter right after a perfect dodge is a heavy lunge.",
    against: "Elites and armor; weaker against a crowd.",
    class: "blade",
    combo: [
      thrust({ reach: 175, width: 64, power: 20, knockback: 380, recovery: 0.22, hitStop: 0.06, heavy: false, lunge: 28 }),
      thrust({ reach: 180, width: 64, power: 28, knockback: 460, recovery: 0.26, hitStop: 0.07, heavy: false, lunge: 32 }),
      thrust({ reach: 195, width: 72, power: 44, knockback: 900, recovery: 0.5, hitStop: 0.12, heavy: true, lunge: 44 })
    ],
    charged: { chargeTime: 0.5, move: thrust({ reach: 260, width: 70, power: 60, knockback: 1000, recovery: 0.5, hitStop: 0.14, heavy: true, lunge: 160 }) },
    /** A heavy lunge out of the dash: the counter. */
    dash: thrust({ reach: 185, width: 64, power: 10, knockback: 620, recovery: 0.3, hitStop: 0.1, heavy: true, lunge: 90 }),
    magazine: null,
    chain: null,
    effects: [],
    infuse: counter()
  }),
  /**
   * Marksman (Gun): slow shots that pierce, three rounds; charged, a rail
   * shot through every enemy in a line. Its last round carries her element.
   * From afar, against enemies at range.
   */
  marksman: aspect({
    name: "Marksman",
    description: "Slow shots that pierce, three rounds. Charged: a rail shot through a whole line.",
    against: "Enemies at range, from afar.",
    class: "gun",
    combo: [
      shot({ count: 1, spreadDegrees: 0, speed: 1500, radius: 7, range: 820, pierce: 1, power: 34, knockback: 360, recovery: 0.3, hitStop: 0.05, heavy: false, lunge: -6 })
    ],
    charged: { chargeTime: 0.7, move: shot({ count: 1, spreadDegrees: 0, speed: 1900, radius: 9, range: 900, pierce: 12, power: 70, knockback: 520, recovery: 0.5, hitStop: 0.1, heavy: true, lunge: -20 }) },
    /** A piercing shot out of the dash. */
    dash: shot({ count: 1, spreadDegrees: 0, speed: 1500, radius: 7, range: 700, pierce: 2, power: 10, knockback: 300, recovery: 0.3, hitStop: 0.05, heavy: false, lunge: -10 }),
    magazine: { rounds: 3, reload: 1.1 },
    chain: null,
    effects: [],
    infuse: lastRound()
  }),
  /**
   * Riptide (Disc): the Ring's throws, bouncing on between enemies in a
   * state; the pair in a V carries her element. Feeds on states, hers or her
   * team's.
   */
  riptide: aspect({
    name: "Riptide",
    description: "Discs bounce on between enemies in a state.",
    against: "Enemies already in a state, from you or your team.",
    class: "disc",
    combo: [
      disc({ count: 1, spreadDegrees: 0, speed: 1250, radius: 15, range: 360, hover: 0, hoverTick: 0, bounces: 2, power: 8, knockback: 340, recovery: 0.2, hitStop: 0.04, heavy: false, lunge: 0 }),
      disc({ count: 1, spreadDegrees: 0, speed: 1250, radius: 15, range: 360, hover: 0, hoverTick: 0, bounces: 2, power: 8, knockback: 340, recovery: 0.2, hitStop: 0.04, heavy: false, lunge: 0 }),
      disc({ count: 2, spreadDegrees: 26, speed: 1300, radius: 15, range: 380, hover: 0, hoverTick: 0, bounces: 2, power: 7, knockback: 420, recovery: 0.38, hitStop: 0.05, heavy: false, lunge: -6 })
    ],
    charged: { chargeTime: 0.6, move: disc({ count: 1, spreadDegrees: 0, speed: 1100, radius: 22, range: 340, hover: 1.2, hoverTick: 0.2, power: 7, knockback: 30, recovery: 0.5, hitStop: 0.04, heavy: true, lunge: -12 }) },
    dash: disc({ count: 1, spreadDegrees: 0, speed: 1150, radius: 16, range: 280, hover: 0, hoverTick: 0, bounces: 2, power: 5, knockback: 320, recovery: 0.3, hitStop: 0.05, heavy: false, lunge: 0 }),
    magazine: null,
    chain: null,
    effects: [],
    infuse: combo(3)
  }),
  /**
   * Arc (Staff): the Spark's bolts, each jumping on to one more enemy
   * nearby with 60% of its damage; the pair in a V carries her element. For
   * spread-out groups.
   */
  arc: aspect({
    name: "Arc",
    description: "Bolts jump on to one more enemy nearby.",
    against: "Spread-out groups.",
    class: "staff",
    combo: [
      shot({ count: 1, spreadDegrees: 0, speed: 860, radius: 7, range: 560, pierce: 1, power: 12, knockback: 220, recovery: 0.16, hitStop: 0.03, heavy: false, lunge: 0 }),
      shot({ count: 1, spreadDegrees: 0, speed: 860, radius: 7, range: 560, pierce: 1, power: 12, knockback: 220, recovery: 0.16, hitStop: 0.03, heavy: false, lunge: 0 }),
      shot({ count: 2, spreadDegrees: 14, speed: 860, radius: 7, range: 520, pierce: 1, power: 11, knockback: 300, recovery: 0.32, hitStop: 0.045, heavy: false, lunge: -6 })
    ],
    charged: { chargeTime: 0.6, move: shot({ count: 1, spreadDegrees: 0, speed: 560, radius: 13, range: 640, pierce: 6, power: 32, knockback: 420, recovery: 0.45, hitStop: 0.1, heavy: true, lunge: -24 }) },
    dash: shot({ count: 1, spreadDegrees: 0, speed: 900, radius: 11, range: 460, pierce: 3, power: 10, knockback: 360, recovery: 0.3, hitStop: 0.06, heavy: false, lunge: -12 }),
    magazine: null,
    chain: { range: 150, share: 0.6 },
    effects: [],
    infuse: combo(3)
  }),
  /**
   * Gathering Edge (Blade): two slashes, then a spin that draws enemies in
   * instead of throwing them out, carrying her element; charged, a wide
   * sweep that draws in. Keeps a pack together for the next combo, and for a
   * teammate's skill.
   */
  gatheringEdge: aspect({
    name: "Gathering Edge",
    description: "Two slashes, then a spin that pulls enemies in toward you. Charged: a wide sweep that pulls in too.",
    against: "Packs: keeps them together for the next combo, or a teammate's skill.",
    class: "blade",
    combo: [
      arc({ reach: 120, arcDegrees: 140, power: 20, knockback: 420, recovery: 0.2, hitStop: 0.06, heavy: false, lunge: 16 }),
      arc({ reach: 120, arcDegrees: 140, power: 20, knockback: 420, recovery: 0.2, hitStop: 0.06, heavy: false, lunge: 16 }),
      spin({ reach: 165, power: 40, knockback: -380, recovery: 0.55, hitStop: 0.12, heavy: true, lunge: 6 })
    ],
    charged: { chargeTime: 0.6, move: arc({ reach: 175, arcDegrees: 240, power: 52, knockback: -380, recovery: 0.5, hitStop: 0.12, heavy: true, lunge: 20 }) },
    /** A wide slash out of the dash. */
    dash: arc({ reach: 130, arcDegrees: 160, power: 10, knockback: 450, recovery: 0.28, hitStop: 0.07, heavy: false, lunge: 60 }),
    magazine: null,
    chain: null,
    effects: [],
    infuse: finisher()
  }),
  /**
   * Scattergun (Gun): short, wide spreads that knock back, four rounds;
   * charged, a point-blank blast carrying her element. In the middle of the
   * pack.
   */
  scattergun: aspect({
    name: "Scattergun",
    description: "Short, wide spreads that knock back, four rounds. Charged: a point-blank blast.",
    against: "Fighting in the middle of the pack.",
    class: "gun",
    combo: [
      shot({ count: 5, spreadDegrees: 30, speed: 900, radius: 5, range: 300, pierce: 0, power: 7, knockback: 520, recovery: 0.16, hitStop: 0.03, heavy: false, lunge: -6 }),
      shot({ count: 5, spreadDegrees: 30, speed: 900, radius: 5, range: 300, pierce: 0, power: 7, knockback: 520, recovery: 0.16, hitStop: 0.03, heavy: false, lunge: -6 }),
      shot({ count: 7, spreadDegrees: 44, speed: 900, radius: 5, range: 280, pierce: 0, power: 5, knockback: 700, recovery: 0.3, hitStop: 0.05, heavy: false, lunge: -14 })
    ],
    charged: { chargeTime: 0.55, move: shot({ count: 9, spreadDegrees: 60, speed: 950, radius: 6, range: 220, pierce: 0, power: 7, knockback: 900, recovery: 0.45, hitStop: 0.1, heavy: true, lunge: -24 }) },
    /** A spread out of the dash. */
    dash: shot({ count: 5, spreadDegrees: 40, speed: 900, radius: 5, range: 280, pierce: 0, power: 2, knockback: 420, recovery: 0.3, hitStop: 0.04, heavy: false, lunge: -10 }),
    magazine: { rounds: 4, reload: 1.2 },
    chain: null,
    effects: [],
    infuse: power()
  }),
  /**
   * Whirlpool (Disc): every disc hovers a moment at the end of its throw;
   * charged, a disc that hovers long, drawing enemies in, carrying her
   * element. Her finisher pushes back what is around her. Holds ground.
   */
  whirlpool: aspect({
    name: "Whirlpool",
    description: "Every disc hovers a moment at the end of its throw. Charged: a disc that hovers long and pulls enemies in. The finisher pushes back what is around you.",
    against: "Holding ground.",
    class: "disc",
    combo: [
      disc({ count: 1, spreadDegrees: 0, speed: 1250, radius: 15, range: 340, hover: 0.3, hoverTick: 0.15, power: 8, knockback: 160, recovery: 0.2, hitStop: 0.04, heavy: false, lunge: 0 }),
      disc({ count: 1, spreadDegrees: 0, speed: 1250, radius: 15, range: 340, hover: 0.3, hoverTick: 0.15, power: 8, knockback: 160, recovery: 0.2, hitStop: 0.04, heavy: false, lunge: 0 }),
      disc({ count: 2, spreadDegrees: 26, speed: 1300, radius: 15, range: 360, hover: 0.3, hoverTick: 0.15, power: 7, knockback: 220, recovery: 0.38, hitStop: 0.05, heavy: false, lunge: -6 })
    ],
    charged: { chargeTime: 0.6, move: disc({ count: 1, spreadDegrees: 0, speed: 1050, radius: 26, range: 320, hover: 2, hoverTick: 0.25, power: 6, knockback: -140, recovery: 0.5, hitStop: 0.04, heavy: true, lunge: -12 }) },
    dash: disc({ count: 1, spreadDegrees: 0, speed: 1150, radius: 16, range: 280, hover: 0.3, hoverTick: 0.15, power: 5, knockback: 220, recovery: 0.3, hitStop: 0.05, heavy: false, lunge: 0 }),
    magazine: null,
    chain: null,
    effects: [{ move: finisher(), own: false, effect: nova({ radius: 130, power: 8, element: null, knockback: 700, active: 0.08, clearsProjectiles: false, hitStop: 0.02, heavy: false }) }],
    infuse: power()
  }),
  /**
   * Lightning Rod (Staff): the Spark's bolts; her charged attack also plants
   * a rod ahead of her that zaps the nearest enemy around it for a few
   * seconds, carrying her element. A place to fight from.
   */
  lightningRod: aspect({
    name: "Lightning Rod",
    description: "The charged attack also plants a rod ahead that zaps the nearest enemy for a few seconds.",
    against: "A place to fight from.",
    class: "staff",
    combo: [
      shot({ count: 1, spreadDegrees: 0, speed: 860, radius: 7, range: 560, pierce: 1, power: 12, knockback: 220, recovery: 0.16, hitStop: 0.03, heavy: false, lunge: 0 }),
      shot({ count: 1, spreadDegrees: 0, speed: 860, radius: 7, range: 560, pierce: 1, power: 12, knockback: 220, recovery: 0.16, hitStop: 0.03, heavy: false, lunge: 0 }),
      shot({ count: 2, spreadDegrees: 14, speed: 860, radius: 7, range: 520, pierce: 1, power: 11, knockback: 300, recovery: 0.32, hitStop: 0.045, heavy: false, lunge: -6 })
    ],
    charged: { chargeTime: 0.6, move: shot({ count: 1, spreadDegrees: 0, speed: 560, radius: 13, range: 640, pierce: 6, power: 32, knockback: 420, recovery: 0.45, hitStop: 0.1, heavy: true, lunge: -24 }) },
    dash: shot({ count: 1, spreadDegrees: 0, speed: 900, radius: 11, range: 460, pierce: 3, power: 10, knockback: 360, recovery: 0.3, hitStop: 0.06, heavy: false, lunge: -12 }),
    magazine: null,
    chain: null,
    effects: [{ move: power(), own: true, effect: totem({ offset: 70, seconds: 3, tick: 0.5, radius: 150, heal: 0, jumps: 0, repel: 0, power: 10, element: null, knockback: 40, hitStop: 0, heavy: false }) }],
    infuse: null
  }),
  /**
   * Flurry (Gauntlets): four quick light blows, then a heavier one carrying
   * her element; charged, a spinning burst of blows around her. More moves,
   * each lighter: for a crowd, and it feeds the dash often.
   */
  flurry: aspect({
    name: "Flurry",
    description: "Four quick light blows, then a heavier one. Charged: a spinning burst of blows all around you.",
    against: "A crowd up close.",
    class: "gauntlets",
    combo: [
      thrust({ reach: 90, width: 48, power: 10, knockback: 160, recovery: 0.1, hitStop: 0.03, heavy: false, lunge: 10 }),
      thrust({ reach: 90, width: 48, power: 10, knockback: 160, recovery: 0.1, hitStop: 0.03, heavy: false, lunge: 10 }),
      thrust({ reach: 90, width: 48, power: 10, knockback: 160, recovery: 0.1, hitStop: 0.03, heavy: false, lunge: 10 }),
      thrust({ reach: 90, width: 48, power: 10, knockback: 160, recovery: 0.1, hitStop: 0.03, heavy: false, lunge: 10 }),
      thrust({ reach: 105, width: 64, power: 24, knockback: 800, recovery: 0.36, hitStop: 0.09, heavy: true, lunge: 16 })
    ],
    charged: { chargeTime: 0.5, move: spin({ reach: 120, power: 45, knockback: 700, recovery: 0.45, hitStop: 0.1, heavy: true, lunge: 10 }) },
    /** A wide hook out of the dash. */
    dash: arc({ reach: 110, arcDegrees: 120, power: 10, knockback: 420, recovery: 0.22, hitStop: 0.05, heavy: false, lunge: 70 }),
    magazine: null,
    chain: null,
    effects: [],
    infuse: finisher()
  }),
  /**
   * Grapple (Gauntlets): two jabs, then a reaching grab that yanks what is
   * in a line ahead to her, carrying her element; charged, a slam where she
   * stands. Pulls a target out of its group into the next string.
   */
  grapple: aspect({
    name: "Grapple",
    description: "Two jabs, then a reaching grab that yanks enemies in a line to you. Charged: a slam where you stand.",
    against: "Picking one enemy out of its group.",
    class: "gauntlets",
    combo: [
      thrust({ reach: 95, width: 50, power: 14, knockback: 220, recovery: 0.14, hitStop: 0.04, heavy: false, lunge: 14 }),
      thrust({ reach: 95, width: 50, power: 14, knockback: 220, recovery: 0.14, hitStop: 0.04, heavy: false, lunge: 14 }),
      thrust({ reach: 200, width: 44, power: 30, knockback: -900, recovery: 0.45, hitStop: 0.1, heavy: true, lunge: 0 })
    ],
    charged: { chargeTime: 0.5, move: spin({ reach: 150, power: 50, knockback: 900, recovery: 0.5, hitStop: 0.12, heavy: true, lunge: 0 }) },
    /** A grab out of the dash, pulling what it catches in. */
    dash: thrust({ reach: 140, width: 50, power: 10, knockback: -500, recovery: 0.25, hitStop: 0.06, heavy: false, lunge: 60 }),
    magazine: null,
    chain: null,
    effects: [],
    infuse: finisher()
  }),
  /**
   * Furrow (Hammer): narrower blows, each landing farther down her aim than
   * the last, carrying her element on the last; charged, a blow landing
   * farthest. For a line of enemies, or one kept at a distance.
   */
  furrow: aspect({
    name: "Furrow",
    description: "Narrower blows, each landing farther down a line. Charged: a blow landing farthest.",
    against: "A line of enemies, or one kept at a distance.",
    class: "hammer",
    combo: [
      slam({ reach: 185, radius: 45, windup: 0.2, power: 21, knockback: 500, recovery: 0.52, hitStop: 0.08, heavy: false, lunge: 8 }),
      slam({ reach: 235, radius: 45, windup: 0.24, power: 46, knockback: 560, recovery: 0.7, hitStop: 0.09, heavy: false, lunge: 8 }),
      slam({ reach: 285, radius: 60, windup: 0.32, power: 90, knockback: 1050, recovery: 1.08, hitStop: 0.14, heavy: true, lunge: 10 })
    ],
    charged: { chargeTime: 0.7, move: slam({ reach: 320, radius: 75, windup: 0.16, power: 105, knockback: 1200, recovery: 0.9, hitStop: 0.16, heavy: true, lunge: 0 }) },
    /** A shoulder charge out of the dash. */
    dash: thrust({ reach: 110, width: 70, power: 10, knockback: 700, recovery: 0.3, hitStop: 0.07, heavy: false, lunge: 90 }),
    magazine: null,
    chain: null,
    effects: [],
    infuse: finisher()
  }),
  /**
   * Tremor (Hammer): short, wide blows right in front of her, carrying her
   * element on the last; charged, the widest. For a crowd pressing in.
   */
  tremor: aspect({
    name: "Tremor",
    description: "Short, wide blows right in front of you. Charged: the widest of them.",
    against: "A crowd pressing in close.",
    class: "hammer",
    combo: [
      slam({ reach: 150, radius: 80, windup: 0.18, power: 22, knockback: 480, recovery: 0.52, hitStop: 0.08, heavy: false, lunge: 0 }),
      slam({ reach: 150, radius: 85, windup: 0.2, power: 48, knockback: 540, recovery: 0.7, hitStop: 0.09, heavy: false, lunge: 0 }),
      slam({ reach: 170, radius: 105, windup: 0.28, power: 94, knockback: 1050, recovery: 1.08, hitStop: 0.14, heavy: true, lunge: 0 })
    ],
    charged: { chargeTime: 0.7, move: slam({ reach: 185, radius: 125, windup: 0.14, power: 105, knockback: 1150, recovery: 0.9, hitStop: 0.16, heavy: true, lunge: 0 }) },
    /** A spinning swing out of the dash. */
    dash: spin({ reach: 100, power: 10, knockback: 600, recovery: 0.3, hitStop: 0.07, heavy: false, lunge: 40 }),
    magazine: null,
    chain: null,
    effects: [],
    infuse: finisher()
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
    infuse: aspect?.infuse ?? null,
    dashFeed: handling.dashFeed,
    weave: handling.weave,
    shockwave: handling.shockwave
  }
}
