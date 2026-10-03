/**
 * What everything looks like: each character, each enemy, and the arena's
 * floor, walls, and scenery, as a placeholder shape or a model (see
 * `models.ts`). Giving something its model is changing its entry here; no
 * system changes. See `docs/models.md`.
 */
import type { ArenaId } from "../content/arena.ts"
import type { CharacterId } from "../content/characters.ts"
import type { EnemyKind } from "../content/enemies.ts"
import type { SkillId } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import { view } from "../config/view.ts"
import type { Vec2 } from "../math/vec.ts"
import type { WallPlacement } from "../schema.ts"
import { crowCombo } from "./assets/crow.ts"
import type { ModelId } from "./models.ts"

/**
 * A one-shot: a clip, or part of one (`from`–`to`, in clip seconds). For a
 * blow, `contact` is the clip time where it lands: the game times the clip
 * so that pose shows when the simulation's blow lands. `next` plays after
 * it when nothing follows (a recovery back to the guard).
 */
export type Shot = string | { readonly clip: string; readonly from?: number; readonly to?: number; readonly contact?: number; readonly next?: string }

/**
 * Which clip plays at which moment of the game. Loops: `idle` while
 * standing, `run` while moving (one cycle per `distance` world units
 * covered). One-shots, stretched over the moment's length in the
 * simulation: `attack` per combo step (the last one repeats for later
 * steps) and `power` over the move's recovery, `dash` over the dash,
 * `windup` over an enemy's windup; `skills` (by skill) and `hurt` at the
 * clip's own length. A moment without a clip keeps the loops playing.
 */
export interface Moments {
  readonly idle: string
  readonly run: { readonly clip: string; readonly distance: number }
  readonly attack?: ReadonlyArray<Shot>
  readonly power?: Shot
  readonly dash?: Shot
  readonly windup?: Shot
  readonly skills?: Partial<Record<SkillId, Shot>>
  readonly hurt?: Shot
}

/** Weapons in hand: each weapon's model, attached to the body model's `grip` bone as it is (same scale and axes). */
export interface Held {
  readonly grip: string
  readonly weapons: Partial<Record<WeaponId, ModelId>>
}

/**
 * A body's look. Both kinds stand on the body's circle: `widthFactor` and
 * `heightFactor` (times the body's radius) are its size on screen.
 *
 * - `capsule`: a low-poly capsule in `color`. Enemies' capsules are drawn in
 *   batches (cheap in numbers); a player's is its own mesh.
 * - `model`: a model scaled to that height, facing where the body faces,
 *   its clips played at `moments`. Each one on the field is drawn on its
 *   own, a draw call per material: fine for characters and a few large
 *   enemies, too costly for swarms (see `docs/models.md`).
 */
export type BodyLook =
  | { readonly kind: "capsule"; readonly color: number; readonly widthFactor: number; readonly heightFactor: number }
  | {
      readonly kind: "model"
      readonly model: ModelId
      /** Crowd models share a baked bone texture and one instance batch. */
      readonly batched?: boolean
      readonly widthFactor: number
      readonly heightFactor: number
      readonly moments?: Moments
      readonly held?: Held
    }

/** Every character is the crow for now; the Swordsman holds her sword and fights with it. */
const crow = { kind: "model", model: "crow", widthFactor: 1.5, heightFactor: view.bodyHeightFactor } as const
const crowLoops: Moments = { idle: "Idle", run: { clip: "Run", distance: 110 } }

export const characterLooks: Readonly<Record<CharacterId, BodyLook>> = {
  swordsman: {
    ...crow,
    moments: {
      ...crowLoops,
      // The follow-through prepares the next cut; power has its own deeper thrust.
      attack: crowCombo.map((move) => ({ clip: "AttackCombo", ...move })),
      power: { clip: "Power", contact: crowCombo[0].contact },
      dash: "Dash"
    },
    held: { grip: "weapon_grip", weapons: { trainingBlade: "trainingBlade", crescendo: "crescendo" } }
  },
  gunner: { ...crow, moments: crowLoops },
  tidecaller: { ...crow, moments: crowLoops },
  stormcaller: { ...crow, moments: crowLoops }
}

