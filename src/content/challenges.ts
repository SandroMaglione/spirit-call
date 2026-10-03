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
const challenge = (spec: ChallengeSpec): ChallengeSpec => spec

/** Every challenge, by id. */
export const challenges = {
  /** Many fast melee enemies: crowd control. */
  swarm: challenge({
    name: "The Swarm",
    description: "Clear three waves of fast melee enemies.",
    objective: clearWaves(),
    arena: "kilnworks",
    waves: {
      scripted: [
        ["chaser", "chaser", "swarmer"],
        ["swarmer", "swarmer", "chaser", "chaser"],
        ["swarmer", elite("swarmer", "fire"), "swarmer", "charger", "chaser"]
      ],
      endless: null
    }
  }),
  /** Ranged enemies behind cover: close the distance or outshoot them. */
  crossfire: challenge({
    name: "Crossfire",
    description: "Clear three waves of shooters and snipers.",
    objective: clearWaves(),
    arena: "sanctuary",
    waves: {
      scripted: [
        ["shooter", "shooter", "chaser"],
        ["sniper", "shooter", "shooter"],
        ["sniper", "sniper", "guardian", elite("shooter", "water")]
      ],
      endless: null
    }
  }),
  /** A warm-up, then a brute with its guards as the finale. */
  brute: challenge({
    name: "The Brute",
    description: "Two warm-up waves, then a brute and its guards.",
    objective: clearWaves(),
    arena: "courtyard",
    waves: {
      scripted: [
        ["chaser", "charger"],
        ["guardian", "chaser", "swarmer"],
        [elite("brute", "thunder"), "guardian", "guardian"]
      ],
      endless: null
    }
  }),
  /** Ranged enemies spread across the arena with swarms between them: reach many at once. */
  outposts: challenge({
    name: "Outposts",
    description: "Clear three waves of shooters and snipers spread out, with swarms between them.",
    objective: clearWaves(),
    arena: "cistern",
    waves: {
      scripted: [
        ["shooter", "shooter", "swarmer", "swarmer"],
        ["sniper", "shooter", "swarmer", "swarmer", "swarmer"],
        ["sniper", "sniper", "shooter", "shooter", "swarmer", "swarmer", "chaser"]
      ],
      endless: null
    }
  }),
  /** Every enemy type, then ever-growing random waves. */
  endless: challenge({
    name: "Endless",
    description: "Survive 90 seconds of ever-growing waves.",
    objective: survive(90),
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
  })
}

export type ChallengeId = keyof typeof challenges
