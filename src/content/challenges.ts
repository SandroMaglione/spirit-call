/**
 * Challenges: what the player fights in the arena and what counts as a win.
 * Each has an objective and a wave plan: waves written out in order, then
 * (optionally) endless random waves. Numbers are live-tunable: they are part
 * of the `Tuning` resource; the wave timing is in `Tuning.waves`.
 *
 * A new kind of objective is a new case here and in `objectiveMet`
 * (see `features/challenges.ts`).
 */
import type { ArenaId } from "./arena.ts"
import type { ElementId } from "./elements.ts"
import type { EnemyKind } from "./enemies.ts"

export type Objective =
  /** Defeat every wave (the plan must end: no endless waves). */
  | { readonly kind: "clearWaves" }
  /** Stay alive this long while waves keep coming. */
  | { readonly kind: "survive"; readonly seconds: number }
  /**
   * Last until the team falls (the plan must not end: endless waves): the
   * enemies come `levelPerWave` levels stronger each wave (over the run's
   * enemy level). Clearing wave `goal` counts as a clear (its rewards, the
   * next tier), and the run goes on; how far it went is the wave it fell at.
   */
  | { readonly kind: "endure"; readonly goal: number; readonly levelPerWave: number }

/** The elements an elite enemy can carry (see `Tuning.elites`). */
export type EliteElement = Exclude<ElementId, "wind">

/**
 * One slot of a wave: an enemy kind (spawning its `group`), or an elite of
 * it: the group's first one is bigger and tougher, and carries an element
 * (see `Tuning.elites`).
 */
export type WaveEntry = EnemyKind | { readonly kind: EnemyKind; readonly elite: EliteElement }

/** One wave: its entries spawned in order. */
export type Wave = ReadonlyArray<WaveEntry>

/** An elite `kind` carrying `element`, for a wave. */
export const elite = (kind: EnemyKind, element: EliteElement): WaveEntry => ({ kind, elite: element })
/** The enemy kind of a wave entry. */
export const entryKind = (entry: WaveEntry): EnemyKind => (typeof entry === "string" ? entry : entry.kind)
/** The element of an elite wave entry, or `null`. */
export const entryElite = (entry: WaveEntry): EliteElement | null => (typeof entry === "string" ? null : entry.elite)

export interface WavePlan {
  /** These waves first, exactly. */
  readonly scripted: ReadonlyArray<Wave>
  /**
   * Afterwards: random mixes within a budget (enemy `cost`) growing per
   * wave, some of them elites (see `Tuning.elites.endless`); `null` ends
   * after the scripted ones.
   */
  readonly endless: { readonly baseBudget: number; readonly budgetPerWave: number } | null
}

export interface ChallengeSpec {
  /** Shown in menus and on the results screen. */
  readonly name: string
  readonly description: string
  readonly objective: Objective
  readonly waves: WavePlan
  /** Where it is fought (see `content/arena.ts`). */
  readonly arena: ArenaId
}

export const clearWaves = (): Objective => ({ kind: "clearWaves" })
export const survive = (seconds: number): Objective => ({ kind: "survive", seconds })
export const endure = (goal: number, levelPerWave: number): Objective => ({ kind: "endure", goal, levelPerWave })
const challenge = (spec: ChallengeSpec): ChallengeSpec => spec

