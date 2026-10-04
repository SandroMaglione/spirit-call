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
import type { TrailKind } from "./drop-trail.ts"
import type { ModelId } from "./models.ts"
import type { EnemyAttackClips } from "./enemy-pose.ts"

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
  readonly run: { readonly clip: string; readonly distance: number; readonly timeBased?: boolean }
  readonly attack?: ReadonlyArray<Shot>
  readonly power?: Shot
  readonly dash?: Shot
  readonly windup?: Shot
  readonly skills?: Partial<Record<SkillId, Shot>>
  readonly hurt?: Shot
}

/**
 * What a body sheds while it moves: about `rate` a second (at full speed),
 * thrown back from its back in `colors`, `size` world units across, each a
 * `kind` (a drop unless said): drops falling to the floor, about half
 * leaving a ripple there; embers drifting up and burning out; wisps curling
 * away as they drift back and fade.
 */
export interface Drops {
  readonly rate: number
  readonly colors: ReadonlyArray<number>
  readonly size: number
  readonly kind?: TrailKind
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
      /** Ease into or out of locomotion over these seconds; attack contacts remain exact. */
      readonly transitionSeconds?: number
      /** Optional phase clips for a particular enemy attack, keyed by its moveset id. */
      readonly attackClips?: Readonly<Record<string, EnemyAttackClips>>
      readonly widthFactor: number
      readonly heightFactor: number
      readonly moments?: Moments
      readonly held?: Held
      /** Drops shed behind it while it moves (a water spirit's trail; see `ShedSpiritDrops`). */
      readonly drops?: Drops
    }

/**
 * In the arena each character shows as her spirit (art/spirits/). The
 * Swordsman is wind, Gunner is fire, Tidecaller is water, and Stormcaller
 * is thunder.
 * Their idle and movement clips follow the body; moves without clips
 * play over those loops.
 */
const waterSpirit: BodyLook = {
  kind: "model",
  model: "waterSpirit",
  widthFactor: 1.5,
  heightFactor: view.bodyHeightFactor,
  moments: { idle: "Idle", run: { clip: "Run", distance: 120 } },
  drops: { rate: 30, colors: [0x8eebff, 0x44b6ff, 0xe0f9ff], size: 2.4 }
}

/** The fire spirit, for the fire character (the Gunner): it bobs and flickers, hops, and sheds embers. */
const fireSpirit: BodyLook = {
  kind: "model",
  model: "fireSpirit",
  widthFactor: 1.5,
  heightFactor: view.bodyHeightFactor,
  moments: { idle: "Idle", run: { clip: "Run", distance: 120 } },
  drops: { rate: 34, colors: [0xffd54a, 0xff8a3d, 0xe6391f, 0xfff176], size: 2.6, kind: "ember" }
}

/** The wind spirit, for the wind character (the Swordsman): it bobs on a breeze, its leaves fluttering, hops, and sheds curling wisps. */
const windSpirit: BodyLook = {
  kind: "model",
  model: "windSpirit",
  widthFactor: 1.5,
  heightFactor: view.bodyHeightFactor,
  moments: { idle: "Idle", run: { clip: "Run", distance: 120 } },
  drops: { rate: 30, colors: [0x8ee3c1, 0x4cc7a7, 0xbfefdf, 0xffffff], size: 2.2, kind: "wisp" }
}

/** Stormcaller's thunder spirit: it hovers, leans into movement, and trails violet and gold sparks. */
const thunderSpirit: BodyLook = {
  kind: "model",
  model: "thunderSpirit",
  widthFactor: 1.5,
  heightFactor: view.bodyHeightFactor,
  moments: { idle: "Idle", run: { clip: "Run", distance: 120 } },
  drops: { rate: 26, colors: [0xffe66d, 0xc9b8ff, 0x7a6bff], size: 1.8, kind: "ember" }
}

