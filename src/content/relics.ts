/**
 * Relics: small additions to how a character plays (see docs/relics.md).
 * Each sits in one slot of hers (Strike: her blows; Dash: her dashes and
 * dodges; Element: her element's own trick; Survival: later), so a relic
 * only competes with the others of its slot. A relic changes what happens,
 * barely how much: its passives (see `content/passives.ts`) stay within the
 * budget `validateContent` holds them to. It comes in three tiers, each the
 * whole relic at that tier: a later tier keeps what the one before did and
 * adds something to see while playing. The account owns relics (at a tier);
 * a team equips each on one member at most. Numbers are live-tunable: they
 * are part of the `Tuning` resource.
 */
import type { ElementId } from "./elements.ts"
import {
  always,
  breaking,
  cast,
  castOwn,
  counter,
  damageBonus,
  damageTaken,
  dashBack,
  dashing,
  doing,
  finisher,
  heal,
  kill,
  leave,
  on,
  perfectDodge,
  power,
  secondWind,
  targetHeld,
  targetInState,
  trait,
  wielderHealthBelow,
  withMove
} from "./passives.ts"
import type { Passive } from "./passives.ts"
import { cut, earthrise, nova, thunderclap, vortex } from "./skills.ts"
import type { NovaEffect, VortexEffect } from "./skills.ts"

/** A character's relic slots: one relic each. Survival opens later in the main line (see `relicRules`). */
export const relicSlots = ["strike", "dash", "element", "survival"] as const
export type RelicSlot = (typeof relicSlots)[number]

/** A relic's tiers: a duplicate raises it, up to the last. */
export const relicTiers = [1, 2, 3] as const
export type RelicTier = (typeof relicTiers)[number]

export interface RelicTierSpec {
  /** What this tier adds, in a sentence (the first tier: what the relic does). */
  readonly adds: string
  /** The whole relic at this tier. */
  readonly passives: ReadonlyArray<Passive>
}

export interface RelicSpec {
  /** Shown in menus. */
  readonly name: string
  readonly slot: RelicSlot
  /** An Element relic's element: only characters of it equip it, and it names it in what it does; `null` for every other slot. */
  readonly element: ElementId | null
  /** What it is about, in a few words. */
  readonly about: string
  readonly tiers: { readonly [Tier in RelicTier]: RelicTierSpec }
}

const relic = (spec: RelicSpec): RelicSpec => spec

/** A ring around a spot that throws enemies back, carrying no element (or hers, cast with `castOwn`). */
const ring = (extra: Partial<Omit<NovaEffect, "kind">> = {}): NovaEffect =>
  nova({ radius: 120, power: 6, element: null, knockback: 600, active: 0.08, clearsProjectiles: false, hitStop: 0.02, heavy: false, ...extra })

/** A whirl set down on a spot for a moment, pulling enemies in. */
const whirl = (extra: Partial<Omit<VortexEffect, "kind">> = {}): VortexEffect =>
  vortex({ maxRange: 0, radius: 140, seconds: 1.2, tick: 0.2, pull: 0.25, power: 0, element: null, knockback: 0, hitStop: 0, heavy: false, ...extra })

/** The counter's slash: a short cut straight ahead. */
const counterSlash = cut({ length: 240, width: 50, power: 10, element: null, knockback: 300, leaves: null, active: 0.08, hitStop: 0.04, heavy: false })

const flare = ring({ radius: 110, element: "fire", knockback: 250 })
const splash = ring({ radius: 120, power: 4, element: "water", knockback: 300 })
const gust = ring({ radius: 140, power: 4, element: "wind", knockback: 800 })
const clap = thunderclap({ radius: 220, strikes: 2, jumps: 0, heal: 0, stun: 0, breakFill: 0, power: 8, element: "thunder", knockback: 100, hitStop: 0.02, heavy: false })
const rise = earthrise({ radius: 60, rocks: 1, warning: 0.25, interval: 0.1, size: 70, ring: 90, stun: 0.5, breakFill: 0, power: 10, element: "rock", knockback: 300, hitStop: 0.04, heavy: false })

