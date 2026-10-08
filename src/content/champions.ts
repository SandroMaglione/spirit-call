/**
 * Champions' own movesets (see docs/enemies.md, "Champions"): a champion of
 * a kind listed here fights with these attacks instead of its kind's. It
 * reads what the player does (an attack's `read` is picked first while she
 * does it: a charge at a player backing away, a bomb over the wall she
 * hides behind), and fights in phases by its health: each phase begins with
 * its opening attack (a roar, its shockwave pushing the team back) and
 * brings new attacks and shorter rests. Worn down to too little support,
 * it calls for help. The patterns champions share (the roars, the call for
 * help) come from content/patterns.ts. Every attack keeps the fairness
 * floor (see `fairness`), and the model is its kind's: what changes is how
 * it fights, never what it looks like.
 *
 * A kind without one here fights as a champion with its kind's moveset.
 */
import { blink, charge, lob, melee, slam, wave } from "./enemies.ts"
import type { AttackSpec, Behavior, EnemyKind } from "./enemies.ts"
import { callForHelp, roars } from "./patterns.ts"

/** A phase after the first: it begins once the champion's health is at or under `below` (a share of its max). */
export interface ChampionPhase {
  readonly below: number
  /** Its wait between attacks, as a share of the champion's own (see `restOf`). */
  readonly rest: number
}

export interface ChampionMoveset {
  /** How it moves, when not as its kind does (a skirmisher's champion presses in rather than circling for its turn). */
  readonly behavior?: Behavior
  /** Its health, as a multiple of a champion's (see `championPower`): the fight is long enough to go through its phases. */
  readonly health: number
  /** Its phases after the first, from the highest health down. */
  readonly phases: ReadonlyArray<ChampionPhase>
  readonly attacks: ReadonlyArray<AttackSpec>
}

/** The floor a champion's slam leaves burning in its later phases: brief, so the fight moves rather than ends cornered. */
const burning = { element: "fire", radius: 75, seconds: 3 } as const