export const characterLooks: Readonly<Record<CharacterId, BodyLook>> = {
  swordsman: windSpirit,
  gunner: fireSpirit,
  tidecaller: waterSpirit,
  stormcaller: thunderSpirit
}

const enemyCapsule = (kind: EnemyKind): BodyLook => ({ kind: "capsule", color: view.enemies[kind].color, widthFactor: view.enemies[kind].widthFactor, heightFactor: view.enemies[kind].heightFactor })

const enemyModel = (kind: EnemyKind, model: ModelId, stride: number, attackClips?: Readonly<Record<string, EnemyAttackClips>>): Extract<BodyLook, { kind: "model" }> => ({
  kind: "model", model, batched: true, ...(attackClips === undefined ? {} : { attackClips }),
  widthFactor: view.enemies[kind].widthFactor, heightFactor: view.enemies[kind].heightFactor,
  moments: { idle: "Idle", run: { clip: kind === "dummy" ? "Idle" : "Run", distance: stride }, hurt: "Hurt" }
})

export const enemyLooks: Readonly<Record<EnemyKind, BodyLook>> = {
  dummy: enemyModel("dummy", "enemyDummy", 1),
  chaser: enemyModel("chaser", "enemyChaser", 48),
  shooter: enemyModel("shooter", "enemyShooter", 62, {
    spray: { windup: "WindupSpray", active: "ActiveSpray", recovery: "RecoverySpray" }
  }),
  brute: enemyModel("brute", "enemyBrute", 60, {
    stomp: { windup: "WindupStomp", active: "ActiveStomp", recovery: "RecoveryStomp" }
  }),
  swarmer: enemyModel("swarmer", "enemySwarmer", 55),
  charger: enemyModel("charger", "enemyCharger", 78),
  sniper: enemyModel("sniper", "enemySniper", 60),
  guardian: enemyModel("guardian", "enemyGuardian", 54),
  // Placeholders until they have models: a capsule in their color.
  warden: enemyCapsule("warden"),
  stalker: enemyCapsule("stalker"),
  volatile: enemyCapsule("volatile"),
  galeCaster: {
    ...enemyModel("galeCaster", "enemyGaleCaster", 140), transitionSeconds: .18,
    moments: { idle: "Idle", run: { clip: "Run", distance: 140, timeBased: true }, hurt: "Hurt" }
  },
  juggernaut: {
    ...enemyModel("juggernaut", "enemyJuggernaut", 90, {
      quake: { windup: "WindupQuake", active: "ActiveQuake", recovery: "RecoveryQuake" }
    }), transitionSeconds: .14
  },
  sparringDummy: enemyCapsule("sparringDummy"),
  heavyDummy: enemyCapsule("heavyDummy")
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
 * - `prop`: `model` at the arena's scale, turned `turn` radians, standing on
 *   the middle of the box (one of the arena's props: see `ArenaLook.props`).
 */
export type WallLook =
  | { readonly kind: "box"; readonly color: number }
  | { readonly kind: "run"; readonly model: ModelId }
  | { readonly kind: "pillar"; readonly models: ReadonlyArray<ModelId> }
  | { readonly kind: "prop"; readonly model: ModelId; readonly turn: number }

/** One floor tile chosen by hand: the piece lying on the tile at `column`, `row` (from 0, as hazards count them). */
export interface Inlay {
  readonly model: ModelId
  readonly column: number
  readonly row: number
}

/**
 * The floor: the flat `grid`, or `tiles` of square floor pieces (variants
 * picked by place, turned at random) over a base of `color`. The tiles along
 * the walls can be others (`border`), and single tiles chosen by hand
 * (`inlays`: a medallion in the middle).
 */
export type FloorLook =
  | { readonly kind: "grid"; readonly color: number; readonly line: number; readonly spacing: number }
  | { readonly kind: "tiles"; readonly tiles: ReadonlyArray<ModelId>; readonly color: number; readonly border?: ReadonlyArray<ModelId>; readonly inlays?: ReadonlyArray<Inlay> }

/** A model placed for looks only (it blocks nothing): at a floor point, turned `turn` radians, at the arena's scale. */
export interface Scenery {
  readonly model: ModelId
  readonly at: Vec2
  readonly turn: number
}

/** One tone of a pool's surface: its color, the band along its edges, the marks on it. */
export interface PoolTones {
  readonly surface: number
  readonly band: number
  readonly mark: number
}

/** An arena's own pools (see `presentation/hazards.ts`): their tones in place of `view.hazards`', and a stone `rim` (its color and width) framing them. */
export interface PoolLook {
  readonly fire?: PoolTones
  readonly water?: PoolTones
  readonly rim?: { readonly color: number; readonly width: number }
}

/** The light on an arena, in place of `view.light`'s colors (the intensities stay). */
export interface LightLook {
  readonly sky: number
  readonly ground: number
  readonly sun: number
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
  /** The arena's props, in the order `content/arena.ts` lists them (what blocks is the content's box; this is the model standing on it, turned `turn` radians). */
  readonly props?: ReadonlyArray<{ readonly model: ModelId; readonly turn: number }>
  /** What shows beyond the arena's walls: one flat color (`view.background` otherwise). */
  readonly background?: number
  readonly pools?: PoolLook
  readonly light?: LightLook
  /** Where a flame burns in its scenery (a brazier's bowl: a floor point and how high over it, in world units): it flickers and sheds embers. */
  readonly fires?: ReadonlyArray<{ readonly at: Vec2; readonly height: number }>
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

/**
 * The basalt citadel (`art/environment/basalt-citadel`): a keep's court of
 * dark stone with a medallion in its middle. Its north wall is laid out the
 * same on both sides of a broken throne (banners, braziers); what the
 * garrison left lies about the other walls. All of it is props: it blocks
 * (see `content/arena.ts`).
 */
export const citadelArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: {
    kind: "tiles",
    tiles: ["citadelFloorPlain", "citadelFloorPlain", "citadelFloorPlain", "citadelFloorCracked"],
    color: 0x1c1a1d,
    border: ["citadelFloorWorn"],
    inlays: [
      { model: "citadelFloorRadial", column: 6, row: 6 },
      { model: "citadelFloorInset", column: 5, row: 6 },
      { model: "citadelFloorInset", column: 7, row: 6 },
      { model: "citadelFloorInset", column: 6, row: 5 },
      { model: "citadelFloorInset", column: 6, row: 7 },
      { model: "citadelFloorSmall", column: 5, row: 5 },
      { model: "citadelFloorSmall", column: 7, row: 5 },
      { model: "citadelFloorSmall", column: 5, row: 7 },
      { model: "citadelFloorSmall", column: 7, row: 7 }
    ]
  },
  walls: {
    back: { kind: "run", model: "citadelWallStraight" },
    front: { kind: "run", model: "citadelWallLow" },
    sorted: { kind: "pillar", models: ["citadelPillarLarge", "citadelPillarSmall"] },
    inner: { kind: "run", model: "citadelWallLow" }
  },
  scenery: [],
  props: [
    { model: "citadelThroneBroken", turn: 0 },
    { model: "citadelBrazierLarge", turn: 0 },
    { model: "citadelBrazierLarge", turn: 0 },
    { model: "citadelBannerTall", turn: 0 },
    { model: "citadelBannerTall", turn: 0 },
    { model: "citadelBrazierSmall", turn: 0 },
    { model: "citadelBrazierSmall", turn: 0 },
    { model: "citadelGargoyle", turn: 0 },
    { model: "citadelGargoyle", turn: 0 },
    { model: "citadelWeaponRack", turn: Math.PI / 2 },
    { model: "citadelSiegeCrate", turn: 0.35 },
    { model: "citadelBasaltRubble", turn: 1.1 },
    { model: "citadelBasaltSpires", turn: 0.5 },
    { model: "citadelBasaltRubble", turn: 2.5 },
    { model: "citadelShieldRack", turn: -Math.PI / 2 },
    { model: "citadelDrum", turn: 0.3 },
    { model: "citadelWarTable", turn: Math.PI / 2 + 0.12 },
    { model: "citadelSiegeCrate", turn: -0.5 },
    { model: "citadelSupplyCache", turn: 0.15 }
  ],
  background: 0x191c23,
  // Fire pits framed in the court's stone, their fire a deeper ember than the plain orange.
  pools: {
    fire: { surface: 0xd9481c, band: 0x4a1a12, mark: 0xffb347 },
    rim: { color: 0x4a5163, width: 11 }
  },
  // Cold light on the stone, so the braziers' and the pits' fire stands out.
  light: { sky: 0xeef2ff, ground: 0x84889a, sun: 0xfff4e6 },
  fires: [
    { at: { x: 700, y: 35 }, height: 84 },
    { at: { x: 1100, y: 35 }, height: 84 },
    { at: { x: 24, y: 24 }, height: 58 },
    { at: { x: 1776, y: 24 }, height: 58 }
  ]
}

/** The saltwind harbor (`art/environment/saltwind-harbor`): weathered planks of stone, crates, bollards, a boat hull. */
export const harborArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: { kind: "tiles", tiles: ["harborFloorPlain", "harborFloorWorn", "harborFloorPlain", "harborFloorCracked"], color: 0x26333a },
  walls: {
    back: { kind: "run", model: "harborWallStraight" },
    front: { kind: "run", model: "harborWallLow" },
    sorted: { kind: "pillar", models: ["harborPillarLarge", "harborPillarSmall"] },
    inner: { kind: "run", model: "harborWallLow" }
  },
  scenery: [
    { model: "harborBarrelStack", at: { x: 260, y: 50 }, turn: 0 },
    { model: "harborCapstan", at: { x: 700, y: 55 }, turn: 0 },
    { model: "harborNetRack", at: { x: 1100, y: 20 }, turn: 0 },
    { model: "harborCargoPallet", at: { x: 1500, y: 45 }, turn: 0.2 },
    { model: "harborAnchor", at: { x: 25, y: 400 }, turn: Math.PI / 2 },
    { model: "harborBollard", at: { x: 30, y: 800 }, turn: 0 },
    { model: "harborFishCrate", at: { x: 30, y: 1150 }, turn: Math.PI / 2 },
    { model: "harborLifeRing", at: { x: 40, y: 1500 }, turn: 0 },
    { model: "harborJettyPost", at: { x: 1770, y: 300 }, turn: 0 },
    { model: "harborBuoy", at: { x: 1765, y: 700 }, turn: 0 },
    { model: "harborWaveRock", at: { x: 1755, y: 1150 }, turn: 0.7 },
    { model: "harborBollard", at: { x: 1770, y: 1500 }, turn: 0 },
    { model: "harborBoatHull", at: { x: 500, y: 1760 }, turn: 0 },
    { model: "harborLanternHook", at: { x: 1250, y: 1765 }, turn: 0 }
  ]
}

/** The ochre necropolis (`art/environment/ochre-necropolis`): sand-worn stone, a winged statue, urns and sarcophagi. */
export const necropolisArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: { kind: "tiles", tiles: ["necropolisFloorPlain", "necropolisFloorWorn", "necropolisFloorPlain", "necropolisFloorCracked"], color: 0x3a2c1e },
  walls: {
    back: { kind: "run", model: "necropolisWallStraight" },
    front: { kind: "run", model: "necropolisWallLow" },
    sorted: { kind: "pillar", models: ["necropolisPillarLarge", "necropolisPillarSmall"] },
    inner: { kind: "run", model: "necropolisWallLow" }
  },
  scenery: [
    { model: "necropolisWingStatue", at: { x: 900, y: 30 }, turn: 0 },
    { model: "necropolisTorchStand", at: { x: 560, y: 30 }, turn: 0 },
    { model: "necropolisTorchStand", at: { x: 1240, y: 30 }, turn: 0 },
    { model: "necropolisUrnTall", at: { x: 250, y: 40 }, turn: 0 },
    { model: "necropolisCanopicJars", at: { x: 1550, y: 40 }, turn: 0.3 },
    { model: "necropolisSandRockLarge", at: { x: 60, y: 350 }, turn: 1.2 },
    { model: "necropolisDeadShrub", at: { x: 30, y: 900 }, turn: 0 },
    { model: "necropolisSarcophagus", at: { x: 40, y: 1350 }, turn: 0 },
    { model: "necropolisSandRockSmall", at: { x: 1755, y: 400 }, turn: 0.4 },
    { model: "necropolisOfferingTable", at: { x: 1765, y: 900 }, turn: Math.PI / 2 },
    { model: "necropolisUrnBroken", at: { x: 1760, y: 1350 }, turn: 0.8 },
    { model: "necropolisSandDrift", at: { x: 600, y: 1760 }, turn: 0 },
    { model: "necropolisObeliskBroken", at: { x: 1250, y: 1760 }, turn: 0 }
  ]
}