const enemyModel = (kind: EnemyKind, model: ModelId, stride: number): BodyLook => ({
  kind: "model", model, batched: true,
  widthFactor: view.enemies[kind].widthFactor, heightFactor: view.enemies[kind].heightFactor,
  moments: { idle: "Idle", run: { clip: kind === "dummy" ? "Idle" : "Run", distance: stride }, hurt: "Hurt" }
})

export const enemyLooks: Readonly<Record<EnemyKind, BodyLook>> = {
  dummy: enemyModel("dummy", "enemyDummy", 1),
  chaser: enemyModel("chaser", "enemyChaser", 68),
  shooter: enemyModel("shooter", "enemyShooter", 62),
  brute: enemyModel("brute", "enemyBrute", 60),
  swarmer: enemyModel("swarmer", "enemySwarmer", 55),
  charger: enemyModel("charger", "enemyCharger", 78),
  sniper: enemyModel("sniper", "enemySniper", 60),
  guardian: enemyModel("guardian", "enemyGuardian", 54)
}

/**
 * How a wall entity is dressed. A wall's box is what blocks (the
 * simulation's); its look only dresses it.
 *
 * - `box`: a lit box in `color`, as tall as the view's wall height.
 * - `run`: segments of `model` (a wall piece running along its X) laid along
 *   the box's long side, as many as fit at the arena's scale, stretched a
 *   little to fill it exactly and to the box's thickness. Drawn in batches.
 * - `pillar`: one of `models` standing on the box, scaled evenly to its
 *   footprint: the one whose footprint is closest to the box's at the
 *   arena's scale (variants of the same size picked by place).
 */
export type WallLook =
  | { readonly kind: "box"; readonly color: number }
  | { readonly kind: "run"; readonly model: ModelId }
  | { readonly kind: "pillar"; readonly models: ReadonlyArray<ModelId> }

/** The floor: the flat `grid`, or `tiles` of square floor pieces (variants picked by place, turned at random) over a base of `color`. */
export type FloorLook =
  | { readonly kind: "grid"; readonly color: number; readonly line: number; readonly spacing: number }
  | { readonly kind: "tiles"; readonly tiles: ReadonlyArray<ModelId>; readonly color: number }

/** A model placed for looks only (it blocks nothing): at a floor point, turned `turn` radians, at the arena's scale. */
export interface Scenery {
  readonly model: ModelId
  readonly at: Vec2
  readonly turn: number
}

/**
 * The arena: its floor, its walls by placement (`back` and `front` edges,
 * `sorted` pillars, low `inner` walls), and scenery, with models at
 * `unitsPerMeter` world units per meter. What blocks movement and shots is the simulation's walls
 * (`content/arena.ts`); the look only dresses them, and scenery must not
 * look solid where nothing blocks.
 */
export interface ArenaLook {
  readonly unitsPerMeter: number
  readonly floor: FloorLook
  readonly walls: Readonly<Record<WallPlacement, WallLook>>
  readonly scenery: ReadonlyArray<Scenery>
}

/** The placeholder arena: the grid floor and plain boxes. */
export const placeholderArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: { kind: "grid", color: view.floor, line: view.floorGrid, spacing: view.floorGridSpacing },
  walls: { back: { kind: "box", color: view.wall }, front: { kind: "box", color: view.wall }, sorted: { kind: "box", color: view.wall }, inner: { kind: "box", color: view.wall } },
  scenery: []
}

/**
 * The courtyard (`art/environment/courtyard`): paving, stone walls (low ones
 * in front, so they never hide the player), stone pillars, and a few props
 * against the edges. 70 units per meter fits its large pillar to the
 * arena's 70-unit pillars.
 */