/** Every challenge, by id. */
export const challenges = {
  /** Many fast melee enemies: crowd control. */
  swarm: challenge({
    name: "The Swarm",
    description: "Clear eight waves of fast melee enemies, the last led by burning elites.",
    objective: clearWaves(),
    arena: "kilnworks",
    waves: {
      scripted: [
        ["chaser", "chaser", "chaser", "swarmer"],
        ["swarmer", "swarmer", "swarmer", "chaser", "chaser"],
        ["chaser", "chaser", "chaser", "swarmer", "swarmer"],
        ["swarmer", "swarmer", "charger", "chaser", "chaser"],
        [elite("chaser", "fire"), "swarmer", "chaser", "chaser", "chaser"],
        ["swarmer", "swarmer", "swarmer", "charger", "chaser", "chaser"],
        ["charger", "charger", "chaser", "chaser", "swarmer", "swarmer"],
        [elite("swarmer", "fire"), "swarmer", "swarmer", elite("charger", "fire"), "chaser", "chaser"]
      ],
      endless: null
    }
  }),
  /** Ranged enemies behind cover: close the distance or outshoot them. */
  crossfire: challenge({
    name: "Crossfire",
    description: "Clear eight waves of shooters and snipers fighting from cover.",
    objective: clearWaves(),
    arena: "sanctuary",
    waves: {
      scripted: [
        ["shooter", "shooter", "chaser"],
        ["shooter", "chaser", "chaser", "swarmer"],
        ["sniper", "shooter", "shooter"],
        ["sniper", "chaser", "chaser", "shooter"],
        ["guardian", "shooter", "shooter", "swarmer"],
        ["sniper", "sniper", "chaser", "chaser"],
        [elite("shooter", "water"), "sniper", "guardian", "chaser"],
        [elite("sniper", "thunder"), "sniper", "shooter", "shooter", "guardian", "chaser"]
      ],
      endless: null
    }
  }),
  /** Warm-up waves, then brutes, and a thunder brute with its guards as the finale. */
  brute: challenge({
    name: "The Brute",
    description: "Nine waves building up to a brute charged with thunder and its guards.",
    objective: clearWaves(),
    arena: "courtyard",
    waves: {
      scripted: [
        ["chaser", "charger"],
        ["guardian", "chaser", "swarmer"],
        ["chaser", "chaser", "charger", "swarmer"],
        ["brute", "chaser"],
        ["guardian", "guardian", "shooter", "swarmer"],
        ["brute", "charger", "chaser", "chaser"],
        [elite("guardian", "fire"), "shooter", "sniper", "swarmer"],
        ["brute", "brute", "chaser", "chaser"],
        [elite("brute", "thunder"), "guardian", "guardian", "charger"]
      ],
      endless: null
    }
  }),
  /** Every enemy type, then ever-growing random waves. */
  endless: challenge({
    name: "Endless",
    description: "Survive three and a half minutes of ever-growing waves.",
    objective: survive(210),
    arena: "kilnworks",
    waves: {
      scripted: [
        ["chaser", "chaser", "swarmer"],
        ["charger", "shooter", "chaser"],
        ["guardian", "sniper", "chaser", "chaser"],
        [elite("brute", "fire"), "charger", "swarmer", "shooter"],
        ["guardian", elite("sniper", "thunder"), "swarmer", elite("chaser", "water"), "chaser", "brute"]
      ],
      endless: { baseBudget: 6, budgetPerWave: 2 }
    }
  }),
  /** Ranged enemies spread across the arena with swarms between them: reach many at once. */
  outposts: challenge({
    name: "Outposts",
    description: "Clear nine waves of shooters and snipers spread out, with swarms between them.",
    objective: clearWaves(),
    arena: "cistern",
    waves: {
      scripted: [
        ["shooter", "shooter", "swarmer", "swarmer"],
        ["sniper", "shooter", "swarmer"],
        ["chaser", "chaser", "shooter", "swarmer"],
        ["sniper", "sniper", "swarmer", "swarmer"],
        [elite("shooter", "water"), "shooter", "chaser", "chaser"],
        ["guardian", "sniper", "shooter", "swarmer", "swarmer"],
        ["charger", "sniper", "sniper", "chaser"],
        [elite("sniper", "thunder"), "shooter", "shooter", "swarmer", "swarmer"],
        ["sniper", "sniper", "shooter", "shooter", "swarmer", "swarmer", "chaser", elite("guardian", "water")]
      ],
      endless: null
    }
  }),
  /** Fire everywhere: firebombers and burning elites in a fortress with fire trenches. */
  ashfall: challenge({
    name: "Ashfall",
    description: "Nine waves of fire in the citadel: firebombers, burning elites, and a burning brute.",
    objective: clearWaves(),
    arena: "citadel",
    waves: {
      scripted: [
        ["charger", "chaser", "swarmer"],
        ["charger", "charger", "chaser"],
        [elite("chaser", "fire"), "swarmer", "swarmer"],
        ["charger", "guardian", "chaser", "chaser"],
        ["brute", "charger", "swarmer"],
        [elite("swarmer", "fire"), elite("chaser", "fire"), "charger", "charger"],
        ["guardian", "guardian", "charger", "shooter"],
        [elite("charger", "fire"), "brute", "chaser", "chaser", "swarmer"],
        [elite("brute", "fire"), "charger", "charger", "guardian", "swarmer"]
      ],
      endless: null
    }
  }),
  /** Water everywhere: soaking sprays and puddles in a harbor; thunder hits the soaked hard. */
  highTide: challenge({
    name: "High Tide",
    description: "Nine waves at the harbor: soaking elites, shooters, and snipers that strike the soaked.",
    objective: clearWaves(),
    arena: "harbor",
    waves: {
      scripted: [
        ["shooter", "chaser", "chaser"],
        ["shooter", "shooter", "swarmer"],
        [elite("chaser", "water"), "shooter", "swarmer"],
        ["sniper", "shooter", "chaser", "chaser"],
        ["guardian", elite("shooter", "water"), "swarmer", "swarmer"],
        ["sniper", "sniper", "chaser", "chaser", "shooter"],
        [elite("guardian", "water"), "shooter", "shooter", "swarmer"],
        ["brute", "sniper", "shooter", "chaser", "chaser"],
        [elite("sniper", "thunder"), elite("shooter", "water"), "shooter", "guardian", "chaser", "chaser"]
      ],
      endless: null
    }
  }),
  /** A long stand in the open: every kind, then ever-growing waves. */
  sandstorm: challenge({
    name: "Sandstorm",
    description: "Survive three and a half minutes among the obelisks.",
    objective: survive(210),
    arena: "necropolis",
    waves: {
      scripted: [
        ["chaser", "chaser", "swarmer"],
        ["shooter", "charger", "swarmer"],
        ["guardian", "sniper", "chaser", "chaser"],
        ["brute", "swarmer", "swarmer", "shooter"]
      ],
      endless: { baseBudget: 7, budgetPerWave: 2 }
    }
  }),
  /** Close quarters: guardians and skirmishers around a cloister of low walls. */
  cloister: challenge({
    name: "The Cloister",
    description: "Ten waves in the monastery: guardians, packs, and charged elites at close quarters.",
    objective: clearWaves(),
    arena: "monastery",
    waves: {
      scripted: [
        ["chaser", "chaser", "chaser"],
        ["guardian", "chaser", "swarmer"],
        ["swarmer", "swarmer", "chaser", "chaser"],
        ["guardian", "guardian", "shooter"],
        [elite("chaser", "thunder"), "chaser", "swarmer", "swarmer"],
        ["guardian", "sniper", "chaser", "chaser"],
        ["brute", "guardian", "swarmer"],
        [elite("guardian", "thunder"), "guardian", "chaser", "chaser", "shooter"],
        ["swarmer", "swarmer", "swarmer", "charger", "charger", "chaser"],
        [elite("brute", "water"), elite("guardian", "fire"), "guardian", "chaser", "chaser"]
      ],
      endless: null
    }
  }),
  /** The last stand of the citadel: brutes and elites of every element. */
  warlord: challenge({
    name: "The Warlord",
    description: "Ten waves in the citadel, ending with two elite brutes and their guard.",
    objective: clearWaves(),
    arena: "citadel",
    waves: {
      scripted: [
        ["guardian", "chaser", "chaser"],
        ["brute", "swarmer", "swarmer"],
        ["charger", "sniper", "chaser", "chaser"],
        [elite("guardian", "fire"), "shooter", "shooter", "swarmer"],
        ["brute", "brute", "chaser"],
        [elite("sniper", "thunder"), "sniper", "guardian", "swarmer", "swarmer"],
        [elite("charger", "fire"), "charger", "brute", "chaser"],
        [elite("chaser", "water"), elite("chaser", "thunder"), "guardian", "guardian", "shooter"],
        ["brute", "brute", "sniper", "sniper", "swarmer"],
        [elite("brute", "fire"), elite("brute", "thunder"), "guardian", "charger", "chaser", "chaser"]
      ],
      endless: null
    }
  }),
  /** Every wave led by elites: read their elements and turn them against them. */
  eliteHunt: challenge({
    name: "Elite Hunt",
    description: "Eight waves, every one led by elites of fire, water, or thunder.",
    objective: clearWaves(),
    arena: "courtyard",
    waves: {
      scripted: [
        [elite("chaser", "fire"), "chaser"],
        [elite("shooter", "water"), "swarmer"],
        [elite("guardian", "thunder"), "chaser"],
        [elite("charger", "fire"), elite("chaser", "water")],
        [elite("sniper", "thunder"), elite("swarmer", "fire"), "shooter"],
        [elite("brute", "water"), "chaser", "chaser"],
        [elite("guardian", "fire"), elite("shooter", "thunder"), "swarmer"],
        [elite("brute", "thunder"), elite("charger", "fire"), elite("chaser", "water")]
      ],
      endless: null
    }
  }),
  /** Packs at night: swarms in a cloister, then ever-growing waves. */
  swarmNight: challenge({
    name: "Night of Packs",
    description: "Survive three minutes of packs in the monastery.",
    objective: survive(180),
    arena: "monastery",
    waves: {
      scripted: [
        ["swarmer", "swarmer"],
        ["swarmer", "chaser", "chaser"],
        ["swarmer", "swarmer", "swarmer"]
      ],
      endless: { baseBudget: 5, budgetPerWave: 2 }
    }
  }),
  /** Snipers and thunder over the water: the soaked are struck hardest. */
  stormFront: challenge({
    name: "Storm Front",
    description: "Eight waves of snipers and thunder elites at the harbor.",
    objective: clearWaves(),
    arena: "harbor",
    waves: {
      scripted: [
        ["sniper", "chaser", "chaser"],
        ["sniper", "shooter", "swarmer"],
        [elite("sniper", "thunder"), "chaser", "chaser"],
        ["sniper", "sniper", "guardian"],
        [elite("shooter", "water"), "sniper", "swarmer", "swarmer"],
        [elite("chaser", "thunder"), "sniper", "sniper", "shooter"],
        ["guardian", "guardian", elite("sniper", "thunder"), "swarmer"],
        [elite("sniper", "thunder"), elite("sniper", "thunder"), elite("shooter", "water"), "chaser", "chaser"]
      ],
      endless: null
    }
  }),
  /** No end: ever-growing waves of ever-stronger enemies, until the team falls. */
  untilFall: challenge({
    name: "Until Fall",
    description: "Last as long as the team can: every wave stronger than the last.",
    objective: endure(10, 1),
    arena: "necropolis",
    waves: {
      scripted: [
        ["chaser", "chaser", "swarmer"],
        ["shooter", "chaser", "charger"],
        ["guardian", "sniper", "swarmer", "chaser"]
      ],
      endless: { baseBudget: 6, budgetPerWave: 2 }
    }
  })
}

export type ChallengeId = keyof typeof challenges
