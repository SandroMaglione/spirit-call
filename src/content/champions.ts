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
import { charge, lob, slam, wave } from "./enemies.ts"
import type { AttackSpec, EnemyKind } from "./enemies.ts"
import { callForHelp, roars } from "./patterns.ts"

/** A phase after the first: it begins once the champion's health is at or under `below` (a share of its max). */
export interface ChampionPhase {
  readonly below: number
  /** Its wait between attacks, as a share of the champion's own (see `restOf`). */
  readonly rest: number
}

export interface ChampionMoveset {
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
    health: 1.8,
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
  }
}
