/**
 * Champions' own movesets (see docs/enemies.md, "Champions"): a champion of
 * a kind listed here fights with these attacks instead of its kind's. It
 * reads what the player does (an attack's `read` is picked first while she
 * does it: a charge at a player backing away, a bomb over the wall she
 * hides behind), and fights in phases by its health: each phase begins with
 * its opening attack (a roar, its shockwave pushing the team back) and
 * brings new attacks and shorter rests. Every attack keeps the fairness
 * floor (see `fairness`), and the model is its kind's: what changes is how
 * it fights, never what it looks like.
 *
 * A kind without one here fights as a champion with its kind's moveset.
 */
import { charge, lob, slam, wave } from "./enemies.ts"
import type { AttackSpec, EnemyKind } from "./enemies.ts"

/** A phase after the first: it begins once the champion's health is at or under `below` (a share of its max). */
export interface ChampionPhase {
  readonly below: number
  /** Its wait between attacks, as a share of the champion's own (see `restOf`). */
  readonly rest: number
}

export interface ChampionMoveset {
  /** Its name over its health bar. */
  readonly name: string
  /** Its health, as a multiple of a champion's (see `championPower`): the fight is long enough to go through its phases. */
  readonly health: number
  /** Its phases after the first, from the highest health down. */
  readonly phases: ReadonlyArray<ChampionPhase>
  readonly attacks: ReadonlyArray<AttackSpec>
}

export const championMovesets: Partial<Record<EnemyKind, ChampionMoveset>> = {
  /**
   * The Brute King. First: its slam where you are headed and its stomp up
   * close, a charge down a lane at a player backing away, and a burning rock
   * heaved over the wall she hides behind. At 60% it roars (a shockwave),
   * then slams twice in a row, sends a shockwave out along the floor at a
   * player close by, and holds a slam up longer before it falls. At 25% it
   * roars twice, charges again and again, and its shockwaves come in pairs.
   */
  brute: {
    name: "The Brute King",
    health: 1.8,
    phases: [{ below: 0.6, rest: 0.85 }, { below: 0.25, rest: 0.7 }],
    attacks: [
      slam("slam", { minRange: 130, triggerRange: 280, maxReach: 220, radius: 105, windup: 1, aimLock: 0.45, active: 0.12, recovery: 0.9, cooldown: 1, power: 30, knockback: 460, lead: 0.4 }),
      slam("stomp", { triggerRange: 140, maxReach: 0, radius: 140, windup: 0.75, active: 0.12, recovery: 0.8, cooldown: 1, power: 22, knockback: 520 }),
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

      // Its second phase, at 60%: a roar, and the floor shakes.
      wave("roar", { phase: 1, opens: true, weight: 0, triggerRange: 2000, reach: 420, speed: 600, width: 54, windup: 1, recovery: 0.8, cooldown: 0.6, power: 12, knockback: 700 }),
      slam("crush", { phase: 1, minRange: 130, triggerRange: 280, maxReach: 220, radius: 105, windup: 0.95, aimLock: 0.45, active: 0.12, recovery: 0.25, cooldown: 1.1, power: 28, knockback: 300, lead: 0.4, followUp: "crushAgain" }),
      // The second slam aims anew, further ahead of a runner.
      slam("crushAgain", { phase: 1, weight: 0, triggerRange: 340, maxReach: 260, radius: 110, windup: 0.7, aimLock: 0.35, active: 0.12, recovery: 1, cooldown: 1.1, power: 30, knockback: 480, lead: 0.6 }),
      // Close by, it sends a shockwave out along the floor: out of its reach, or dash through it.
      wave("quake", { phase: 1, triggerRange: 300, reach: 330, speed: 520, width: 46, windup: 0.9, recovery: 0.9, cooldown: 1.4, power: 20, knockback: 480 }),
      // Held up long, tracking her: a dodge made when it is raised is spent before it falls.
      slam("hammer", { phase: 1, weight: 0.7, minRange: 100, triggerRange: 260, maxReach: 200, radius: 100, windup: 1.6, aimLock: 0.4, active: 0.12, recovery: 0.9, cooldown: 1.1, power: 34, knockback: 500 }),

      // Its last phase, at 25%: two roars, one after the other.
      wave("fury", { phase: 2, opens: true, weight: 0, triggerRange: 2000, reach: 460, speed: 640, width: 54, windup: 1, recovery: 0.2, cooldown: 0.6, power: 12, knockback: 700, followUp: "furyAgain" }),
      wave("furyAgain", { phase: 2, weight: 0, triggerRange: 2000, reach: 460, speed: 760, width: 54, windup: 0.6, recovery: 0.9, cooldown: 0.6, power: 12, knockback: 700 }),
      // Charges again and again, each aimed anew, then stomps where it stops.
      charge("rampage", {
        phase: 2, weight: 2, read: "away", minRange: 200, triggerRange: 560, windup: 0.8, aimLock: 0.4, active: 0.45, speed: 680, width: 84, recovery: 0.2, cooldown: 1.2,
        power: 24, knockback: 480, lead: 0.3, followUp: "rampageAgain"
      }),
      charge("rampageAgain", {
        phase: 2, weight: 0, triggerRange: 900, windup: 0.6, aimLock: 0.35, active: 0.45, speed: 680, width: 84, recovery: 0.2, cooldown: 1.2,
        power: 24, knockback: 480, lead: 0.3, followUp: "trample"
      }),
      slam("trample", { phase: 2, weight: 0, triggerRange: 2000, maxReach: 0, radius: 150, windup: 0.6, active: 0.12, recovery: 1.2, cooldown: 1.2, power: 22, knockback: 520 }),
      // Its shockwaves come in pairs.
      wave("tremor", { phase: 2, weight: 1.5, triggerRange: 320, reach: 340, speed: 520, width: 46, windup: 0.8, recovery: 0.15, cooldown: 1.4, power: 20, knockback: 480, followUp: "tremorAgain" }),
      wave("tremorAgain", { phase: 2, weight: 0, triggerRange: 2000, reach: 340, speed: 640, width: 46, windup: 0.45, aimLock: 0.45, recovery: 1, cooldown: 1.4, power: 20, knockback: 480 })
    ]
  }
}