/** The frostbound monastery (`art/environment/frostbound-monastery`): cold stone, a shrine and banners, snow along the walls. */
export const monasteryArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: { kind: "tiles", tiles: ["monasteryFloorPlain", "monasteryFloorWorn", "monasteryFloorPlain", "monasteryFloorCracked"], color: 0x2a3036 },
  walls: {
    back: { kind: "run", model: "monasteryWallStraight" },
    front: { kind: "run", model: "monasteryWallLow" },
    sorted: { kind: "pillar", models: ["monasteryPillarLarge", "monasteryPillarSmall"] },
    inner: { kind: "run", model: "monasteryWallLow" }
  },
  scenery: [
    { model: "monasteryShrine", at: { x: 900, y: 40 }, turn: 0 },
    { model: "monasteryBanner", at: { x: 500, y: 25 }, turn: 0 },
    { model: "monasteryBanner", at: { x: 1300, y: 25 }, turn: 0 },
    { model: "monasteryLanternPost", at: { x: 40, y: 40 }, turn: 0 },
    { model: "monasteryLanternPost", at: { x: 1760, y: 40 }, turn: 0 },
    { model: "monasteryBench", at: { x: 30, y: 500 }, turn: Math.PI / 2 },
    { model: "monasterySnowdrift", at: { x: 50, y: 1000 }, turn: 0.3 },
    { model: "monasteryIceCluster", at: { x: 35, y: 1450 }, turn: 0.6 },
    { model: "monasteryBell", at: { x: 1765, y: 500 }, turn: 0 },
    { model: "monasterySnowRocks", at: { x: 1755, y: 1000 }, turn: 1.1 },
    { model: "monasteryBrazier", at: { x: 1765, y: 1450 }, turn: 0 },
    { model: "monasterySnowdrift", at: { x: 600, y: 1765 }, turn: 2.2 },
    { model: "monasteryIceCluster", at: { x: 1250, y: 1768 }, turn: 0.2 }
  ]
}

/** Each arena's look, by its id (see `content/arena.ts`). */
export const arenaLooks: Readonly<Record<ArenaId, ArenaLook>> = {
  courtyard: courtyardArena,
  // The training ground is laid in the courtyard's paving.
  trainingGround: courtyardArena,
  cistern: cisternArena,
  kilnworks: kilnworksArena,
  sanctuary: sanctuaryArena,
  citadel: citadelArena,
  harbor: harborArena,
  necropolis: necropolisArena,
  monastery: monasteryArena
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
    if (arena.floor.kind === "tiles") for (const id of [...(arena.floor.border ?? []), ...(arena.floor.inlays ?? []).map((inlay) => inlay.model)]) ids.add(id)
    for (const piece of [...arena.scenery, ...(arena.props ?? [])]) ids.add(piece.model)
  }
  return ids
}