/** Every relic, by id. */
export const relics = {
  // ── Strike: her blows ───────────────────────────────────────────────────

  /** Feeds on enemies others have set up: states, then stuns and breaks, then kills among them. */
  opportunist: relic({
    name: "Opportunist",
    slot: "strike",
    element: null,
    about: "Enemies set up by the team.",
    tiers: {
      1: { adds: "Blows deal 15% more to enemies in a state.", passives: [damageBonus(15, targetInState())] },
      2: { adds: "And 15% more to stunned or broken enemies.", passives: [damageBonus(15, targetInState()), damageBonus(15, targetHeld())] },
      3: {
        adds: "Killing an enemy in a state sends out a ring where it falls, throwing the others back.",
        passives: [damageBonus(15, targetInState()), damageBonus(15, targetHeld()), on(kill("any"), cast(ring(), "there"), 1)]
      }
    }
  }),
  /** The end of a combo clears room: a ring that throws enemies back. */
  echo: relic({
    name: "Echo",
    slot: "strike",
    element: null,
    about: "Room to breathe after a combo.",
    tiers: {
      1: { adds: "The last move of your combo sends out a ring that throws enemies back.", passives: [on(doing(finisher()), cast(ring()), 0.8)] },
      2: { adds: "Your charged attack sends it out too.", passives: [on(doing(finisher()), cast(ring()), 0.8), on(doing(power()), cast(ring()), 0.8)] },
      3: { adds: "The ring carries your element.", passives: [on(doing(finisher()), castOwn(ring()), 0.8), on(doing(power()), castOwn(ring()), 0.8)] }
    }
  }),
  /** Rewards reading an attack: the counter (the dash strike right after a perfect dodge) hits harder, then reaches further. */
  counterpoint: relic({
    name: "Counterpoint",
    slot: "strike",
    element: null,
    about: "Striking back out of a perfect dodge.",
    tiers: {
      1: { adds: "Your counter (the dash strike right after a perfect dodge) deals 30% more.", passives: [damageBonus(30, withMove(counter()))] },
      2: { adds: "The counter also sends a slash straight ahead.", passives: [damageBonus(30, withMove(counter())), on(doing(counter()), cast(counterSlash), 0.5)] },
      3: { adds: "The slash carries your element.", passives: [damageBonus(30, withMove(counter())), on(doing(counter()), castOwn(counterSlash), 0.5)] }
    }
  }),

  /** A trade-off: every blow hits harder, and so does every blow on her. */
  glassEdge: relic({
    name: "Glass Edge",
    slot: "strike",
    element: null,
    about: "Hitting harder, at a price.",
    tiers: {
      1: { adds: "Your blows deal 20% more; blows on you deal 20% more too.", passives: [damageBonus(20, always()), damageTaken(20)] },
      2: { adds: "And 15% more to stunned or broken enemies.", passives: [damageBonus(20, always()), damageTaken(20), damageBonus(15, targetHeld())] },
      3: {
        adds: "Killing an enemy in a state sends out a ring where it falls, throwing the others back.",
        passives: [damageBonus(20, always()), damageTaken(20), damageBonus(15, targetHeld()), on(kill("any"), cast(ring(), "there"), 1)]
      }
    }
  }),
  /** Hurt, she hits harder: a reason to stay in the fight rather than back off. */
  lastStand: relic({
    name: "Last Stand",
    slot: "strike",
    element: null,
    about: "Fighting on when hurt.",
    tiers: {
      1: { adds: "Below half your health, your blows deal 25% more.", passives: [damageBonus(25, wielderHealthBelow(0.5))] },
      2: { adds: "Below a quarter, 15% more on top.", passives: [damageBonus(25, wielderHealthBelow(0.5)), damageBonus(15, wielderHealthBelow(0.25))] },
      3: { adds: "A kill gives a dash back, at most once every 4 seconds.", passives: [damageBonus(25, wielderHealthBelow(0.5)), damageBonus(15, wielderHealthBelow(0.25)), on(kill(), dashBack(), 4)] }
    }
  }),
  /** A trade-off: her ultimate comes sooner, and blows on her hurt more. */
  overflow: relic({
    name: "Overflow",
    slot: "strike",
    element: null,
    about: "Ultimates sooner, at a price.",
    tiers: {
      1: { adds: "You gain 25% more energy; blows on you deal 15% more.", passives: [trait({ energy: 1.25 }), damageTaken(15)] },
      2: { adds: "15% more energy on top.", passives: [trait({ energy: 1.25 }), damageTaken(15), trait({ energy: 1.15 })] },
      3: { adds: "10% more energy on top.", passives: [trait({ energy: 1.25 }), damageTaken(15), trait({ energy: 1.15 }), trait({ energy: 1.1 })] }
    }
  }),

  // ── Dash: her dashes and dodges ─────────────────────────────────────────

  /** A dash out of a crowd pushes it away. */
  repel: relic({
    name: "Repel",
    slot: "dash",
    element: null,
    about: "Getting out of a crowd.",
    tiers: {
      1: { adds: "Dashing throws back enemies around where you dashed from.", passives: [on(dashing(), cast(ring({ radius: 110, power: 4, knockback: 650 }), "there"), 1.2)] },
      2: { adds: "The push also clears enemy shots around you.", passives: [on(dashing(), cast(ring({ radius: 110, power: 4, knockback: 650, clearsProjectiles: true }), "there"), 1.2)] },
      3: { adds: "The push carries your element.", passives: [on(dashing(), castOwn(ring({ radius: 110, power: 4, knockback: 650, clearsProjectiles: true }), "there"), 1.2)] }
    }
  }),
  /** Kills (then breaks) give a dash back: keep moving through a fight. */
  momentum: relic({
    name: "Momentum",
    slot: "dash",
    element: null,
    about: "Moving through a fight.",
    tiers: {
      1: { adds: "A kill gives a dash back, at most once every 5 seconds.", passives: [on(kill(), dashBack(), 5)] },
      2: { adds: "Breaking an enemy gives one back too.", passives: [on(kill(), dashBack(), 5), on(breaking(), dashBack(), 5)] },
      3: { adds: "A kill gives one back every 3 seconds.", passives: [on(kill(), dashBack(), 3), on(breaking(), dashBack(), 5)] }
    }
  }),
  /** A perfect dodge leaves a whirl where you stood, pulling enemies into the spot she left. */
  afterimage: relic({
    name: "Afterimage",
    slot: "dash",
    element: null,
    about: "Turning a perfect dodge into an opening.",
    tiers: {
      1: { adds: "A perfect dodge leaves a whirl where you stood, pulling enemies in for a moment.", passives: [on(perfectDodge(), cast(whirl(), "there"))] },
      2: { adds: "The whirl strikes what it pulls.", passives: [on(perfectDodge(), cast(whirl({ power: 3 }), "there"))] },
      3: { adds: "The whirl carries your element.", passives: [on(perfectDodge(), castOwn(whirl({ power: 3 }), "there"))] }
    }
  }),

  /** A trade-off: more dashes, each shorter. */
  featherstep: relic({
    name: "Featherstep",
    slot: "dash",
    element: null,
    about: "Many short dashes.",
    tiers: {
      1: { adds: "One dash more, each 25% shorter.", passives: [trait({ dashCharges: 1, dashDistance: 0.75 })] },
      2: { adds: "Dashes come back 10% faster.", passives: [trait({ dashCharges: 1, dashDistance: 0.75 }), trait({ dashCooldown: 0.9 })] },
      3: { adds: "A perfect dodge sends out a ring where you stood, throwing enemies back.", passives: [trait({ dashCharges: 1, dashDistance: 0.75 }), trait({ dashCooldown: 0.9 }), on(perfectDodge(), cast(ring(), "there"))] }
    }
  }),
  /** A trade-off: she stands her ground, and dashes less often. */
  anchor: relic({
    name: "Anchor",
    slot: "dash",
    element: null,
    about: "Standing your ground.",
    tiers: {
      1: { adds: "You are 80% heavier (pushed less far); dashes come back 30% slower.", passives: [trait({ weight: 1.8, dashCooldown: 1.3 })] },
      2: { adds: "Blows on you deal 10% less.", passives: [trait({ weight: 1.8, dashCooldown: 1.3 }), damageTaken(-10)] },
      3: {
        adds: "A perfect dodge stamps the ground where you stood, throwing enemies far back.",
        passives: [trait({ weight: 1.8, dashCooldown: 1.3 }), damageTaken(-10), on(perfectDodge(), cast(ring({ radius: 140, power: 8, knockback: 900 }), "there"))]
      }
    }
  }),

  // ── Element: each element's own trick ───────────────────────────────────

  /** Fire: burning enemies she kills burst into flame, spreading the fire. */
  emberHeart: relic({
    name: "Ember Heart",
    slot: "element",
    element: "fire",
    about: "Fire that spreads from what falls.",
    tiers: {
      1: { adds: "Burning enemies you defeat burst into flame, setting those around them burning.", passives: [on(kill("burning"), cast(flare, "there"), 0.5)] },
      2: { adds: "The burst leaves fire on the ground.", passives: [on(kill("burning"), cast(flare, "there"), 0.5), on(kill("burning"), leave({ element: "fire", radius: 60, seconds: 3 }), 0.5)] },
      3: {
        adds: "A perfect dodge bursts into flame where you stood.",
        passives: [on(kill("burning"), cast(flare, "there"), 0.5), on(kill("burning"), leave({ element: "fire", radius: 60, seconds: 3 }), 0.5), on(perfectDodge(), cast(flare, "there"))]
      }
    }
  }),
  /** Water: her dashes leave puddles, and soaked enemies splash. */
  undertow: relic({
    name: "Undertow",
    slot: "element",
    element: "water",
    about: "Puddles wherever you move.",
    tiers: {
      1: { adds: "Dashing leaves a puddle where you dashed from.", passives: [on(dashing(), leave({ element: "water", radius: 70, seconds: 4 }), 1)] },
      2: { adds: "Soaked enemies you defeat splash, soaking those around them.", passives: [on(dashing(), leave({ element: "water", radius: 70, seconds: 4 }), 1), on(kill("soaked"), cast(splash, "there"), 0.5)] },
      3: {
        adds: "A perfect dodge leaves a whirlpool where you stood, pulling enemies in.",
        passives: [
          on(dashing(), leave({ element: "water", radius: 70, seconds: 4 }), 1),
          on(kill("soaked"), cast(splash, "there"), 0.5),
          on(perfectDodge(), cast(whirl({ power: 3, element: "water", seconds: 1.5, pull: 0.3 }), "there"))
        ]
      }
    }
  }),
  /** Wind: gusts out of her dodges, and swept enemies that fall draw the others in. */
  tailwind: relic({
    name: "Tailwind",
    slot: "element",
    element: "wind",
    about: "Gusts that scatter, whirls that gather.",
    tiers: {
      1: { adds: "A perfect dodge throws a gust around where you stood, sweeping enemies away.", passives: [on(perfectDodge(), cast(gust, "there"))] },
      2: { adds: "Swept enemies you defeat leave a whirl, drawing those around them in.", passives: [on(perfectDodge(), cast(gust, "there")), on(kill("swept"), cast(whirl({ power: 2, element: "wind" }), "there"), 1)] },
      3: {
        adds: "Dashing throws a smaller gust too.",
        passives: [on(perfectDodge(), cast(gust, "there")), on(kill("swept"), cast(whirl({ power: 2, element: "wind" }), "there"), 1), on(dashing(), cast(ring({ radius: 100, power: 2, element: "wind", knockback: 500 }), "there"), 2)]
      }
    }
  }),
  /** Thunder: charged enemies that fall discharge into the nearest others. */
  staticCharge: relic({
    name: "Static Charge",
    slot: "element",
    element: "thunder",
    about: "Thunder passed on from what falls.",
    tiers: {
      1: { adds: "Charged enemies you defeat discharge, striking the two nearest others.", passives: [on(kill("charged"), cast(clap, "there"), 0.5)] },
      2: { adds: "Each strike jumps on to one more enemy.", passives: [on(kill("charged"), cast({ ...clap, jumps: 1 }, "there"), 0.5)] },
      3: {
        adds: "Breaking an enemy discharges too, stunning the three nearest others.",
        passives: [on(kill("charged"), cast({ ...clap, jumps: 1 }, "there"), 0.5), on(breaking(), cast({ ...clap, strikes: 3, jumps: 1, stun: 0.6 }, "there"))]
      }
    }
  }),
  /** Rock: breaking an enemy raises stone around it. */
  bedrock: relic({
    name: "Bedrock",
    slot: "element",
    element: "rock",
    about: "Stone from every break.",
    tiers: {
      1: { adds: "Breaking an enemy raises a rock beside it, striking and stunning what it hits.", passives: [on(breaking(), cast(rise, "there"))] },
      2: { adds: "Cracked enemies you defeat shatter, cracking those around them.", passives: [on(breaking(), cast(rise, "there")), on(kill("cracked"), cast(ring({ radius: 120, power: 5, element: "rock", knockback: 300 }), "there"), 0.5)] },
      3: {
        adds: "A break raises three rocks.",
        passives: [on(breaking(), cast({ ...rise, rocks: 3, radius: 160 }, "there")), on(kill("cracked"), cast(ring({ radius: 120, power: 5, element: "rock", knockback: 300 }), "there"), 0.5)]
      }
    }
  }),

  // ── Survival: staying up (healing is this slot's alone) ─────────────────

  /** Once a run, a blow that would fell her leaves her standing. */
  secondWind: relic({
    name: "Second Wind",
    slot: "survival",
    element: null,
    about: "One more chance.",
    tiers: {
      1: { adds: "Once a run, a blow that would fell you leaves you at 20% health, untouchable a moment.", passives: [secondWind(20)] },
      2: { adds: "A perfect dodge heals 2%, at most once every 3 seconds.", passives: [secondWind(20), on(perfectDodge(), heal(2), 3)] },
      3: { adds: "The second wind leaves you at 40% health.", passives: [secondWind(20), on(perfectDodge(), heal(2), 3), secondWind(40)] }
    }
  }),
  /** Healing by playing well: perfect dodges, then kills. */
  mendingStep: relic({
    name: "Mending Step",
    slot: "survival",
    element: null,
    about: "Healing by dodging well.",
    tiers: {
      1: { adds: "A perfect dodge heals 3%, at most once every 2 seconds.", passives: [on(perfectDodge(), heal(3), 2)] },
      2: { adds: "A kill heals 1%, at most once a second.", passives: [on(perfectDodge(), heal(3), 2), on(kill(), heal(1), 1)] },
      3: { adds: "A perfect dodge heals 2% more.", passives: [on(perfectDodge(), heal(3), 2), on(kill(), heal(1), 1), on(perfectDodge(), heal(2), 2)] }
    }
  })
} satisfies { readonly [id: string]: RelicSpec }

