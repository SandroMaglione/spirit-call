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
  /**
   * Last until the team falls (the plan must not end: endless waves): the
   * enemies come `levelPerWave` levels stronger each wave (over the run's
   * enemy level). Clearing wave `goal` counts as a clear (its rewards, the
   * next tier), and the run goes on; how far it went is the wave it fell at.
   */
  | { readonly kind: "endure"; readonly goal: number; readonly levelPerWave: number }
  /**
   * Training (an Extra, not a quest): no waves, only `dummies` (at shares of
   * the arena's size) that take blows and never fall; the team cannot fall
   * either, and it never ends (left from the in-game menu). Nothing is
   * recorded.
   */
  | { readonly kind: "training"; readonly dummies: ReadonlyArray<{ readonly kind: EnemyKind; readonly x: number; readonly y: number }> }
  /**
   * Practice (an Extra): no waves but a field kept full of the enemies picked
   * for the run (see `Practice`), until the team falls. Each pick stands
   * with its group, at least `fewest` enemies and at most `most` in all (the
   * picks repeated, or taking turns); one that falls comes back `respawn`
   * seconds later (another pick in its place, when they take turns).
   * Nothing is recorded.
   */
  | { readonly kind: "practice"; readonly most: number; readonly fewest: number; readonly respawn: number }

/** The elements an elite enemy can carry (see `Tuning.elites`): wind and rock leave nothing behind, so they make no elites. */
export type EliteElement = Exclude<ElementId, "wind" | "rock">

/**
 * One slot of a wave: an enemy kind (spawning its `group`), or an elite of
 * it: the group's first one is bigger and tougher, and carries an element
 * (see `Tuning.elites`); or a champion of it, an elite pushed further that
 * stays across waves (see `Tuning.champions`), alone.
 */
export type WaveEntry = EnemyKind | { readonly kind: EnemyKind; readonly elite: EliteElement; readonly champion?: true }

/** One wave: its entries spawned in order. */
export type Wave = ReadonlyArray<WaveEntry>