export const courtyardArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: { kind: "tiles", tiles: ["pavingPlain", "pavingPlain", "pavingCracked"], color: 0x2a2724 },
  walls: {
    back: { kind: "run", model: "wallStraight" },
    front: { kind: "run", model: "wallLow" },
    sorted: { kind: "pillar", models: ["pillarLarge", "pillarLargeChipped", "pillarSmall", "pillarSmallChipped"] },
    inner: { kind: "run", model: "wallLow" }
  },
  scenery: [
    { model: "brazier", at: { x: 70, y: 70 }, turn: 0 },
    { model: "brazier", at: { x: 1730, y: 70 }, turn: 0 },
    { model: "brazier", at: { x: 70, y: 1730 }, turn: 0 },
    { model: "urnJade", at: { x: 450, y: 34 }, turn: 0 },
    { model: "urnJade", at: { x: 1350, y: 34 }, turn: 0.4 },
    { model: "urnJade", at: { x: 34, y: 450 }, turn: Math.PI / 2 },
    { model: "urnJade", at: { x: 34, y: 1350 }, turn: Math.PI / 2 + 0.3 },
    { model: "rubbleStones", at: { x: 640, y: 50 }, turn: 0.7 },
    { model: "rubbleStones", at: { x: 46, y: 1120 }, turn: 2.1 },
    { model: "rocksTall", at: { x: 1150, y: 46 }, turn: 1.2 },
    { model: "rocksLow", at: { x: 1752, y: 1180 }, turn: 0.5 },
    { model: "rocksLow", at: { x: 760, y: 1756 }, turn: 2.6 }
  ]
}

/**
 * The flooded cistern (`art/environment/flooded-cistern`): worn flagstones
 * with grates, its pumps, pipes, and urns against the walls (the water is
 * the game's: its basins are hazards, see `content/arena.ts`).
 */
export const cisternArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: { kind: "tiles", tiles: ["cisternFloorPlain", "cisternFloorWorn", "cisternFloorPlain", "cisternFloorCracked", "cisternFloorPlain", "cisternFloorWorn", "cisternFloorPlain", "cisternFloorPlain", "cisternFloorCracked", "cisternFloorGrate"], color: 0x1f2a2c },
  walls: {
    back: { kind: "run", model: "cisternWallStraight" },
    front: { kind: "run", model: "cisternWallLow" },
    sorted: { kind: "pillar", models: ["cisternPillarLarge", "cisternPillarSmall"] },
    inner: { kind: "run", model: "cisternWallLow" }
  },
  scenery: [
    { model: "cisternPump", at: { x: 150, y: 60 }, turn: 0 },
    { model: "cisternPipeOutlet", at: { x: 900, y: 40 }, turn: 0 },
    { model: "cisternPump", at: { x: 1650, y: 60 }, turn: 0 },
    { model: "cisternValve", at: { x: 520, y: 26 }, turn: 0 },
    { model: "cisternValve", at: { x: 1280, y: 26 }, turn: 0 },
    { model: "cisternPipeStraight", at: { x: 22, y: 640 }, turn: Math.PI / 2 },
    { model: "cisternPipeStraight", at: { x: 22, y: 1160 }, turn: Math.PI / 2 },
    { model: "cisternUrn", at: { x: 34, y: 300 }, turn: 0.3 },
    { model: "cisternUrn", at: { x: 34, y: 1500 }, turn: 2.2 },
    { model: "cisternUrn", at: { x: 1766, y: 900 }, turn: 1.1 },
    { model: "cisternButtress", at: { x: 1770, y: 420 }, turn: Math.PI / 2 },
    { model: "cisternButtress", at: { x: 1770, y: 1380 }, turn: Math.PI / 2 },
    { model: "cisternUrn", at: { x: 600, y: 1768 }, turn: 0.7 },
    { model: "cisternUrn", at: { x: 1200, y: 1768 }, turn: 2.9 }
  ]
}

/**
 * The ember kilnworks (`art/environment/ember-kilnworks`): soot-dark
 * flagstones, furnaces and chimneys along the back, crates and barrels on the
 * sides (its fire pits are the game's: see `presentation/hazards.ts`).
 */
