/**
 * Challenges: what the player fights in the arena and what counts as a win.
 * Each has an objective and a wave plan: waves written out in order, then
 * (optionally) endless random waves. Numbers are live-tunable: they are part
 * of the `Tuning` resource; the wave timing is in `Tuning.waves`.
 *
 * A challenge shows only what the main line has introduced by the time it
 * opens (see `content/novelties.ts`): the quests' waves below are written
 * along the main line's order, each bringing its one new thing.
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
 * One slot of a wave: an enemy kind (spawning its `group`), or one with
 * extras: an elite (`elite`: the group's first one is bigger and tougher,
 * and carries an element, see `Tuning.elites`), a champion (`champion`: an
 * elite pushed further that stays across waves, see `Tuning.champions`,
 * alone), and a frontal shield (`shield`: the group's first one carries it,
 * see `Tuning.shields`).
 */
export type WaveEntry = EnemyKind | { readonly kind: EnemyKind; readonly elite?: EliteElement; readonly champion?: true; readonly shield?: true }

/** One wave: its entries spawned in order. */
export type Wave = ReadonlyArray<WaveEntry>

/** An elite `kind` carrying `element`, for a wave. */
export const elite = (kind: EnemyKind, element: EliteElement): WaveEntry => ({ kind, elite: element })
/** A champion `kind` carrying `element`, for a wave: it comes alone (not its group), and stays until it falls. */
export const champion = (kind: EnemyKind, element: EliteElement): WaveEntry => ({ kind, elite: element, champion: true })
/** `entry` carrying a frontal shield. */
export const shielded = (entry: WaveEntry): WaveEntry => (typeof entry === "string" ? { kind: entry, shield: true } : { ...entry, shield: true })
/** Whether a wave entry is a champion. */
export const entryChampion = (entry: WaveEntry): boolean => typeof entry !== "string" && entry.champion === true && entry.elite !== undefined
/** The enemy kind of a wave entry. */
export const entryKind = (entry: WaveEntry): EnemyKind => (typeof entry === "string" ? entry : entry.kind)
/** The element of an elite wave entry, or `null`. */
export const entryElite = (entry: WaveEntry): EliteElement | null => (typeof entry === "string" ? null : entry.elite ?? null)
/** Whether a wave entry carries a shield. */
export const entryShield = (entry: WaveEntry): boolean => typeof entry !== "string" && entry.shield === true

/**
 * Endless waves: random mixes of `kinds` within a budget (enemy `cost`)
 * growing per wave up to `maxBudget`, some of them elites of `elites`. Past
 * that, waves grow stronger, not bigger (enemy levels, elites), and every
 * `championEvery` waves a champion of `kinds` (one with its own moveset,
 * see content/champions.ts) leads the wave, carrying one of `elites`,
 * unless one still stands: harder enemies, not more of them.
 */
export interface EndlessWaves {
  readonly baseBudget: number
  readonly budgetPerWave: number
  readonly maxBudget: number
  /** Every this many waves a champion leads the wave; `null`: none. */
  readonly championEvery: number | null
  readonly kinds: ReadonlyArray<EnemyKind>
  /** The elements its elites carry (see `Tuning.elites.endless`); none makes no elites. */
  readonly elites: ReadonlyArray<EliteElement>
}