/** An elite `kind` carrying `element`, for a wave. */
export const elite = (kind: EnemyKind, element: EliteElement): WaveEntry => ({ kind, elite: element })
/** A champion `kind` carrying `element`, for a wave: it comes alone (not its group), and stays until it falls. */
export const champion = (kind: EnemyKind, element: EliteElement): WaveEntry => ({ kind, elite: element, champion: true })
/** Whether a wave entry is a champion. */
export const entryChampion = (entry: WaveEntry): boolean => typeof entry !== "string" && entry.champion === true
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
  /** Warm-up waves, then a thunder champion brute that stays through the waves after it, until it falls. */
  brute: challenge({
    name: "The Brute",
    description: "Nine waves; midway a champion brute charged with thunder joins, and stays until it falls.",
    objective: clearWaves(),
    arena: "courtyard",
    waves: {
      scripted: [
        ["chaser", "charger"],
        ["guardian", "chaser", "swarmer"],
        ["chaser", "chaser", "charger", "swarmer"],
        ["brute", "chaser"],
        ["guardian", "guardian", "shooter", "swarmer"],
        [champion("brute", "thunder"), "charger", "chaser", "chaser"],
        [elite("guardian", "fire"), "shooter", "sniper", "swarmer"],
        ["brute", "chaser", "chaser", "swarmer"],
        [elite("guardian", "thunder"), "guardian", "charger", "chaser"]
      ],
      endless: null
    }
  }),
  /** Mixed waves with a final elite formation; also used by the Gauntlet tiers. */
  endless: challenge({
    name: "The Gauntlet",
    description: "Clear eight mixed waves, ending with an elite formation.",
    objective: clearWaves(),
    arena: "kilnworks",
    waves: {
      scripted: [
        ["chaser", "chaser", "swarmer"],
        ["charger", "shooter", "chaser"],
        ["guardian", "sniper", "chaser", "chaser"],
        [elite("brute", "fire"), "charger", "swarmer", "shooter"],
        ["guardian", elite("sniper", "thunder"), "swarmer", elite("chaser", "water"), "chaser", "brute"],
        ["warden", "stalker", "shooter", "chaser", "swarmer"],
        ["juggernaut", "volatile", "volatile", elite("shooter", "water"), "chaser"],
        [elite("brute", "fire"), elite("guardian", "thunder"), "warden", "stalker", "swarmer"]
      ],
      endless: null
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
    description: "Nine waves at the harbor: soaking elites, snipers that strike the soaked, and a champion guardian of the tide.",
    objective: clearWaves(),
    arena: "harbor",
    waves: {
      scripted: [
        ["shooter", "chaser", "chaser"],
        ["shooter", "shooter", "swarmer"],
        [elite("chaser", "water"), "shooter", "swarmer"],
        [champion("guardian", "water"), "sniper", "shooter", "chaser"],
        ["guardian", elite("shooter", "water"), "swarmer", "swarmer"],
        ["sniper", "sniper", "chaser", "chaser", "shooter"],
        [elite("guardian", "water"), "shooter", "shooter", "swarmer"],
        ["brute", "sniper", "shooter", "chaser", "chaser"],
        [elite("sniper", "thunder"), elite("shooter", "water"), "shooter", "guardian", "chaser", "chaser"]
      ],
      endless: null
    }
  }),
  /** Fight through the obelisks to an armored final formation. */
  sandstorm: challenge({
    name: "Sandstorm",
    description: "Clear nine waves among the obelisks, ending with armored foes and their support.",
    objective: clearWaves(),
    arena: "necropolis",
    waves: {
      scripted: [
        ["chaser", "chaser", "swarmer"],
        ["shooter", "charger", "swarmer"],
        ["guardian", "sniper", "chaser", "chaser"],
        ["brute", "swarmer", "swarmer", "shooter"],
        ["stalker", "stalker", "shooter", "chaser"],
        [elite("guardian", "water"), "sniper", "chaser", "swarmer"],
        ["juggernaut", "galeCaster", "chaser", "chaser"],
        ["warden", "brute", "volatile", "volatile", "shooter"],
        [elite("brute", "thunder"), "juggernaut", "warden", "stalker", "swarmer"]
      ],
      endless: null
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
    description: "Ten waves in the citadel, hunted by a burning champion stalker, ending with two elite brutes and their guard.",
    objective: clearWaves(),
    arena: "citadel",
    waves: {
      scripted: [
        ["guardian", "chaser", "chaser"],
        ["brute", "swarmer", "swarmer"],
        ["charger", "sniper", "chaser", "chaser"],
        [elite("guardian", "fire"), "shooter", "shooter", "swarmer"],
        [champion("stalker", "fire"), "brute", "chaser"],
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
  /** The newer threats, one at a time, then together: a Volatile's burst, a Warden's ward, a Stalker's blink, a Gale Caster's gust, a Juggernaut's armor. */
  strangeCompany: challenge({
    name: "Strange Company",
    description: "Ten waves of stranger foes: they burst, ward, blink, blow you around, or shrug blows off until broken.",
    objective: clearWaves(),
    arena: "courtyard",
    waves: {
      scripted: [
        ["volatile", "chaser", "chaser"],
        ["warden", "chaser", "chaser", "shooter"],
        ["stalker", "shooter", "shooter"],
        ["galeCaster", "chaser", "chaser", "swarmer"],
        ["volatile", "volatile", "swarmer", "brute"],
        ["juggernaut", "chaser", "shooter"],
        ["warden", "brute", "guardian", "galeCaster"],
        ["stalker", "stalker", "sniper", "chaser"],
        ["warden", "juggernaut", "volatile", "volatile"],
        ["warden", "stalker", "galeCaster", "juggernaut", "volatile"]
      ],
      endless: null
    }
  }),
  /** The Training Ground (an Extra): dummies to practice on, a fire pool near each side, nothing to fear. */
  trainingGround: challenge({
    name: "Training Ground",
    description: "Dummies that never fall: practice your combos. Only the fire hurts.",
    objective: {
      kind: "training",
      dummies: [
        { kind: "dummy", x: 0.5, y: 0.34 },
        { kind: "dummy", x: 0.66, y: 0.45 },
        { kind: "dummy", x: 0.7, y: 0.5 },
        { kind: "dummy", x: 0.66, y: 0.55 },
        { kind: "dummy", x: 0.25, y: 0.5 },
        { kind: "heavyDummy", x: 0.5, y: 0.68 },
        { kind: "sparringDummy", x: 0.34, y: 0.66 }
      ]
    },
    arena: "trainingGround",
    waves: { scripted: [], endless: null }
  }),
  /** Enemy Practice (an Extra): the enemies picked, all together and coming back as they fall, until the team falls. */
  practice: challenge({
    name: "Enemy Practice",
    description: "The enemies you pick, together, coming back as they fall, until you fall.",
    objective: { kind: "practice", most: 8, fewest: 5, respawn: 3 },
    arena: "courtyard",
    waves: { scripted: [], endless: null }
  }),
  /** Packs at night: swarms in a cloister, ending with their elite leaders. */
  swarmNight: challenge({
    name: "Night of Packs",
    description: "Clear eight waves of packs in the monastery, ending with their elite leaders.",
    objective: clearWaves(),
    arena: "monastery",
    waves: {
      scripted: [
        ["swarmer", "swarmer"],
        ["swarmer", "chaser", "chaser"],
        ["swarmer", "swarmer", "swarmer"],
        ["chaser", "chaser", "swarmer", "swarmer"],
        [elite("chaser", "water"), "swarmer", "swarmer", "shooter"],
        ["charger", "stalker", "swarmer", "swarmer"],
        [elite("swarmer", "fire"), "chaser", "chaser", "guardian"],
        [elite("chaser", "thunder"), elite("swarmer", "water"), "charger", "swarmer", "swarmer"]
      ],
      endless: null
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
