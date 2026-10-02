/**
 * Challenges: what the player fights in the arena and what counts as a win.
 * Each has an objective and a wave plan: waves written out in order, then
 * (optionally) endless random waves. Numbers are live-tunable: they are part
 * of the `Tuning` resource; the wave timing is in `Tuning.waves`.
 *
 * A new kind of objective is a new case here and in `objectiveMet`
 * (see `features/challenges.ts`).
 */
import type { EnemyKind } from "./enemies.ts"

export type Objective =
  /** Defeat every wave (the plan must end: no endless waves). */
  | { readonly kind: "clearWaves" }
  /** Stay alive this long while waves keep coming. */
  | { readonly kind: "survive"; readonly seconds: number }

/** One wave: enemies spawned in order (each entry spawns its enemy's `group`). */
export type Wave = ReadonlyArray<EnemyKind>

export interface WavePlan {
  /** These waves first, exactly. */
  readonly scripted: ReadonlyArray<Wave>
  /** Afterwards: random mixes within a budget (enemy `cost`) growing per wave; `null` ends after the scripted ones. */
  readonly endless: { readonly baseBudget: number; readonly budgetPerWave: number } | null
}

export interface ChallengeSpec {
  /** Shown in menus and on the results screen. */
  readonly name: string
  readonly description: string
  readonly objective: Objective
  readonly waves: WavePlan
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
    waves: {
      scripted: [
        ["chaser", "chaser", "swarmer"],
        ["swarmer", "swarmer", "chaser", "chaser"],
        ["swarmer", "swarmer", "swarmer", "charger", "chaser"]
      ],
      endless: null
    }
  }),
  /** Ranged enemies behind cover: close the distance or outshoot them. */
  crossfire: challenge({
    name: "Crossfire",
    description: "Clear three waves of shooters and snipers.",
    objective: clearWaves(),
    waves: {
      scripted: [
        ["shooter", "shooter", "chaser"],
        ["sniper", "shooter", "shooter"],
        ["sniper", "sniper", "guardian", "shooter"]
      ],
      endless: null
    }
  }),
  /** A warm-up, then a brute with its guards as the finale. */
  brute: challenge({
    name: "The Brute",
    description: "Two warm-up waves, then a brute and its guards.",
    objective: clearWaves(),
    waves: {
      scripted: [
        ["chaser", "charger"],
        ["guardian", "chaser", "swarmer"],
        ["brute", "guardian", "guardian"]
      ],
      endless: null
    }
  }),
  /** Ranged enemies spread across the arena with swarms between them: reach many at once. */
  outposts: challenge({
    name: "Outposts",
    description: "Clear three waves of shooters and snipers spread out, with swarms between them.",
    objective: clearWaves(),
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
    waves: {
      scripted: [
        ["chaser", "chaser", "swarmer"],
        ["charger", "shooter", "chaser"],
        ["guardian", "sniper", "chaser", "chaser"],
        ["brute", "charger", "swarmer", "shooter"],
        ["guardian", "sniper", "swarmer", "chaser", "chaser", "brute"]
      ],
      endless: { baseBudget: 6, budgetPerWave: 2 }
    }
  })
}

export type ChallengeId = keyof typeof challenges