export interface WavePlan {
  /** These waves first, exactly. */
  readonly scripted: ReadonlyArray<Wave>
  /** Afterwards, endless random waves; `null` ends after the scripted ones. */
  readonly endless: EndlessWaves | null
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
/** A challenge of `waves` to clear in `arena`. */
const waves = (name: string, description: string, arena: ArenaId, scripted: ReadonlyArray<Wave>): ChallengeSpec =>
  challenge({ name, description, objective: clearWaves(), arena, waves: { scripted, endless: null } })

/** Until Fall's opening waves, then endless ones drawn from `kinds` (and elites of `elites`), at a tier's point of the main line. */
const untilFall = (arena: ArenaId, kinds: ReadonlyArray<EnemyKind>, elites: ReadonlyArray<EliteElement>, scripted: ReadonlyArray<Wave>): ChallengeSpec =>
  challenge({
    name: "Until Fall",
    description: "Last as long as the team can: every wave stronger than the last.",
    objective: endure(10, 1),
    arena,
    waves: { scripted, endless: { baseBudget: 6, budgetPerWave: 2, maxBudget: 16, championEvery: elites.length === 0 ? null : 5, kinds, elites } }
  })

/**
 * An element's trial: eight waves of what resists it (`resist`, the
 * backbone of every wave) among `others`, the last waves led by elites
 * carrying the element (immune to it), when it makes elites.
 */
const trial = (name: string, arena: ArenaId, resist: ReadonlyArray<EnemyKind>, others: ReadonlyArray<EnemyKind>, element: EliteElement | null): ChallengeSpec => {
  const r = (index: number): EnemyKind => resist[index % resist.length]!
  const o = (index: number): EnemyKind => others[index % others.length]!
  const led = (kind: EnemyKind): WaveEntry => (element === null ? kind : elite(kind, element))
  return waves(name, `Eight waves of what ${name.split(" ")[0]!.toLowerCase()} struggles against: its element's material on every clear.`, arena, [
    [r(0), o(0), o(1)],
    [r(1), r(0), o(2)],
    [r(2), r(1), o(0), o(1)],
    [led(r(0)), r(1), o(2)],
    [r(1), r(2), r(0), o(0)],
    [r(0), r(1), o(1), o(2)],
    [led(r(1)), r(2), r(0), o(0)],
    [led(r(0)), led(r(1)), r(2), o(1), o(2)]
  ])
}

/** What the main line has introduced by each chapter's end: the enemies endless waves draw from. */
const metBy = {
  one: ["chaser", "shooter"],
  two: ["chaser", "shooter", "swarmer", "guardian"],
  three: ["chaser", "shooter", "swarmer", "guardian", "sniper", "brute"],
  four: ["chaser", "shooter", "swarmer", "guardian", "sniper", "brute", "charger"],
  five: ["chaser", "shooter", "swarmer", "guardian", "sniper", "brute", "charger", "stalker", "warden"],
  six: ["chaser", "shooter", "swarmer", "guardian", "sniper", "brute", "charger", "stalker", "warden", "juggernaut", "volatile", "galeCaster"]
} satisfies Record<string, ReadonlyArray<EnemyKind>>

/** Every challenge, by id. */
export const challenges = {
  // Chapter 1: the Swordsman alone.
  /** Chasers only: learn to move, dodge, and strike back. */
  firstBlood: waves("First Blood", "Clear eight waves of chasers, a few more each time.", "courtyard", [
    ["chaser", "chaser"],
    ["chaser", "chaser"],
    ["chaser", "chaser"],
    ["chaser", "chaser", "chaser"],
    ["chaser", "chaser", "chaser"],
    ["chaser", "chaser", "chaser"],
    ["chaser", "chaser", "chaser", "chaser"],
    ["chaser", "chaser", "chaser", "chaser"]
  ]),
  /** Shooters behind cover, with chasers to keep you busy: close the distance. */
  crossfire: waves("Crossfire", "Clear eight waves of shooters fighting from cover, with chasers among them.", "sanctuary", [
    ["shooter", "chaser", "chaser"],
    ["shooter", "shooter", "chaser"],
    ["chaser", "chaser", "chaser", "shooter"],
    ["shooter", "shooter", "chaser", "chaser"],
    ["chaser", "chaser", "chaser", "shooter", "shooter"],
    ["shooter", "shooter", "shooter", "chaser", "chaser"],
    ["chaser", "chaser", "chaser", "chaser", "shooter", "shooter"],
    ["shooter", "shooter", "shooter", "chaser", "chaser", "chaser"]
  ]),
  /**
   * The first champion: a burning chaser fighting in phases (see
   * content/champions.ts). Once it is out, the waves around it are light: it
   * is the fight.
   */
  packLeader: waves("The Pack Leader", "Eight waves; midway the Pack Leader joins, a burning champion chaser that fights in phases, and stays until it falls.", "monastery", [
    ["chaser", "chaser", "chaser"],
    ["shooter", "chaser", "chaser", "chaser"],
    ["shooter", "shooter", "chaser", "chaser"],
    [champion("chaser", "fire"), "chaser"],
    ["shooter", "chaser"],
    ["chaser", "chaser"],
    ["shooter", "shooter"],
    ["chaser", "shooter"]
  ]),

  // Chapter 2: the Swordsman and the Gunner.
  /** Packs of swarmers: reach many at once. */
  swarm: waves("The Swarm", "Clear eight waves of swarmer packs, with chasers and shooters.", "courtyard", [
    ["swarmer"],
    ["chaser", "swarmer"],
    ["swarmer", "shooter"],
    ["swarmer", "swarmer"],
    ["chaser", "chaser", "swarmer"],
    ["swarmer", "swarmer", "shooter"],
    ["swarmer", "swarmer", "chaser", "chaser"],
    ["swarmer", "swarmer", "swarmer", "shooter"]
  ]),
  /** Fire trenches in the floor: keep out, and knock enemies in. */
  emberKiln: waves("Ember Kiln", "Eight waves in the kilnworks, between trenches of fire.", "kilnworks", [
    ["chaser", "chaser", "swarmer"],
    ["shooter", "shooter", "chaser"],
    ["swarmer", "swarmer"],
    ["chaser", "chaser", "chaser", "shooter"],
    ["swarmer", "shooter", "shooter"],
    ["swarmer", "swarmer", "chaser", "chaser"],
    ["shooter", "shooter", "swarmer", "chaser", "chaser"],
    ["swarmer", "swarmer", "shooter", "shooter", "chaser"]
  ]),
  /** Guardians: heavy, patient, and a long thrust for whoever keeps just out of reach. */
  ironGuard: waves("Iron Guard", "Eight waves led by guardians that hold their ground and thrust far.", "sanctuary", [
    ["guardian", "chaser"],
    ["guardian", "shooter", "chaser"],
    ["swarmer", "guardian"],
    ["guardian", "guardian", "chaser"],
    ["shooter", "shooter", "guardian", "swarmer"],
    ["guardian", "chaser", "chaser", "swarmer"],
    ["guardian", "guardian", "shooter", "shooter"],
    ["guardian", "guardian", "swarmer", "chaser", "chaser"]
  ]),
  /** The Bulwark among the citadel's fire: a burning champion guardian fighting in phases; the waves around it light. */
  bulwark: waves("The Bulwark", "Eight waves in the citadel; midway the Bulwark joins, a burning champion guardian that fights in phases, and stays until it falls.", "citadel", [
    ["chaser", "chaser", "swarmer"],
    ["guardian", "shooter", "chaser"],
    ["swarmer", "swarmer", "shooter"],
    [champion("guardian", "fire"), "chaser"],
    ["shooter", "swarmer"],
    ["chaser", "chaser"],
    ["guardian"],
    ["swarmer", "shooter"]
  ]),

  // Chapter 3: two characters (Bastion joins at its end).
  /** Elites: bigger, tougher, and carrying fire or water. */
  ashfall: waves("Ashfall", "Eight waves in the citadel, led by elites of fire and water.", "citadel", [
    ["chaser", "chaser", "swarmer"],
    [elite("chaser", "fire"), "shooter"],
    ["guardian", "swarmer", "chaser"],
    [elite("shooter", "water"), "chaser", "chaser"],
    ["swarmer", "swarmer", "guardian"],
    [elite("swarmer", "fire"), "shooter", "shooter"],
    [elite("guardian", "water"), "chaser", "swarmer"],
    [elite("chaser", "fire"), elite("shooter", "water"), "guardian"]
  ]),
  /** Snipers from afar: walls stop their shots. */
  outposts: waves("Outposts", "Eight waves of snipers keeping far away, with shooters and packs between them.", "monastery", [
    ["sniper", "chaser", "chaser"],
    ["shooter", "shooter", "swarmer"],
    ["sniper", "guardian", "chaser"],
    ["sniper", "shooter", "swarmer"],
    [elite("shooter", "water"), "sniper", "chaser"],
    ["sniper", "sniper", "guardian"],
    [elite("chaser", "fire"), "sniper", "shooter", "swarmer"],
    [elite("sniper", "water"), "sniper", "shooter", "guardian"]
  ]),
  /** Brutes: slow, heavy, best broken before they fall. */
  brute: waves("The Brute", "Eight waves with brutes among them: break them, then punish them.", "courtyard", [
    ["chaser", "chaser", "swarmer"],
    ["brute", "chaser"],
    ["guardian", "shooter", "swarmer"],
    ["brute", "sniper", "chaser"],
    [elite("chaser", "fire"), "swarmer", "shooter"],
    ["brute", "guardian", "swarmer"],
    [elite("guardian", "water"), "sniper", "chaser"],
    [elite("brute", "fire"), "brute", "shooter", "swarmer"]
  ]),
  /**
   * The Brute King in the kilnworks: a burning champion brute fighting with
   * its own moveset, in phases (see content/champions.ts). Once it is out,
   * the waves around it are light: it is the fight.
   */
  bruteKing: waves("The Brute King", "Eight waves in the kilnworks; midway the Brute King joins, a burning champion brute that fights in phases, and stays until it falls.", "kilnworks", [
    ["chaser", "chaser", "swarmer"],
    ["guardian", "shooter", "chaser"],
    ["brute", "swarmer"],
    [champion("brute", "fire"), "chaser"],
    ["shooter", "chaser"],
    ["swarmer"],
    ["guardian"],
    ["sniper", "chaser"]
  ]),

  // Chapter 4: three characters.
  /** Water in the floor: it soaks whoever wades in, and soaked blows hit softer. */
  highTide: waves("High Tide", "Eight waves at the harbor, among pools that soak: soaked blows hit softer.", "harbor", [
    ["shooter", "chaser", "chaser"],
    ["swarmer", "swarmer", "sniper"],
    [elite("shooter", "water"), "guardian"],
    ["brute", "chaser", "chaser"],
    ["sniper", "sniper", "swarmer"],
    [elite("chaser", "water"), "shooter", "shooter", "guardian"],
    ["brute", elite("swarmer", "water"), "sniper"],
    [elite("guardian", "water"), elite("shooter", "fire"), "brute", "chaser", "chaser"]
  ]),
  /** Firebombers: bombs over walls, flames where they burst. */
  bombardment: waves("Bombardment", "Eight waves in the citadel under firebombers' bombs.", "citadel", [
    ["charger", "chaser", "chaser"],
    ["charger", "swarmer"],
    ["guardian", "charger", "shooter"],
    [elite("chaser", "fire"), "charger", "swarmer"],
    ["charger", "charger", "chaser", "chaser"],
    ["brute", "charger", "sniper"],
    [elite("charger", "fire"), "guardian", "swarmer", "swarmer"],
    [elite("brute", "water"), "charger", "charger", "chaser"]
  ]),
  /** Shields: any enemy can carry one; shots and discs stop against it. */
  shieldWall: waves("Shield Wall", "Eight waves in the cistern, enemies carrying shields that stop shots from the front.", "cistern", [
    [shielded("shooter"), "chaser", "chaser"],
    [shielded("guardian"), "swarmer"],
    [shielded("sniper"), "shooter", "chaser"],
    ["charger", shielded("chaser"), shielded("chaser")],
    [shielded("brute"), "swarmer", "shooter"],
    [elite("shooter", "water"), shielded("guardian"), "charger"],
    [shielded("sniper"), shielded("shooter"), "brute", "chaser"],
    [shielded(elite("guardian", "fire")), "charger", shielded("shooter"), "swarmer"]
  ]),
  /** The Swarm Mother: a champion swarmer of the tide fighting in phases, small, fast, and hard to pin down; the waves around her light. */
  swarmMother: waves("The Swarm Mother", "Eight waves at the harbor; midway the Swarm Mother joins, a champion swarmer of the tide that fights in phases, and stays until it falls.", "harbor", [
    ["chaser", "chaser", "shooter"],
    ["charger", "swarmer"],
    [shielded("shooter"), "sniper", "chaser"],
    [champion("swarmer", "water"), shielded("guardian")],
    ["charger", "chaser"],
    [elite("shooter", "fire")],
    [shielded("guardian")],
    [elite("brute", "water")]
  ]),

  // Chapter 5.
  /** Stalkers: keeping your distance is no refuge. */
  sandstorm: waves("Sandstorm", "Eight waves among the obelisks, stalkers blinking to whoever keeps away.", "necropolis", [
    ["stalker", "chaser"],
    ["shooter", "shooter", "swarmer"],
    ["stalker", "guardian", "chaser"],
    ["charger", "sniper", "swarmer"],
    ["stalker", "stalker", "shooter"],
    [elite("brute", "fire"), "stalker", "chaser"],
    [shielded("guardian"), "stalker", "charger", "swarmer"],
    [elite("stalker", "water"), "stalker", "sniper", shielded("shooter"), "chaser"]
  ]),
  /** Wardens: an ally of theirs takes little damage until the tether is cut. */
  cloister: waves("The Cloister", "Eight waves in the monastery, wardens shielding their allies from afar.", "monastery", [
    ["warden", "chaser", "chaser"],
    ["guardian", "shooter", "swarmer"],
    ["warden", "brute", "chaser"],
    ["stalker", "charger", "swarmer"],
    ["warden", shielded("guardian"), "shooter"],
    [elite("chaser", "fire"), "warden", "stalker", "swarmer"],
    ["warden", "warden", "brute", "sniper"],
    [elite("guardian", "water"), "warden", "stalker", "charger", "chaser"]
  ]),
  /** Thunder elites: they strike the soaked hardest. */
  thunderhead: waves("Thunderhead", "Eight waves at the harbor, led by elites charged with thunder.", "harbor", [
    [elite("chaser", "thunder"), "shooter"],
    ["sniper", "warden", "swarmer"],
    [elite("shooter", "thunder"), "guardian", "chaser"],
    ["stalker", "charger", "swarmer"],
    [elite("sniper", "thunder"), "sniper", "chaser", "chaser"],
    ["brute", "warden", shielded("shooter")],
    [elite("guardian", "thunder"), "stalker", "charger"],
    [elite("brute", "thunder"), elite("sniper", "thunder"), "warden", "shooter", "swarmer"]
  ]),
  /** A champion stalker charged with thunder, hunting you through the citadel. */
  warlord: waves("The Warlord", "Nine waves in the citadel; midway the Warlord joins, a champion stalker charged with thunder that fights in phases, and hunts you until it falls.", "citadel", [
    ["guardian", "chaser", "chaser"],
    ["brute", "swarmer"],
    ["charger", "sniper", "chaser"],
    [champion("stalker", "thunder"), "chaser"],
    ["warden", "shooter"],
    [elite("guardian", "fire")],
    ["charger", "swarmer"],
    [elite("shooter", "thunder"), "chaser"],
    ["stalker", "sniper"]
  ]),

  // Chapter 6.
  /** Juggernauts: armored until broken. */
  ironclad: waves("Ironclad", "Eight waves with juggernauts: blows barely scratch them until they are broken.", "courtyard", [
    ["juggernaut", "chaser"],
    ["stalker", "shooter", "swarmer"],
    ["juggernaut", "warden", "chaser"],
    ["brute", "charger", "swarmer"],
    ["juggernaut", shielded("shooter"), "sniper"],
    [elite("guardian", "thunder"), "juggernaut", "chaser", "chaser"],
    ["juggernaut", "juggernaut", "warden"],
    [elite("juggernaut", "fire"), "stalker", "charger", "swarmer"]
  ]),
  /** Volatiles: they burst in fire where they fall, hurting their own side too. */
  powderKeg: waves("Powder Keg", "Eight waves in the kilnworks, volatiles bursting where they fall.", "kilnworks", [
    ["volatile", "chaser", "chaser"],
    ["volatile", "guardian", "shooter"],
    ["stalker", "volatile", "swarmer"],
    ["volatile", "volatile", "brute"],
    ["juggernaut", "charger", "volatile"],
    [elite("chaser", "thunder"), "volatile", "volatile", "warden"],
    [shielded("guardian"), "volatile", "volatile", "sniper"],
    [elite("brute", "fire"), "volatile", "volatile", "stalker", "swarmer"]
  ]),
  /** Gale casters: a cone of wind that blows everyone, their own side too. */
  galeForce: waves("Gale Force", "Eight waves among the obelisks, gale casters blowing everyone around.", "necropolis", [
    ["galeCaster", "chaser", "chaser"],
    ["galeCaster", "swarmer"],
    ["galeCaster", "guardian", "shooter"],
    ["volatile", "volatile", "galeCaster"],
    ["juggernaut", "galeCaster", "chaser"],
    ["stalker", "galeCaster", "charger"],
    [elite("galeCaster", "water"), "warden", "volatile", "volatile"],
    ["galeCaster", "galeCaster", elite("brute", "thunder"), "swarmer"]
  ]),
  /** The Colossus: a burning champion juggernaut, armored until broken, fighting in phases; the waves around it light. */
  colossus: waves("The Colossus", "Eight waves; midway the Colossus joins, a burning champion juggernaut armored until broken that fights in phases, and stays until it falls.", "courtyard", [
    ["chaser", "chaser", "volatile"],
    ["galeCaster", "shooter", "swarmer"],
    ["warden", "brute", "chaser"],
    [champion("juggernaut", "fire"), "chaser"],
    ["stalker", "volatile"],
    [elite("sniper", "thunder")],
    ["galeCaster", "chaser"],
    [shielded("guardian"), "volatile"]
  ]),

  // Side quests.
  /** Chasers and shooters, wave on wave. */
  holdTheLine: waves("Hold the Line", "Seven waves of chasers and shooters, coming harder each time.", "courtyard", [
    ["chaser", "chaser"],
    ["shooter", "chaser"],
    ["chaser", "chaser", "chaser"],
    ["shooter", "shooter", "chaser"],
    ["chaser", "chaser", "shooter"],
    ["shooter", "shooter", "chaser", "chaser"],
    ["chaser", "chaser", "chaser", "shooter", "shooter"]
  ]),
  /** Packs at night in the monastery. */
  swarmNight: waves("Night of Packs", "Eight waves of packs in the monastery, a guardian at their head.", "monastery", [
    ["swarmer"],
    ["swarmer", "chaser"],
    ["swarmer", "swarmer"],
    ["chaser", "chaser", "swarmer"],
    ["swarmer", "swarmer", "shooter"],
    ["guardian", "swarmer", "swarmer"],
    ["swarmer", "swarmer", "swarmer", "chaser"],
    ["guardian", "swarmer", "swarmer", "chaser", "chaser"]
  ]),
  /** Every wave led by elites: read their elements and turn them against them. */
  eliteHunt: waves("Elite Hunt", "Eight waves, every one led by elites of fire or water.", "courtyard", [
    [elite("chaser", "fire"), "chaser"],
    [elite("shooter", "water"), "swarmer"],
    [elite("guardian", "fire"), "chaser"],
    [elite("swarmer", "water"), elite("chaser", "fire")],
    [elite("sniper", "water"), elite("swarmer", "fire"), "shooter"],
    [elite("brute", "water"), "chaser", "chaser"],
    [elite("guardian", "fire"), elite("shooter", "water"), "swarmer"],
    [elite("brute", "fire"), elite("guardian", "water"), elite("chaser", "fire")]
  ]),
  /** Chapter 3's brutes back in the kilnworks, among its fire, with guardians, snipers, and elites. */
  forgePit: waves("The Forge Pit", "Eight waves in the kilnworks: brutes and guardians among the fire, snipers behind them, elites of fire and water.", "kilnworks", [
    ["brute", "chaser"],
    ["guardian", "sniper", "swarmer"],
    [elite("chaser", "fire"), "brute"],
    ["sniper", "shooter", "chaser"],
    [elite("guardian", "water"), "swarmer", "swarmer"],
    ["brute", "shooter"],
    [elite("sniper", "fire"), "guardian", "chaser"],
    [elite("brute", "water"), "brute", "sniper"]
  ]),
  /** Firebombers and shields in the flooded cistern. */
  floodgate: waves("Floodgate", "Eight waves in the cistern: firebombers, shields, and brutes wading in.", "cistern", [
    ["charger", "shooter", "chaser"],
    [shielded("guardian"), "swarmer"],
    [elite("shooter", "water"), "charger"],
    ["brute", "sniper", "swarmer"],
    [shielded("sniper"), "charger", "chaser", "chaser"],
    [elite("charger", "fire"), shielded("shooter"), "swarmer"],
    ["brute", "charger", shielded("guardian")],
    [elite("brute", "water"), elite("charger", "fire"), "sniper", "swarmer"]
  ]),
  /** Snipers and thunder over the water: the soaked are struck hardest. */
  stormFront: waves("Storm Front", "Eight waves of snipers and thunder elites at the harbor.", "harbor", [
    ["sniper", "chaser", "chaser"],
    ["sniper", "shooter", "swarmer"],
    [elite("sniper", "thunder"), "chaser", "chaser"],
    ["sniper", "sniper", "guardian"],
    [elite("shooter", "water"), "sniper", "warden"],
    [elite("chaser", "thunder"), "sniper", "sniper", "shooter"],
    [shielded("guardian"), "stalker", elite("sniper", "thunder")],
    [elite("sniper", "thunder"), elite("sniper", "thunder"), elite("shooter", "water"), "chaser", "chaser"]
  ]),
  /** The heaviest foes, wave on wave: brutes, guardians, and juggernauts that are best broken before they fall. */
  heavyGround: waves("Heavy Ground", "Eight waves of the heaviest foes in the citadel: brutes, guardians, and juggernauts, best broken before they fall.", "citadel", [
    ["brute", "chaser", "chaser"],
    ["guardian", "shooter", "swarmer"],
    ["juggernaut", "chaser", "chaser"],
    ["brute", "guardian", "swarmer", "swarmer"],
    [elite("guardian", "water"), "brute", "shooter"],
    ["juggernaut", "guardian", "chaser", "chaser"],
    [elite("brute", "fire"), "juggernaut", "swarmer", "swarmer"],
    [elite("juggernaut", "thunder"), elite("guardian", "fire"), "brute", "chaser"]
  ]),
  /** The stranger threats, one at a time, then together. */
  strangeCompany: waves("Strange Company", "Ten waves of stranger foes: they burst, ward, blink, blow you around, or shrug blows off until broken.", "courtyard", [
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
  ]),

  // Hardcore: each tier its own waves, showing what the main line has introduced by the time it opens.
  /** Until Fall's tiers: no end, every wave stronger than the last. */
  untilFall: untilFall("courtyard", metBy.one, [], [["chaser", "chaser"], ["shooter", "chaser"], ["chaser", "chaser", "shooter"]]),
  untilFall2: untilFall("courtyard", metBy.two, [], [["chaser", "chaser", "swarmer"], ["shooter", "guardian"], ["swarmer", "swarmer", "chaser"]]),
  untilFall3: untilFall("kilnworks", metBy.three, ["fire", "water"], [["chaser", "chaser", "swarmer"], ["shooter", "sniper", "chaser"], ["guardian", "brute", "swarmer"]]),
  untilFall4: untilFall("necropolis", metBy.four, ["fire", "water"], [["chaser", "chaser", "swarmer"], ["shooter", "charger", "chaser"], ["guardian", "sniper", "swarmer", "chaser"]]),
  untilFall5: untilFall("necropolis", metBy.five, ["fire", "water", "thunder"], [["chaser", "chaser", "swarmer"], ["shooter", "charger", "stalker"], ["guardian", "sniper", "warden", "chaser"]]),
  untilFall6: untilFall("necropolis", metBy.six, ["fire", "water", "thunder"], [["chaser", "chaser", "volatile"], ["shooter", "galeCaster", "stalker"], ["guardian", "juggernaut", "warden", "chaser"]]),
  // Until Fall's top tiers, each a ruleset of its own (see content/hardcore.ts).
  untilFall7: untilFall("harbor", ["shooter", "sniper", "charger", "galeCaster", "volatile", "chaser"], ["fire", "thunder"], [["sniper", "chaser", "chaser"], ["shooter", "galeCaster", "charger"], ["sniper", "volatile", "shooter", "chaser"]]),
  untilFall8: untilFall("kilnworks", ["brute", "juggernaut", "guardian", "warden", "swarmer", "chaser"], ["fire", "water"], [["guardian", "chaser", "swarmer"], ["brute", "warden", "chaser"], ["juggernaut", "guardian", "swarmer", "swarmer"]]),
  untilFall9: untilFall("cistern", ["stalker", "chaser", "swarmer", "charger", "volatile"], ["thunder"], [["chaser", "chaser", "swarmer"], ["stalker", "charger", "chaser"], ["stalker", "volatile", "swarmer", "swarmer"]]),
  untilFall10: untilFall("citadel", metBy.six, ["fire", "water", "thunder"], [["guardian", "volatile", "chaser"], ["sniper", "galeCaster", "stalker", "chaser"], ["juggernaut", "warden", "brute", "swarmer"]]),
  /** The Gauntlet's tiers: mixed formations with elite leaders. */
  gauntlet: waves("The Gauntlet", "Clear eight mixed waves in the kilnworks, ending with a burning champion guardian.", "kilnworks", [
    ["chaser", "chaser", "swarmer"],
    ["guardian", "shooter", "chaser"],
    ["swarmer", "swarmer", "shooter", "shooter"],
    ["guardian", "guardian", "chaser", "chaser"],
    ["swarmer", "swarmer", "swarmer", "shooter"],
    ["guardian", "shooter", "shooter", "chaser", "chaser"],
    ["guardian", "guardian", "swarmer", "swarmer", "shooter"],
    [champion("guardian", "fire"), "swarmer", "shooter", "chaser", "chaser"]
  ]),
  gauntlet2: waves("The Gauntlet", "Clear eight mixed waves in the kilnworks, ending with an elite formation.", "kilnworks", [
    ["chaser", "chaser", "swarmer"],
    ["charger", "shooter", "chaser"],
    ["guardian", "sniper", "chaser", "chaser"],
    [elite("brute", "fire"), "charger", "swarmer", "shooter"],
    [shielded("guardian"), elite("sniper", "water"), "swarmer", "chaser"],
    ["brute", "charger", "sniper", "swarmer"],
    [elite("charger", "fire"), shielded("shooter"), "guardian", "chaser"],
    [elite("brute", "fire"), shielded(elite("guardian", "water")), "charger", "swarmer"]
  ]),
  gauntlet3: waves("The Gauntlet", "Clear eight mixed waves in the kilnworks, ending with an elite formation.", "kilnworks", [
    ["chaser", "chaser", "swarmer"],
    ["charger", "shooter", "chaser"],
    ["guardian", "sniper", "chaser", "chaser"],
    [elite("brute", "fire"), "charger", "swarmer", "shooter"],
    ["guardian", elite("sniper", "thunder"), "swarmer", elite("chaser", "water"), "chaser", "brute"],
    ["warden", "stalker", "shooter", "chaser", "swarmer"],
    ["juggernaut", "volatile", "volatile", elite("shooter", "water"), "chaser"],
    [elite("brute", "fire"), elite("guardian", "thunder"), "warden", "stalker", "swarmer"]
  ]),
  gauntlet4: waves("The Gauntlet", "Eight waves among the obelisks: wardens guarding snipers, stalkers in between.", "necropolis", [
    ["warden", "sniper", "chaser"],
    ["stalker", "shooter", "swarmer"],
    ["warden", "warden", "sniper", "chaser"],
    [elite("sniper", "thunder"), "stalker", "galeCaster"],
    ["warden", "sniper", "sniper", "swarmer", "swarmer"],
    [elite("stalker", "fire"), "warden", "shooter", "chaser"],
    ["galeCaster", "sniper", "stalker", "volatile"],
    [elite("warden", "water"), elite("sniper", "fire"), "stalker", "galeCaster", "chaser"]
  ]),
  gauntlet5: waves("The Gauntlet", "Eight waves at the harbor: every kind at its hardest, ending with a champion juggernaut.", "harbor", [
    ["chaser", "volatile", "swarmer"],
    ["charger", "sniper", "galeCaster"],
    [elite("brute", "water"), "warden", "shooter"],
    ["stalker", "stalker", "volatile", "chaser"],
    [shielded("guardian"), elite("sniper", "thunder"), "charger", "swarmer"],
    ["juggernaut", "galeCaster", "shooter", "chaser"],
    [elite("stalker", "fire"), "warden", "volatile", "volatile"],
    [champion("juggernaut", "thunder"), "sniper", "charger", "chaser"]
  ]),
  /** Brute Siege's tiers: a champion brute and its guard. */
  siege: waves("Brute Siege", "Nine waves; midway a champion brute joins, and stays until it falls.", "courtyard", [
    ["chaser", "brute"],
    ["guardian", "chaser", "swarmer"],
    ["chaser", "chaser", "sniper", "swarmer"],
    ["brute", "chaser"],
    ["guardian", "guardian", "shooter", "swarmer"],
    [champion("brute", "water"), "sniper", "chaser", "chaser"],
    [elite("guardian", "fire"), "shooter", "sniper", "swarmer"],
    ["brute", "chaser", "chaser", "swarmer"],
    [elite("guardian", "water"), "guardian", "brute", "chaser"]
  ]),
  siege2: waves("Brute Siege", "Nine waves; midway a champion brute charged with thunder joins, and stays until it falls.", "courtyard", [
    ["chaser", "charger"],
    ["guardian", "chaser", "swarmer"],
    ["stalker", "charger", "swarmer"],
    ["brute", "warden"],
    [shielded("guardian"), "guardian", "shooter", "swarmer"],
    [champion("brute", "thunder"), "charger", "chaser", "chaser"],
    [elite("guardian", "fire"), "shooter", "sniper", "warden"],
    ["brute", "stalker", "chaser", "swarmer"],
    [elite("guardian", "thunder"), shielded("guardian"), "charger", "chaser"]
  ]),
  siege3: waves("Brute Siege", "Nine waves; midway a shielded champion brute charged with thunder joins, and stays until it falls.", "courtyard", [
    ["chaser", "charger", "volatile"],
    ["guardian", "galeCaster", "swarmer"],
    ["stalker", "charger", "swarmer"],
    ["brute", "warden", "juggernaut"],
    [shielded("guardian"), "guardian", "shooter", "volatile"],
    [shielded(champion("brute", "thunder")), "charger", "chaser", "chaser"],
    [elite("juggernaut", "fire"), "shooter", "sniper", "warden"],
    ["brute", "stalker", "galeCaster", "swarmer"],
    [elite("guardian", "thunder"), shielded("guardian"), "juggernaut", "chaser"]
  ]),
  siege4: waves("Brute Siege", "Nine waves in the burning kilnworks; midway a champion juggernaut joins, and stays until it falls.", "kilnworks", [
    ["chaser", "brute", "swarmer"],
    ["guardian", "charger", "volatile"],
    ["brute", "warden", "chaser"],
    [elite("brute", "fire"), "galeCaster", "swarmer"],
    [shielded("guardian"), "juggernaut", "chaser"],
    [champion("juggernaut", "fire"), "charger", "chaser"],
    [elite("guardian", "water"), "sniper", "volatile"],
    ["brute", "brute", "warden", "swarmer"],
    [elite("juggernaut", "thunder"), shielded("brute"), "charger", "chaser"]
  ]),
  siege5: waves("Brute Siege", "Nine waves in the cistern; midway a soaked champion brute joins with stalkers at its side, and stays until it falls.", "cistern", [
    ["chaser", "stalker", "swarmer"],
    ["brute", "warden", "volatile"],
    ["stalker", "stalker", "charger"],
    [elite("juggernaut", "fire"), "guardian", "chaser"],
    [shielded("brute"), "galeCaster", "sniper"],
    [champion("brute", "water"), "stalker", "chaser"],
    [elite("stalker", "thunder"), "volatile", "volatile"],
    ["juggernaut", "brute", "warden", "swarmer"],
    [elite("brute", "fire"), elite("guardian", "thunder"), "stalker", "chaser"]
  ]),
  /** The Keep's tiers: the citadel's last stand. */
  keep: waves("The Keep", "Ten waves in the citadel, hunted by a burning champion stalker, ending with two elite brutes and their guard.", "citadel", [
    ["guardian", "chaser", "chaser"],
    ["brute", "swarmer", "swarmer"],
    ["charger", "sniper", "chaser", "chaser"],
    [elite("guardian", "fire"), "shooter", "shooter", "swarmer"],
    [champion("stalker", "fire"), "brute", "chaser"],
    [elite("sniper", "thunder"), "sniper", "warden", "swarmer", "swarmer"],
    [elite("charger", "fire"), "charger", shielded("brute"), "chaser"],
    [elite("chaser", "water"), elite("chaser", "thunder"), "guardian", "guardian", "shooter"],
    ["brute", "brute", "sniper", "sniper", "swarmer"],
    [elite("brute", "fire"), elite("brute", "thunder"), "guardian", "charger", "chaser", "chaser"]
  ]),
  keep2: waves("The Keep", "Ten waves in the citadel, hunted by a burning champion stalker, ending with two elite juggernauts and their guard.", "citadel", [
    ["guardian", "chaser", "volatile"],
    ["brute", "swarmer", "galeCaster"],
    ["charger", "sniper", "chaser", "chaser"],
    [elite("guardian", "fire"), "shooter", "warden", "swarmer"],
    [champion("stalker", "fire"), "juggernaut", "chaser"],
    [elite("sniper", "thunder"), "sniper", "warden", "volatile", "volatile"],
    [elite("charger", "fire"), "charger", shielded("brute"), "galeCaster"],
    [elite("chaser", "water"), elite("chaser", "thunder"), shielded("guardian"), "guardian", "shooter"],
    ["juggernaut", "brute", "sniper", "sniper", "swarmer"],
    [elite("juggernaut", "fire"), elite("juggernaut", "thunder"), "guardian", "charger", "chaser", "chaser"]
  ]),
  keep3: waves("The Keep", "Ten waves in the monastery, held by a champion guardian charged with thunder, with wardens on the walls.", "monastery", [
    ["guardian", "chaser", "swarmer"],
    ["warden", "sniper", "chaser"],
    ["brute", "volatile", "volatile"],
    [elite("guardian", "water"), "shooter", "galeCaster"],
    [champion("guardian", "thunder"), "chaser", "swarmer"],
    ["warden", "warden", "sniper", "chaser"],
    [elite("charger", "fire"), "stalker", "volatile"],
    ["juggernaut", "sniper", "swarmer", "swarmer"],
    [elite("sniper", "thunder"), "warden", "brute", "chaser"],
    [elite("juggernaut", "water"), elite("stalker", "fire"), "guardian", "galeCaster", "chaser"]
  ]),
  keep4: waves("The Keep", "Ten waves in the citadel, hunted by a burning champion juggernaut, ending with the whole guard at its hardest.", "citadel", [
    ["guardian", "volatile", "chaser"],
    ["stalker", "sniper", "swarmer"],
    ["brute", "galeCaster", "charger"],
    [elite("warden", "thunder"), "sniper", "chaser", "chaser"],
    [champion("juggernaut", "fire"), "stalker", "chaser"],
    [elite("sniper", "water"), "volatile", "volatile", "swarmer"],
    [shielded(elite("brute", "thunder")), "charger", "galeCaster"],
    ["juggernaut", "warden", "stalker", "chaser"],
    [elite("guardian", "fire"), elite("stalker", "thunder"), "sniper", "swarmer"],
    [elite("juggernaut", "water"), elite("brute", "fire"), shielded("guardian"), "stalker", "chaser"]
  ]),
  // The element trials: what each element struggles against, rank by rank as the main line brings it.
  windTrial: trial("Wind Trial", "monastery", ["guardian", "swarmer"], ["chaser", "shooter"], null),
  windTrial2: trial("Wind Trial", "monastery", ["guardian", "brute", "swarmer"], ["chaser", "shooter", "sniper"], null),
  windTrial3: trial("Wind Trial", "monastery", ["brute", "guardian", "swarmer"], ["charger", "sniper", "shooter"], null),
  windTrial4: trial("Wind Trial", "monastery", ["brute", "guardian", "swarmer"], ["stalker", "warden", "charger"], null),
  windTrial5: trial("Wind Trial", "monastery", ["juggernaut", "galeCaster", "brute", "guardian"], ["stalker", "volatile", "warden"], null),
  // Its first rank opens before the main line brings water floors: away from the harbor.
  waterTrial: trial("Water Trial", "sanctuary", ["shooter"], ["chaser", "guardian", "swarmer"], "water"),
  waterTrial2: trial("Water Trial", "harbor", ["shooter"], ["charger", "guardian", "swarmer"], "water"),
  waterTrial3: trial("Water Trial", "harbor", ["shooter", "warden"], ["stalker", "brute", "chaser"], "water"),
  waterTrial4: trial("Water Trial", "harbor", ["shooter", "warden"], ["juggernaut", "volatile", "galeCaster"], "water"),
  rockTrial: trial("Rock Trial", "citadel", ["swarmer"], ["brute", "chaser", "guardian"], null),
  rockTrial2: trial("Rock Trial", "citadel", ["swarmer", "stalker"], ["brute", "charger", "chaser"], null),
  rockTrial3: trial("Rock Trial", "citadel", ["swarmer", "stalker", "galeCaster"], ["juggernaut", "brute", "chaser"], null),
  fireTrial: trial("Fire Trial", "kilnworks", ["brute", "charger", "stalker"], ["warden", "guardian", "chaser"], "fire"),
  fireTrial2: trial("Fire Trial", "kilnworks", ["volatile", "brute", "charger", "stalker"], ["juggernaut", "galeCaster", "guardian"], "fire"),
  thunderTrial: trial("Thunder Trial", "necropolis", ["sniper"], ["juggernaut", "stalker", "galeCaster"], "thunder"),

  // Auditions (see content/auditions.ts): a character alone, in three fights around her kit, the last against a champion.
  // Any can be invited from the first invitation on, so they may show what the main line has not brought yet: the player chose to meet it.
  // The Gunner: keep your distance, then hold it against the patient, then a champion that closes in.
  gunnerOpenGround: waves("Open Ground", "Six waves of chasers and swarmers in the open: keep moving, keep firing.", "courtyard", [
    ["chaser", "chaser"], ["swarmer"], ["chaser", "swarmer"], ["chaser", "chaser", "chaser"], ["swarmer", "swarmer"], ["chaser", "chaser", "swarmer"]
  ]),
  gunnerHoldTheRange: waves("Hold the Range", "Six waves of guardians and shooters: their thrusts reach far, so fire from farther.", "sanctuary", [
    ["guardian"], ["shooter", "chaser"], ["guardian", "shooter"], ["swarmer", "guardian"], ["shooter", "shooter", "chaser"], ["guardian", "guardian"]
  ]),
  gunnerPackReturns: waves("The Pack Returns", "Six waves; the Pack Leader comes back to hunt you, and stays until it falls.", "monastery", [
    ["chaser", "chaser"], ["shooter", "swarmer"], [champion("chaser", "fire")], ["chaser"], ["shooter"], ["swarmer"]
  ]),
  // The Stormcaller: groups spread out, a place to fight from, then a champion to fight by the totem.
  stormSpreadOut: waves("Spread Out", "Six waves of swarms and snipers spread across the harbor: link them up.", "harbor", [
    ["swarmer", "sniper"], ["chaser", "chaser", "shooter"], ["swarmer", "swarmer"], ["sniper", "sniper", "chaser"], [elite("swarmer", "water"), "shooter"], ["swarmer", "swarmer", "sniper"]
  ]),
  stormByTheTotem: waves("By the Totem", "Six waves of firebombers and brutes: pick your ground and hold it.", "citadel", [
    ["charger", "chaser"], ["brute"], ["charger", "charger"], ["guardian", "swarmer"], ["brute", "charger"], [elite("chaser", "fire"), "charger", "chaser"]
  ]),
  stormDrownedBrute: waves("The Drowned Brute", "Six waves in the cistern; a soaked champion brute joins midway, and stays until it falls.", "cistern", [
    ["chaser", "chaser"], ["sniper", "swarmer"], [champion("brute", "water")], ["chaser"], ["charger"], ["swarmer"]
  ]),
  // Sparkfist: lines to dart through, the quick ones, then the hunter.
  sparkFiringLines: waves("Firing Lines", "Six waves of shooters and snipers standing in lines: dart through them.", "sanctuary", [
    ["shooter", "shooter", "shooter"], ["sniper", "shooter"], ["chaser", "chaser", "chaser"], ["shooter", "shooter", "sniper"], [elite("shooter", "thunder"), "shooter"], ["sniper", "sniper", "shooter", "shooter"]
  ]),
  sparkQuickHands: waves("Quick Hands", "Six waves of stalkers and wardens: be faster than they are.", "monastery", [
    ["stalker"], ["warden", "chaser"], ["stalker", "swarmer"], ["warden", "shooter", "shooter"], ["stalker", "stalker"], [elite("stalker", "fire"), "warden"]
  ]),
  sparkTheHunter: waves("The Hunter", "Six waves among the obelisks; a champion stalker charged with thunder joins midway, and stays until it falls.", "necropolis", [
    ["chaser", "chaser"], ["warden", "shooter"], [champion("stalker", "thunder")], ["chaser"], ["shooter"], ["warden"]
  ]),
  // Tidewarden: blows worth bracing for, many at once, then a giant's.
  tideHeavyBlows: waves("Heavy Blows", "Six waves of brutes, guardians, and juggernauts: meet each blow.", "courtyard", [
    ["brute"], ["guardian", "chaser"], ["juggernaut"], ["brute", "shooter"], ["guardian", "guardian"], [elite("brute", "water"), "juggernaut"]
  ]),
  tideHoldTheGate: waves("Hold the Gate", "Six waves of volatiles, firebombers, and gale casters crowding the cistern.", "cistern", [
    ["volatile", "chaser"], ["charger", "charger"], ["volatile", "volatile"], ["galeCaster", "chaser"], ["charger", "volatile", "shooter"], [elite("guardian", "fire"), "volatile", "charger"]
  ]),
  tideIronGiant: waves("The Iron Giant", "Six waves in the citadel; a burning champion juggernaut joins midway, and stays until it falls.", "citadel", [
    ["chaser", "chaser"], ["shooter", "volatile"], [champion("juggernaut", "fire")], ["chaser"], ["galeCaster"], ["shooter"]
  ]),
  // Hearth: packs to keep burning, the team's health from them, then a champion's brood.
  hearthKeepBurning: waves("Keep Them Burning", "Six waves of packs in the kilnworks: set them alight and keep them so.", "kilnworks", [
    ["swarmer", "swarmer"], ["chaser", "chaser", "swarmer"], ["swarmer", "swarmer", "shooter"], ["chaser", "chaser", "chaser", "chaser"], ["swarmer", "swarmer", "swarmer"], [elite("swarmer", "water"), "swarmer", "chaser"]
  ]),
  hearthEmbersToHealth: waves("Embers to Health", "Six waves of tough enemies among packs: their burns are your health.", "harbor", [
    ["guardian", "swarmer"], ["stalker", "chaser"], ["warden", "swarmer", "swarmer"], ["guardian", "guardian", "shooter"], ["stalker", "volatile"], [elite("guardian", "thunder"), "swarmer", "swarmer"]
  ]),
  hearthBrood: waves("The Brood", "Six waves; a soaked champion swarmer joins midway with its brood, and stays until it falls.", "monastery", [
    ["chaser", "swarmer"], ["shooter", "swarmer"], [champion("swarmer", "water")], ["chaser"], ["swarmer"], ["shooter"]
  ]),
  // Windwall: shots to stop, winds to stand in, then a champion's charge.
  windUnderFire: waves("Under Fire", "Six waves of shooters and snipers: wall off their shots.", "sanctuary", [
    ["shooter", "shooter", "sniper"], ["sniper", "sniper"], ["shooter", "shooter", "shooter", "chaser"], [elite("sniper", "fire"), "shooter"], ["sniper", "sniper", "shooter", "shooter"], [elite("shooter", "water"), "sniper", "sniper"]
  ]),
  windTheGale: waves("The Gale", "Six waves of gale casters and firebombers at the harbor: hold your ground in the wind.", "harbor", [
    ["galeCaster", "chaser"], ["charger", "shooter"], ["galeCaster", "volatile"], ["charger", "charger", "sniper"], ["galeCaster", "galeCaster", "chaser"], [elite("charger", "thunder"), "galeCaster", "shooter"]
  ]),
  windStormGuard: waves("The Storm Guard", "Six waves in the citadel; a champion guardian charged with thunder joins midway, and stays until it falls.", "citadel", [
    ["chaser", "shooter"], ["sniper", "chaser"], [champion("guardian", "thunder")], ["shooter"], ["charger"], ["sniper"]
  ]),
  // Quarry: the tough ones to break, the heaviest, then a champion brute.
  quarryStoneAndShield: waves("Stone and Shield", "Six waves of guardians, wardens, and brutes, some behind shields.", "courtyard", [
    ["guardian"], ["warden", "chaser"], [shielded("guardian"), "swarmer"], ["brute", "warden"], ["guardian", "guardian", "chaser"], [elite("brute", "fire"), "warden"]
  ]),
  quarryBreakThem: waves("Break Them", "Six waves of juggernauts and brutes in the kilnworks: break them, then punish them.", "kilnworks", [
    ["juggernaut"], ["brute", "chaser"], [shielded("brute"), "shooter"], ["juggernaut", "guardian"], ["warden", "brute", "swarmer"], [elite("juggernaut", "water"), "brute"]
  ]),
  quarryThunderKing: waves("The Thunder King", "Six waves in the kilnworks; a champion brute charged with thunder joins midway, and stays until it falls.", "kilnworks", [
    ["chaser", "swarmer"], ["guardian", "shooter"], [champion("brute", "thunder")], ["chaser"], ["warden"], ["shooter"]
  ]),
  // The quest characters' masteries (the others' are their auditions' last fight, harder).
  swordsmanMastery: waves("The Wind's Rival", "Six waves; a burning champion stalker joins midway, and stays until it falls.", "courtyard", [
    ["chaser", "chaser", "swarmer"], ["shooter", "stalker"], [champion("stalker", "fire")], ["chaser"], ["shooter"], ["swarmer"]
  ]),
  tidecallerMastery: waves("The Storm Brood", "Six waves at the harbor; a champion swarmer charged with thunder joins midway, and stays until it falls.", "harbor", [
    ["swarmer", "shooter"], ["chaser", "sniper"], [champion("swarmer", "thunder")], ["chaser"], ["shooter"], ["sniper"]
  ]),
  bastionMastery: waves("The Last Wall", "Six waves in the citadel; a burning champion brute joins midway, and stays until it falls.", "citadel", [
    ["guardian", "chaser"], ["shooter", "brute"], [champion("brute", "fire")], ["chaser"], ["shooter"], ["guardian"]
  ]),

  // Extras.
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
  })
}

export type ChallengeId = keyof typeof challenges