export const championMovesets: Partial<Record<EnemyKind, ChampionMoveset>> = {
  /**
   * The Pack Leader (chapter one's): a first taste, one later phase. It
   * presses in and rakes in strings of swipes, pounces down a lane at a
   * player backing away, snaps all around when struck again and again, and
   * calls two chasers. At 50% it howls and its swipes come in flurries,
   * its pounces twice.
   */
  chaser: {
    health: 2.7,
    behavior: { kind: "chase", stopDistance: 70 },
    phases: [{ below: 0.5, rest: 0.85 }],
    attacks: [
      melee("swipe", { triggerRange: 95, reach: 100, arcDegrees: 100, windup: 0.45, aimLock: 0.3, active: 0.1, recovery: 0.25, cooldown: 1, power: 18, knockback: 200, followUp: ["slash", "rakeEnd"] }),
      melee("slash", { weight: 0, triggerRange: 130, reach: 125, arcDegrees: 120, windup: 0.4, aimLock: 0.3, active: 0.1, recovery: 0.25, cooldown: 1, power: 14, knockback: 240, followUp: ["rakeEnd", "frenzy"] }),
      melee("rakeEnd", { weight: 0, triggerRange: 140, reach: 125, arcDegrees: 200, windup: 0.5, aimLock: 0.3, active: 0.1, recovery: 1, cooldown: 0.9, power: 16, knockback: 380 }),
      charge("pounce", {
        read: "away", minRange: 180, triggerRange: 460, windup: 0.65, aimLock: 0.35, active: 0.35, speed: 720, width: 60, recovery: 0.9, cooldown: 1.2,
        power: 18, knockback: 380, lead: 0.3, followUp: "pounceEnd"
      }),
      melee("snap", { read: "pressed", weight: 3, triggerRange: 140, reach: 120, arcDegrees: 360, windup: 0.35, aimLock: 0.35, active: 0.1, recovery: 0.2, cooldown: 0.9, power: 10, knockback: 560, followUp: "rakeEnd" }),

      // At 50%: flurries, and a second pounce.
      melee("frenzy", { phase: 1, weight: 1.5, triggerRange: 95, reach: 100, arcDegrees: 100, windup: 0.35, aimLock: 0.3, active: 0.1, recovery: 0.2, cooldown: 1, power: 16, knockback: 150, followUp: "frenzyAgain" }),
      melee("frenzyAgain", { phase: 1, weight: 0, triggerRange: 140, reach: 110, arcDegrees: 110, windup: 0.35, aimLock: 0.3, active: 0.1, recovery: 0.2, cooldown: 1, power: 16, knockback: 150, followUp: ["rakeEnd", "pounceEnd"] }),
      charge("pounceEnd", { phase: 1, weight: 0, triggerRange: 600, windup: 0.5, aimLock: 0.35, active: 0.35, speed: 720, width: 60, recovery: 1, cooldown: 1.2, power: 18, knockback: 380, lead: 0.3 }),

      ...roars({ phases: 1, reach: 360 }),
      ...callForHelp({ calls: ["chaser", "chaser"] })
    ]
  },

  /**
   * The Bulwark (chapter two's): swipes into thrusts, a shield charge down a
   * lane at a player backing away, a bash all around when pressed, and two
   * of the line called in. At 50% it roars, thrusts three times running,
   * and sends a shockwave off its shield.
   */
  guardian: {
    health: 1.1,
    behavior: { kind: "chase", stopDistance: 80 },
    phases: [{ below: 0.5, rest: 0.85 }],
    attacks: [
      melee("swipe", { triggerRange: 100, reach: 105, arcDegrees: 110, windup: 0.6, aimLock: 0.35, active: 0.1, recovery: 0.25, cooldown: 1, power: 16, knockback: 300, followUp: ["thrust", "sweepEnd"] }),
      melee("thrust", { minRange: 85, triggerRange: 160, reach: 170, arcDegrees: 24, windup: 0.65, aimLock: 0.3, active: 0.1, recovery: 0.3, cooldown: 1, power: 18, knockback: 380, lead: 0.3, followUp: ["sweepEnd", "thrustEnd"] }),
      melee("thrustEnd", { weight: 0, triggerRange: 190, reach: 180, arcDegrees: 24, windup: 0.5, aimLock: 0.3, active: 0.1, recovery: 1.1, cooldown: 0.9, power: 20, knockback: 420, lead: 0.4 }),
      melee("sweepEnd", { weight: 0, triggerRange: 130, reach: 120, arcDegrees: 160, windup: 0.55, aimLock: 0.35, active: 0.1, recovery: 1.1, cooldown: 0.9, power: 18, knockback: 420 }),
      charge("lance", {
        read: "away", minRange: 200, triggerRange: 520, windup: 0.8, aimLock: 0.4, active: 0.45, speed: 620, width: 70, recovery: 1.1, cooldown: 1.3,
        power: 22, knockback: 480, lead: 0.3
      }),
      melee("bash", { read: "pressed", weight: 3, triggerRange: 150, reach: 125, arcDegrees: 360, windup: 0.35, aimLock: 0.35, active: 0.1, recovery: 0.2, cooldown: 0.9, power: 10, knockback: 650, followUp: "thrustEnd" }),

      // At 50%: three thrusts running, each aimed anew, and a shockwave off its shield.
      melee("pierce", { phase: 1, weight: 1.5, minRange: 85, triggerRange: 160, reach: 170, arcDegrees: 24, windup: 0.55, aimLock: 0.3, active: 0.1, recovery: 0.2, cooldown: 1, power: 16, knockback: 200, lead: 0.4, followUp: "pierceAgain" }),
      melee("pierceAgain", { phase: 1, weight: 0, triggerRange: 200, reach: 180, arcDegrees: 24, windup: 0.45, aimLock: 0.3, active: 0.1, recovery: 0.2, cooldown: 1, power: 16, knockback: 200, lead: 0.5, followUp: "thrustEnd" }),
      wave("shieldWave", { phase: 1, triggerRange: 260, reach: 280, speed: 480, width: 44, windup: 0.8, recovery: 0.3, cooldown: 1.3, power: 16, knockback: 450, followUp: ["thrustEnd", "sweepEnd"] }),

      ...roars({ phases: 1, reach: 380 }),
      ...callForHelp({ calls: ["swarmer", "chaser"] })
    ]
  },

  /**
   * The Brute King. It fights in strings: a few blows with short gaps
   * between them, each the next one picked by what the player does, and one
   * real opening, at the string's end. Struck again and again, it answers
   * with a quick shove and a slam where she lands; backing away draws a
   * charge down a lane, hiding behind a wall a burning rock heaved over it;
   * worn down to too little support, it calls for help. Its quick smash and
   * its slam look alike: only its body tells them apart.
   *
   * At 60% it roars (a shockwave), slams twice in a row, sends shockwaves
   * out along the floor, holds a slam up long before it falls, and its
   * slams leave the floor burning. At 25% it roars twice, charges again and
   * again, its shockwaves come in pairs, and it calls more help.
   */
  brute: {
    health: 1,
    phases: [{ below: 0.6, rest: 0.85 }, { below: 0.25, rest: 0.7 }],
    attacks: [
      // Its strings. A blow in the middle of one recovers quickly; the last, slowly: the opening.
      slam("slam", {
        minRange: 120, triggerRange: 280, maxReach: 220, radius: 105, windup: 1, aimLock: 0.45, active: 0.12, recovery: 0.3, cooldown: 1, power: 30, knockback: 420, lead: 0.4,
        followUp: ["smash", "stompEnd", "hammer", "crushAgain"]
      }),
      slam("stomp", { triggerRange: 140, maxReach: 0, radius: 140, windup: 0.75, active: 0.12, recovery: 0.3, cooldown: 1, power: 22, knockback: 480, followUp: ["smashEnd", "quakeEnd"] }),
      // Quick, and looking like the slam: read its body, not the warning.
      slam("smash", { weight: 0, triggerRange: 300, maxReach: 220, radius: 95, windup: 0.55, aimLock: 0.35, active: 0.12, recovery: 0.3, cooldown: 1, power: 26, knockback: 420, lead: 0.5, followUp: ["smashEnd", "stompEnd", "quakeEnd"] }),
      slam("smashEnd", { weight: 0, triggerRange: 320, maxReach: 220, radius: 95, windup: 0.55, aimLock: 0.35, active: 0.12, recovery: 1.2, cooldown: 0.9, power: 26, knockback: 460, lead: 0.5 }),
      slam("stompEnd", { weight: 0, triggerRange: 160, maxReach: 0, radius: 145, windup: 0.6, active: 0.12, recovery: 1.1, cooldown: 0.9, power: 22, knockback: 520 }),
      // Struck again and again, it answers at once: a quick shove all around, then a slam where she lands.
      slam("shove", { read: "pressed", weight: 3, triggerRange: 200, maxReach: 0, radius: 150, windup: 0.4, active: 0.1, recovery: 0.2, cooldown: 0.9, power: 14, knockback: 700, followUp: "smashEnd" }),
      // Backing away is no escape: it charges down a lane at her, then stands winded at its end.
      charge("rush", {
        read: "away", minRange: 220, triggerRange: 560, windup: 0.85, aimLock: 0.4, active: 0.5, speed: 640, width: 84, recovery: 1.1, cooldown: 1.4,
        power: 26, knockback: 520, lead: 0.3
      }),
      // Nor is a wall: it heaves a burning rock over it, where she hides.
      lob("heave", {
        read: "covered", minRange: 160, triggerRange: 640, maxReach: 640, radius: 90, windup: 0.9, aimLock: 0.4, active: 0, recovery: 0.7, cooldown: 1.6,
        flightTime: 0.75, fuse: 0.3, power: 24, knockback: 400, element: "fire", lead: 0.3, leaves: { element: "fire", radius: 70, seconds: 2.5 }
      }),

      // Its second phase, at 60%: its slams leave the floor burning.
      slam("crush", {
        phase: 1, minRange: 120, triggerRange: 280, maxReach: 220, radius: 105, windup: 0.95, aimLock: 0.45, active: 0.12, recovery: 0.25, cooldown: 1.1, power: 28, knockback: 300, lead: 0.4,
        leaves: burning, followUp: "crushAgain"
      }),
      // The second slam aims anew, further ahead of a runner.
      slam("crushAgain", {
        phase: 1, weight: 0, triggerRange: 340, maxReach: 260, radius: 110, windup: 0.7, aimLock: 0.35, active: 0.12, recovery: 0.3, cooldown: 1.1, power: 30, knockback: 480, lead: 0.6,
        leaves: burning, followUp: ["quakeEnd", "smashEnd"]
      }),
      // Close by, a shockwave out along the floor: out of its reach, or dash through it.
      wave("quake", { phase: 1, triggerRange: 300, reach: 330, speed: 520, width: 46, windup: 0.9, recovery: 0.3, cooldown: 1.4, power: 20, knockback: 480, followUp: ["smashEnd", "stompEnd"] }),
      wave("quakeEnd", { phase: 1, weight: 0, triggerRange: 2000, reach: 330, speed: 520, width: 46, windup: 0.7, recovery: 1.1, cooldown: 1.2, power: 20, knockback: 480 }),
      // Held up long, tracking her: a dodge made as it is raised is spent before it falls.
      slam("hammer", { phase: 1, weight: 0.7, minRange: 100, triggerRange: 260, maxReach: 200, radius: 100, windup: 1.6, aimLock: 0.4, active: 0.12, recovery: 0.3, cooldown: 1.1, power: 34, knockback: 500, leaves: burning, followUp: ["stompEnd", "smashEnd"] }),

      // Its last phase, at 25%: charges again and again, each aimed anew, then stomps where it stops.
      charge("rampage", {
        phase: 2, weight: 2, read: "away", minRange: 200, triggerRange: 560, windup: 0.8, aimLock: 0.4, active: 0.45, speed: 680, width: 84, recovery: 0.2, cooldown: 1.2,
        power: 24, knockback: 480, lead: 0.3, followUp: "rampageAgain"
      }),
      charge("rampageAgain", {
        phase: 2, weight: 0, triggerRange: 900, windup: 0.6, aimLock: 0.35, active: 0.45, speed: 680, width: 84, recovery: 0.2, cooldown: 1.2,
        power: 24, knockback: 480, lead: 0.3, followUp: "trample"
      }),
      slam("trample", { phase: 2, weight: 0, triggerRange: 2000, maxReach: 0, radius: 150, windup: 0.6, active: 0.12, recovery: 1.2, cooldown: 1.2, power: 22, knockback: 520, leaves: burning }),
      // Its shockwaves come in pairs.
      wave("tremor", { phase: 2, weight: 1.5, triggerRange: 320, reach: 340, speed: 520, width: 46, windup: 0.8, recovery: 0.15, cooldown: 1.4, power: 20, knockback: 480, followUp: "tremorAgain" }),
      wave("tremorAgain", { phase: 2, weight: 0, triggerRange: 2000, reach: 340, speed: 640, width: 46, windup: 0.45, aimLock: 0.45, recovery: 0.3, cooldown: 1.4, power: 20, knockback: 480, followUp: ["smashEnd", "stompEnd"] }),

      // Shared: a roar opening each phase (two at 25%), and a call for help when its support is down.
      ...roars({ phases: 2, reach: 420, doubleFrom: 2 }),
      // Its support: a burning chaser and a shooter; at 25%, a burning chaser and a burning guardian with a shooter.
      ...callForHelp({ calls: ["chaser", "shooter"], elites: 1, more: { calls: ["chaser", "guardian", "shooter"], elites: 2, from: 2 } })
    ]
  },

  /**
   * The Swarm Mother (chapter four's): small and fast, of the tide. Bites in
   * strings, darts down a lane at a player backing away and bites again,
   * spits water at one standing still (it soaks and slows where it lands),
   * scatters everything around it with a ring of water when pressed, and
   * calls her brood. At 60% she darts twice and spits again; at 25% her
   * tides come in pairs, and her brood is bigger.
   */
  swarmer: {
    health: 4.4,
    behavior: { kind: "chase", stopDistance: 40 },
    phases: [{ below: 0.6, rest: 0.85 }, { below: 0.25, rest: 0.7 }],
    attacks: [
      melee("bite", { triggerRange: 60, reach: 70, arcDegrees: 100, windup: 0.35, aimLock: 0.3, active: 0.08, recovery: 0.2, cooldown: 0.8, power: 10, knockback: 160, followUp: ["biteAgain", "dartEnd"] }),
      melee("biteAgain", { weight: 0, triggerRange: 90, reach: 80, arcDegrees: 120, windup: 0.32, aimLock: 0.3, active: 0.08, recovery: 0.2, cooldown: 0.8, power: 10, knockback: 200, followUp: "frenzyEnd" }),
      melee("frenzyEnd", { weight: 0, triggerRange: 100, reach: 95, arcDegrees: 360, windup: 0.45, aimLock: 0.3, active: 0.1, recovery: 1, cooldown: 0.8, power: 12, knockback: 380 }),
      charge("dart", {
        read: "away", minRange: 150, triggerRange: 480, windup: 0.55, aimLock: 0.35, active: 0.3, speed: 820, width: 50, recovery: 0.25, cooldown: 1,
        power: 14, knockback: 300, lead: 0.3, followUp: ["biteAgain", "dartAgain"]
      }),
      charge("dartEnd", { weight: 0, triggerRange: 700, windup: 0.5, aimLock: 0.35, active: 0.3, speed: 820, width: 50, recovery: 1, cooldown: 1, power: 14, knockback: 300, lead: 0.3 }),
      lob("spit", {
        read: "still", minRange: 140, triggerRange: 520, maxReach: 520, radius: 80, windup: 0.7, aimLock: 0.35, active: 0, recovery: 0.5, cooldown: 1.4,
        flightTime: 0.6, fuse: 0.25, power: 12, knockback: 300, element: "water", lead: 0.2, leaves: { element: "water", radius: 75, seconds: 3 }, followUp: "spitAgain"
      }),
      wave("scatter", { read: "pressed", weight: 3, triggerRange: 2000, reach: 220, speed: 620, width: 40, windup: 0.35, recovery: 0.2, cooldown: 0.8, power: 8, knockback: 600, element: "water", followUp: "dartEnd" }),

      // At 60%: darts twice, and spits again.
      charge("dartAgain", { phase: 1, weight: 0, triggerRange: 700, windup: 0.45, aimLock: 0.35, active: 0.3, speed: 820, width: 50, recovery: 0.25, cooldown: 1, power: 14, knockback: 300, lead: 0.4, followUp: "frenzyEnd" }),
      lob("spitAgain", {
        phase: 1, weight: 0, triggerRange: 640, maxReach: 640, radius: 80, windup: 0.5, aimLock: 0.35, active: 0, recovery: 0.8, cooldown: 1.4,
        flightTime: 0.6, fuse: 0.25, power: 12, knockback: 300, element: "water", lead: 0.4, leaves: { element: "water", radius: 75, seconds: 3 }
      }),
      // At 25%: her tides come in pairs.
      wave("tide", { phase: 2, weight: 1.5, triggerRange: 300, reach: 320, speed: 520, width: 44, windup: 0.75, recovery: 0.15, cooldown: 1.3, power: 14, knockback: 450, element: "water", followUp: "tideAgain" }),
      wave("tideAgain", { phase: 2, weight: 0, triggerRange: 2000, reach: 320, speed: 640, width: 44, windup: 0.45, recovery: 1, cooldown: 1.3, power: 14, knockback: 450, element: "water" }),

      ...roars({ phases: 2, reach: 380, doubleFrom: 2 }),
      // Her brood: four swarmers (the first of her tide), eight at 25%.
      ...callForHelp({ calls: ["swarmer"], elites: 1, more: { calls: ["swarmer", "swarmer"], elites: 1, from: 2 } })
    ]
  },

  /**
   * The Warlord (chapter five's), charged with thunder: slashes in strings
   * ending in a cleave all around, blinks to a player keeping away (its mark
   * shows where) and slashes on, and to one hiding behind a wall; struck
   * again and again, it ripostes and blinks after her. Its support: a
   * burning chaser and a warden that wards it (cut the tether). At 60% it
   * blinks again and again and sends thunder out along the floor; at 25%
   * its blinks come in threes.
   */
  stalker: {
    health: 1.1,
    phases: [{ below: 0.6, rest: 0.85 }, { below: 0.25, rest: 0.7 }],
    attacks: [
      melee("slash", { triggerRange: 90, reach: 100, arcDegrees: 100, windup: 0.5, aimLock: 0.3, active: 0.1, recovery: 0.25, cooldown: 1, power: 16, knockback: 300, followUp: ["slashAgain", "cleaveEnd"] }),
      melee("slashAgain", { weight: 0, triggerRange: 130, reach: 120, arcDegrees: 140, windup: 0.4, aimLock: 0.3, active: 0.1, recovery: 0.25, cooldown: 1, power: 16, knockback: 320, followUp: ["cleaveEnd", "blinkEnd"] }),
      melee("cleaveEnd", { weight: 0, triggerRange: 150, reach: 125, arcDegrees: 360, windup: 0.55, aimLock: 0.35, active: 0.1, recovery: 1.1, cooldown: 0.9, power: 18, knockback: 420 }),
      blink("blink", { minRange: 240, triggerRange: 650, windup: 1, aimLock: 0.45, active: 0.1, recovery: 0.25, cooldown: 2, radius: 85, maxReach: 650, power: 18, knockback: 380, followUp: ["slashAgain", "cleaveEnd", "blinkAgain"] }),
      blink("hunt", { read: "covered", minRange: 120, triggerRange: 800, windup: 0.9, aimLock: 0.45, active: 0.1, recovery: 0.25, cooldown: 2, radius: 85, maxReach: 800, power: 18, knockback: 380, followUp: "cleaveEnd" }),
      blink("blinkEnd", { weight: 0, triggerRange: 700, windup: 0.8, aimLock: 0.4, active: 0.1, recovery: 1.1, cooldown: 1.5, radius: 85, maxReach: 650, power: 18, knockback: 380 }),
      melee("riposte", { read: "pressed", weight: 3, triggerRange: 150, reach: 120, arcDegrees: 360, windup: 0.35, aimLock: 0.35, active: 0.1, recovery: 0.2, cooldown: 0.9, power: 10, knockback: 620, followUp: "blinkEnd" }),

      // At 60%: blinks again and again, and thunder along the floor.
      blink("blinkAgain", { phase: 1, weight: 0, triggerRange: 700, windup: 0.7, aimLock: 0.4, active: 0.1, recovery: 0.2, cooldown: 1.5, radius: 85, maxReach: 650, power: 18, knockback: 380, followUp: ["cleaveEnd", "blinkThird"] }),
      wave("thunder", { phase: 1, triggerRange: 300, reach: 320, speed: 560, width: 46, windup: 0.8, recovery: 0.3, cooldown: 1.3, power: 16, knockback: 450, element: "thunder", followUp: ["blinkEnd", "cleaveEnd"] }),
      // At 25%: its blinks come in threes.
      blink("blinkThird", { phase: 2, weight: 0, triggerRange: 700, windup: 0.6, aimLock: 0.4, active: 0.1, recovery: 0.25, cooldown: 1.5, radius: 85, maxReach: 650, power: 18, knockback: 380, followUp: "cleaveEnd" }),

      ...roars({ phases: 2, reach: 400, doubleFrom: 2 }),
      // A charged chaser, and a warden that wards it: cut the tether, or fell the warden first.
      ...callForHelp({ calls: ["chaser", "warden"], elites: 1, more: { calls: ["chaser", "warden", "stalker"], elites: 2, from: 2 } })
    ]
  },

  /**
   * The Colossus (chapter six's), armored until broken: sweeps into quakes
   * where you are headed, tramples down a lane at a player backing away,
   * hurls a burning rock over the wall she hides behind, shrugs her off
   * with a shockwave when pressed, and calls volatiles to burst around her.
   * At 60% it quakes twice running, the floor left burning; at 25% it
   * tramples again and again, its shockwaves in pairs, and calls a gale
   * caster too.
   */
  juggernaut: {
    health: 0.6,
    phases: [{ below: 0.6, rest: 0.85 }, { below: 0.25, rest: 0.7 }],
    attacks: [
      melee("sweep", { triggerRange: 105, reach: 115, arcDegrees: 170, windup: 0.65, aimLock: 0.35, active: 0.12, recovery: 0.3, cooldown: 1, power: 18, knockback: 420, followUp: ["quake", "sweepEnd"] }),
      slam("quake", { triggerRange: 230, radius: 110, maxReach: 190, windup: 1, aimLock: 0.45, active: 0.1, recovery: 0.3, cooldown: 1.4, power: 24, knockback: 480, lead: 0.3, followUp: ["sweepEnd", "shockEnd", "quakeAgain"] }),
      melee("sweepEnd", { weight: 0, triggerRange: 140, reach: 125, arcDegrees: 220, windup: 0.55, aimLock: 0.35, active: 0.12, recovery: 1.2, cooldown: 1, power: 20, knockback: 460 }),
      wave("shockEnd", { weight: 0, triggerRange: 2000, reach: 320, speed: 480, width: 48, windup: 0.7, recovery: 1.2, cooldown: 1.2, power: 18, knockback: 480 }),
      charge("trample", {
        read: "away", minRange: 200, triggerRange: 520, windup: 0.9, aimLock: 0.4, active: 0.55, speed: 560, width: 96, recovery: 1.2, cooldown: 1.4,
        power: 26, knockback: 560, lead: 0.3, followUp: "trampleAgain"
      }),
      lob("hurl", {
        read: "covered", minRange: 160, triggerRange: 600, maxReach: 600, radius: 95, windup: 0.9, aimLock: 0.4, active: 0, recovery: 0.7, cooldown: 1.6,
        flightTime: 0.75, fuse: 0.3, power: 24, knockback: 420, element: "fire", lead: 0.3, leaves: { element: "fire", radius: 70, seconds: 2.5 }
      }),
      wave("shrug", { read: "pressed", weight: 3, triggerRange: 2000, reach: 190, speed: 620, width: 44, windup: 0.4, recovery: 0.2, cooldown: 0.9, power: 10, knockback: 700, followUp: "sweepEnd" }),

      // At 60%: it quakes twice running, the floor left burning.
      slam("quakeAgain", { phase: 1, weight: 0, triggerRange: 300, radius: 115, maxReach: 240, windup: 0.7, aimLock: 0.35, active: 0.1, recovery: 0.3, cooldown: 1.4, power: 24, knockback: 480, lead: 0.5, leaves: burning, followUp: ["shockEnd", "sweepEnd"] }),
      // At 25%: it tramples again and again, and its shockwaves come in pairs.
      charge("trampleAgain", { phase: 2, weight: 0, triggerRange: 900, windup: 0.6, aimLock: 0.35, active: 0.5, speed: 560, width: 96, recovery: 0.3, cooldown: 1.4, power: 26, knockback: 560, lead: 0.3, followUp: "shockEnd" }),
      wave("shockPair", { phase: 2, weight: 1.5, triggerRange: 320, reach: 340, speed: 520, width: 48, windup: 0.8, recovery: 0.15, cooldown: 1.4, power: 18, knockback: 480, followUp: "shockPairAgain" }),
      wave("shockPairAgain", { phase: 2, weight: 0, triggerRange: 2000, reach: 340, speed: 640, width: 48, windup: 0.45, recovery: 0.3, cooldown: 1.4, power: 18, knockback: 480, followUp: "sweepEnd" }),

      ...roars({ phases: 2, reach: 440, doubleFrom: 2 }),
      ...callForHelp({ calls: ["volatile", "chaser"], elites: 1, more: { calls: ["galeCaster", "volatile", "chaser"], elites: 1, from: 2 } })
    ]
  }
}