export const kilnworksArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: { kind: "tiles", tiles: ["kilnworksFloorPlain", "kilnworksFloorWorn", "kilnworksFloorCracked", "kilnworksFloorPlain"], color: 0x2a1d18 },
  walls: {
    back: { kind: "run", model: "kilnworksWallStraight" },
    front: { kind: "run", model: "kilnworksWallLow" },
    sorted: { kind: "pillar", models: ["kilnworksPillarLarge", "kilnworksPillarSmall"] },
    inner: { kind: "run", model: "kilnworksWallLow" }
  },
  scenery: [
    { model: "kilnworksFurnace", at: { x: 300, y: 60 }, turn: 0 },
    { model: "kilnworksChimney", at: { x: 620, y: 40 }, turn: 0 },
    { model: "kilnworksBoiler", at: { x: 1200, y: 50 }, turn: 0 },
    { model: "kilnworksFurnace", at: { x: 1550, y: 60 }, turn: 0 },
    { model: "kilnworksToolRack", at: { x: 900, y: 20 }, turn: 0 },
    { model: "kilnworksCrate", at: { x: 36, y: 380 }, turn: 0.3 },
    { model: "kilnworksBarrel", at: { x: 36, y: 460 }, turn: 0 },
    { model: "kilnworksCoalBin", at: { x: 40, y: 1250 }, turn: Math.PI / 2 },
    { model: "kilnworksAnvil", at: { x: 1765, y: 640 }, turn: Math.PI / 2 },
    { model: "kilnworksCrucible", at: { x: 1760, y: 1140 }, turn: 0.4 },
    { model: "kilnworksBarrel", at: { x: 1766, y: 1480 }, turn: 0 },
    { model: "kilnworksCrate", at: { x: 500, y: 1768 }, turn: 1.2 },
    { model: "kilnworksCrate", at: { x: 1300, y: 1768 }, turn: 2.4 }
  ]
}

/**
 * The overgrown sanctuary (`art/environment/overgrown-sanctuary`): mossy
 * flagstones, its low walls and pillars taken by roots, shrines and growth
 * along the edges.
 */
export const sanctuaryArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: { kind: "tiles", tiles: ["sanctuaryFloorPlain", "sanctuaryFloorWorn", "sanctuaryFloorCracked"], color: 0x1f2a1d },
  walls: {
    back: { kind: "run", model: "sanctuaryWallStraight" },
    front: { kind: "run", model: "sanctuaryWallLow" },
    sorted: { kind: "pillar", models: ["sanctuaryPillarLarge", "sanctuaryPillarSmall"] },
    inner: { kind: "run", model: "sanctuaryWallLow" }
  },
  scenery: [
    { model: "sanctuaryShrine", at: { x: 900, y: 40 }, turn: 0 },
    { model: "sanctuarySapling", at: { x: 420, y: 40 }, turn: 0.6 },
    { model: "sanctuarySapling", at: { x: 1380, y: 40 }, turn: 2.1 },
    { model: "sanctuaryRootClump", at: { x: 60, y: 60 }, turn: 0.8 },
    { model: "sanctuaryStump", at: { x: 1740, y: 60 }, turn: 0 },
    { model: "sanctuaryBush", at: { x: 36, y: 320 }, turn: Math.PI / 2 },
    { model: "sanctuaryFern", at: { x: 30, y: 1100 }, turn: 1 },
    { model: "sanctuaryFallenLog", at: { x: 36, y: 1500 }, turn: Math.PI / 2 },
    { model: "sanctuaryMushrooms", at: { x: 1766, y: 700 }, turn: 0.2 },
    { model: "sanctuaryShrineBroken", at: { x: 1760, y: 1250 }, turn: -Math.PI / 2 },
    { model: "sanctuaryTimberPost", at: { x: 1770, y: 1700 }, turn: 0 },
    { model: "sanctuaryBush", at: { x: 640, y: 1770 }, turn: 0.4 },
    { model: "sanctuaryFern", at: { x: 1150, y: 1772 }, turn: 2.3 }
  ]
}

/** Each arena's look, by its id (see `content/arena.ts`). */
export const arenaLooks: Readonly<Record<ArenaId, ArenaLook>> = {
  courtyard: courtyardArena,
  cistern: cisternArena,
  kilnworks: kilnworksArena,
  sanctuary: sanctuaryArena
}

/** Every model the looks use: loaded before the arena opens. */
export const modelsInLooks = (): ReadonlySet<ModelId> => {
  const ids = new Set<ModelId>()
  for (const look of [...Object.values(characterLooks), ...Object.values(enemyLooks)]) {
    if (look.kind !== "model") continue
    ids.add(look.model)
    for (const weapon of Object.values(look.held?.weapons ?? {})) ids.add(weapon)
  }
  for (const arena of Object.values(arenaLooks)) {
    for (const look of Object.values(arena.walls)) {
      if (look.kind === "run") ids.add(look.model)
      if (look.kind === "pillar") for (const id of look.models) ids.add(id)
    }
    if (arena.floor.kind === "tiles") for (const id of arena.floor.tiles) ids.add(id)
    for (const scenery of arena.scenery) ids.add(scenery.model)
  }
  return ids
}