export type RelicId = keyof typeof relics

/** The relic `id` in `all` (the tuning's relics). */
export const relicOf = (all: { readonly [Id in RelicId]: RelicSpec }, id: RelicId): RelicSpec => (all as Readonly<Record<string, RelicSpec>>)[id]!

/** A relic equipped, at the tier the account owns it at. */
export interface EquippedRelic {
  readonly id: RelicId
  readonly tier: RelicTier
}

/**
 * The budget every relic keeps to at every tier (see docs/relics.md): a
 * relic changes what happens, barely how much. `worth`: the most a tier is
 * worth (`relicWorth`: its damage bonuses by how often they hold, less what
 * its costs take, and its trait changes), so a trade-off may give more
 * because it costs something; `damageBonus`: the most its bonuses add up to
 * all the same; `power`: the most any effect it sets off deals (percent of
 * ATK); `every`: the least time between two effects set off by something she
 * does often (a kill, a move, a dash), so nothing fires every blow; `heal`:
 * the most a heal gives (percent of her health), the Survival slot's.
 */
export const relicBudget = { worth: 20, damageBonus: 40, power: 12, every: 0.5, heal: 5 } as const

/**
 * How relics are had (see docs/relics.md): they open with the Spirit Call
 * (`opensAfter`, a quest id); the Survival slot later (`survivalOpensAfter`,
 * `null` until it has relics). Each relic is unlocked at tier I by one
 * quest's perfect clear at one rank (`QuestSpec.relic`); its next tiers
 * are bought in the shop for `prices[tier]` dust (the tier it reaches).
 * Every other quest's perfect clear, at each rank, pays `perfectDust`
 * once: `base` plus `perLevel` for each enemy level, rounded to tens.
 */
export interface RelicRules {
  readonly opensAfter: string
  readonly survivalOpensAfter: string | null
  readonly prices: { readonly [Tier in Exclude<RelicTier, 1>]: number }
  readonly perfectDust: { readonly base: number; readonly perLevel: number }
}

export const relicRules: RelicRules = {
  opensAfter: "packLeader",
  survivalOpensAfter: "bruteKing",
  // Every relic maxed costs about what the whole game pays in dust (see `pnpm calls`): the last tiers come with the last ranks.
  prices: { 2: 400, 3: 800 },
  perfectDust: { base: 20, perLevel: 2.5 }
}

/** The dust a perfect clear pays at `enemyLevel` (see `RelicRules.perfectDust`). */
export const perfectDustAt = (rules: RelicRules, enemyLevel: number): number => 10 * Math.round((rules.perfectDust.base + rules.perfectDust.perLevel * enemyLevel) / 10)
