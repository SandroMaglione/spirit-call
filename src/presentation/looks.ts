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
      /** Raised staff pose while the simulation's ally ward forms, held while linked. */
      readonly wardClip?: string
      readonly widthFactor: number
      readonly heightFactor: number
      readonly moments?: Moments
      readonly held?: Held
      /** Its eye nodes (and what blinks with them), by their Blender names: held wide or narrow at moments of the fight (see `DrawPlayer`). */
      readonly eyes?: ReadonlyArray<string>
      /** Drops shed behind it while it moves (a water spirit's trail; see `ShedSpiritDrops`). */
      readonly drops?: Drops
    }

/**
 * In the arena each character shows as her spirit (art/spirits/). The
 * Swordsman is wind, Gunner is fire, Tidecaller is water, and Stormcaller
 * is thunder.
 * Their idle and movement clips follow the body; every spirit has the
 * same combat clips (art/spirits/tools/moves.py), each in its character's
 * style: a combo's blows (the last one bigger), the charged move, the
 * dash, a hit taken, and her special and ultimate.
 */
const spiritMoments = (blows: number, special: SkillId, ultimate: SkillId): Moments => ({
  idle: "Idle",
  run: { clip: "Run", distance: 120 },
  // Her combo's blows, one way then the other, the last one bigger. Each blow's pose lands with the simulation's blow (`contact`: its frame in moves.py's `CONTACT`, at 30 a second).
  attack: Array.from({ length: blows }, (_, blow) => blow === blows - 1 ? { clip: "AttackC", contact: 6 / 30 } : { clip: blow % 2 === 0 ? "AttackA" : "AttackB", contact: 4 / 30 }),
  power: { clip: "Power", contact: 6 / 30 },
  dash: "Dash",
  hurt: "Hurt",
  skills: { [special]: "Cast", [ultimate]: "Ultimate" }
})

const spiritEyes = ["Eye.L", "Eye.R"]

const waterSpirit: BodyLook = {
  kind: "model",
  model: "waterSpirit",
  widthFactor: 1.5,
  heightFactor: view.bodyHeightFactor,
  moments: spiritMoments(3, "tidalWave", "tide"),
  eyes: spiritEyes,
  drops: { rate: 30, colors: [0x8eebff, 0x44b6ff, 0xe0f9ff], size: 2.4 }
}

/** The fire spirit, for the fire character (the Gunner): it bobs and flickers, hops, and sheds embers. */
const fireSpirit: BodyLook = {
  kind: "model",
  model: "fireSpirit",
  widthFactor: 1.5,
  heightFactor: view.bodyHeightFactor,
  moments: spiritMoments(3, "flareJump", "barrage"),
  eyes: spiritEyes,
  drops: { rate: 34, colors: [0xffd54a, 0xff8a3d, 0xe6391f, 0xfff176], size: 2.6, kind: "ember" }
}

/** The wind spirit, for the wind character (the Swordsman): it bobs on a breeze, its leaves fluttering, hops, and sheds curling wisps. */
const windSpirit: BodyLook = {
  kind: "model",
  model: "windSpirit",
  widthFactor: 1.5,
  heightFactor: view.bodyHeightFactor,
  moments: spiritMoments(4, "bladeWave", "cyclone"),
  eyes: spiritEyes,
  drops: { rate: 30, colors: [0x8ee3c1, 0x4cc7a7, 0xbfefdf, 0xffffff], size: 2.2, kind: "wisp" }
}

/** Stormcaller's thunder spirit: it hovers, leans into movement, and trails violet and gold sparks. */
const thunderSpirit: BodyLook = {
  kind: "model",
  model: "thunderSpirit",
  widthFactor: 1.5,
  heightFactor: view.bodyHeightFactor,
  moments: spiritMoments(3, "sparkTotem", "thunderclap"),
  eyes: [...spiritEyes, "Rim.L", "Rim.R"],
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
  charger: enemyModel("charger", "enemyCharger", 52, { swipe: { windup: "WindupSwipe", active: "ActiveSwipe", recovery: "RecoverySwipe" } }),
  sniper: enemyModel("sniper", "enemySniper", 66),
  guardian: enemyModel("guardian", "enemyGuardian", 54, { thrust: { windup: "WindupThrust", active: "ActiveThrust", recovery: "RecoveryThrust" } }),
  warden: { ...enemyModel("warden", "enemyWarden", 70), wardClip: "Buff" },
  stalker: enemyModel("stalker", "enemyStalker", 64, {
    blink: { windup: "WindupBlink", active: "ActiveBlink", recovery: "RecoveryBlink" }
  }),
  volatile: enemyModel("volatile", "enemyVolatile", 56),
  galeCaster: {
    ...enemyModel("galeCaster", "enemyGaleCaster", 140), transitionSeconds: .18,
    moments: { idle: "Idle", run: { clip: "Run", distance: 140, timeBased: true }, hurt: "Hurt" }
  },
  juggernaut: {
    ...enemyModel("juggernaut", "enemyJuggernaut", 90, {
      quake: { windup: "WindupQuake", active: "ActiveQuake", recovery: "RecoveryQuake" }
    }), transitionSeconds: .14
  },
  // Placeholders until they have models: a capsule in their color.
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
 * the walls can be others (`border`, running along their wall), and single
 * tiles chosen by hand (`inlays`: a medallion in the middle). A `tint`
 * multiplies the tiles' own colors (a kiln's floor darkened by soot).
 */
export type FloorLook =
  | { readonly kind: "grid"; readonly color: number; readonly line: number; readonly spacing: number }
  | { readonly kind: "tiles"; readonly tiles: ReadonlyArray<ModelId>; readonly color: number; readonly border?: ReadonlyArray<ModelId>; readonly inlays?: ReadonlyArray<Inlay>; readonly tint?: number; readonly apronTiles?: number }

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

/** Four stone pillars frame an open court, with low benches and planters for cover. Ritual goods dress the paving; a pergola, gate, alcove and fountain stand beyond the boundary. */
export const courtyardArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: {
    kind: "tiles",
    apronTiles: 2,
    tiles: ["pavingPlain", "pavingPlain", "pavingPlain", "pavingCracked"],
    color: 0x2a2724
  },
  walls: {
    back: { kind: "run", model: "wallStraight" },
    front: { kind: "run", model: "wallLow" },
    sorted: { kind: "pillar", models: ["pillarLarge", "pillarSmall"] },
    inner: { kind: "run", model: "wallLow" }
  },
  scenery: [
    { model: "courtyardStudyCourtyardPergola", at: { x: 480, y: -150 }, turn: 0 },
    { model: "courtyardStudyCarvedGateway", at: { x: 900, y: -110 }, turn: 0 },
    { model: "courtyardStudyOfferingAlcove", at: { x: 1360, y: -150 }, turn: 0 },
    { model: "courtyardStudyTieredFountain", at: { x: -145, y: 900 }, turn: 0 },
    { model: "courtyardStudyJadeBowl", at: { x: 440, y: 65 }, turn: 0 },
    { model: "courtyardStudyIncenseTray", at: { x: 870, y: 60 }, turn: 0 },
    { model: "courtyardStudyJadeJar", at: { x: 1240, y: 60 }, turn: 0 },
    { model: "courtyardStudyVotivePlate", at: { x: 1370, y: 60 }, turn: 0 },
    { model: "courtyardStudyStoneChips", at: { x: 285, y: 970 }, turn: 0 },
    { model: "courtyardStudyJadeBowl", at: { x: -100, y: 960 }, turn: 0 },
    { model: "courtyardStudyIncenseTray", at: { x: 1270, y: -145 }, turn: 0 },
    { model: "courtyardStudyJadeJar", at: { x: 550, y: -135 }, turn: 0 },
    { model: "courtyardStudyVotivePlate", at: { x: 800, y: -100 }, turn: 0 },
    { model: "courtyardStudyStoneChips", at: { x: 930, y: 350 }, turn: Math.PI / 2 },
    { model: "courtyardStudyStoneChips", at: { x: 1450, y: 930 }, turn: Math.PI },
    { model: "courtyardStudyStoneChips", at: { x: 90, y: 1240 }, turn: Math.PI / 2 },
    { model: "courtyardStudyJadeBowl", at: { x: 75, y: 560 }, turn: 0 },
    { model: "courtyardStudyVotivePlate", at: { x: 950, y: 1460 }, turn: 0 }
  ],
  props: [
    { model: "courtyardStudyCompactBrazier", turn: 0 },
    { model: "courtyardStudyCompactBrazier", turn: 0 },
    { model: "courtyardStudyCompactBrazier", turn: 0 },
    { model: "courtyardStudyCompactBrazier", turn: 0 },
    { model: "courtyardStudyHandledUrn", turn: 0 },
    { model: "courtyardStudyHandledUrn", turn: 0 },
    { model: "courtyardStudyCarvedTablet", turn: 0 },
    { model: "courtyardStudyHandledUrn", turn: Math.PI / 2 },
    { model: "courtyardStudyHandledUrn", turn: Math.PI / 2 },
    { model: "courtyardStudyFernPlanter", turn: 0 },
    { model: "courtyardStudyFernPlanter", turn: 0 },
    { model: "courtyardStudyStoneBench", turn: Math.PI / 2 },
    { model: "courtyardStudyStoneBench", turn: Math.PI / 2 }
  ],
  background: 0x1f1e1c,
  fires: [
    { at: { x: 17, y: 17 }, height: 28 },
    { at: { x: 1783, y: 17 }, height: 28 },
    { at: { x: 17, y: 1783 }, height: 28 },
    { at: { x: 1783, y: 1783 }, height: 28 }
  ]
}

/** The basins and low walls keep their water tactics. Compact machinery and repair benches provide cover; pump banks, valves and a settling tank fill the exterior service yard. */
export const cisternArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: {
    kind: "tiles",
    apronTiles: 2,
    tiles: ["cisternFloorPlain", "cisternFloorPlain", "cisternFloorPlain", "cisternFloorPlain", "cisternFloorPlain", "cisternFloorPlain", "cisternFloorCracked", "cisternFloorGrate"],
    color: 0x1f2a2c,
    border: ["cisternFloorWorn"],
    inlays: [
      { model: "cisternFloorInset", column: 6, row: 6 },
      { model: "cisternFloorSmall", column: 5, row: 6 },
      { model: "cisternFloorSmall", column: 7, row: 6 },
      { model: "cisternFloorSmall", column: 6, row: 5 },
      { model: "cisternFloorSmall", column: 6, row: 7 },
      { model: "cisternFloorSmall", column: 5, row: 5 },
      { model: "cisternFloorSmall", column: 5, row: 7 },
      { model: "cisternFloorSmall", column: 7, row: 5 },
      { model: "cisternFloorSmall", column: 7, row: 7 }
    ]
  },
  walls: {
    back: { kind: "run", model: "cisternWallStraight" },
    front: { kind: "run", model: "cisternWallLow" },
    sorted: { kind: "pillar", models: ["cisternPillarLarge", "cisternPillarSmall"] },
    inner: { kind: "run", model: "cisternWallLow" }
  },
  scenery: [
    { model: "cisternStudyPumpBank", at: { x: 380, y: -135 }, turn: 0 },
    { model: "cisternStudyValveManifold", at: { x: 900, y: -125 }, turn: 0 },
    { model: "cisternStudyRepairCanopy", at: { x: 1440, y: -155 }, turn: 0 },
    { model: "cisternStudySettlingTank", at: { x: -145, y: 900 }, turn: 0 },
    { model: "cisternStudyPipeFitting", at: { x: 260, y: 65 }, turn: 0 },
    { model: "cisternStudyGasketStack", at: { x: 410, y: 65 }, turn: 0 },
    { model: "cisternStudyPressureGauge", at: { x: 640, y: 65 }, turn: 0 },
    { model: "cisternStudyRepairTools", at: { x: 1400, y: 65 }, turn: 0 },
    { model: "cisternStudyWaterJar", at: { x: 1540, y: 65 }, turn: 0 },
    { model: "cisternStudyRepairTools", at: { x: 460, y: 1190 }, turn: 0 },
    { model: "cisternStudyPipeFitting", at: { x: 390, y: 1240 }, turn: 0 },
    { model: "cisternStudyWaterJar", at: { x: 70, y: 670 }, turn: 0 },
    { model: "cisternStudyGasketStack", at: { x: 70, y: 1180 }, turn: 0 },
    { model: "cisternStudyPressureGauge", at: { x: 1350, y: 460 }, turn: 0 },
    { model: "cisternStudyRepairTools", at: { x: 1350, y: -140 }, turn: 0 },
    { model: "cisternStudyWaterJar", at: { x: 1550, y: -150 }, turn: 0 },
    { model: "cisternStudyPipeFitting", at: { x: -90, y: 980 }, turn: 0 },
    { model: "cisternStudyGasketStack", at: { x: -180, y: 1010 }, turn: 0 }
  ],
  props: [
    { model: "cisternStudyMasonryOutlet", turn: 0 },
    { model: "cisternStudyHandPump", turn: 0 },
    { model: "cisternStudyHandPump", turn: 0 },
    { model: "cisternStudyValveWheel", turn: 0 },
    { model: "cisternStudyValveWheel", turn: 0 },
    { model: "cisternStudySupportedPipe", turn: Math.PI / 2 },
    { model: "cisternStudySupportedPipe", turn: Math.PI / 2 },
    { model: "cisternStudySupportedPipe", turn: Math.PI / 2 },
    { model: "cisternStudySupportedPipe", turn: Math.PI / 2 },
    { model: "cisternStudyServiceBench", turn: Math.PI / 2 },
    { model: "cisternStudyServiceBench", turn: 0 },
    { model: "cisternStudyHandPump", turn: 0 }
  ],
  background: 0x14201f,
  // Basins in the cistern's own grey-green stone, their water a little greener.
  pools: {
    water: { surface: 0x2e8aa6, band: 0x86cfd6, mark: 0xd2f0f0 },
    rim: { color: 0x6f8f92, width: 11 }
  },
  light: { sky: 0xeafbff, ground: 0x809696, sun: 0xf4ffff }
}

/** Fire trenches divide the foundry. Low casting benches and compact machinery interrupt its flanks; the furnace, chimney and covered work bays stand on the exterior paving. */
export const kilnworksArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: {
    kind: "tiles",
    apronTiles: 2,
    tiles: ["kilnworksFloorPlain", "kilnworksFloorPlain", "kilnworksFloorPlain", "kilnworksFloorCracked"],
    color: 0x1d1614,
    border: ["kilnworksFloorWorn"],
    tint: 0x8a8c92,
    inlays: [
      { model: "kilnworksFloorInset", column: 6, row: 6 },
      { model: "kilnworksFloorSmall", column: 5, row: 6 },
      { model: "kilnworksFloorSmall", column: 7, row: 6 },
      { model: "kilnworksFloorSmall", column: 6, row: 5 },
      { model: "kilnworksFloorSmall", column: 6, row: 7 },
      { model: "kilnworksFloorSmall", column: 5, row: 5 },
      { model: "kilnworksFloorSmall", column: 5, row: 7 },
      { model: "kilnworksFloorSmall", column: 7, row: 5 },
      { model: "kilnworksFloorSmall", column: 7, row: 7 }
    ]
  },
  walls: {
    back: { kind: "run", model: "kilnworksWallStraight" },
    front: { kind: "run", model: "kilnworksWallLow" },
    sorted: { kind: "pillar", models: ["kilnworksPillarLarge", "kilnworksPillarSmall"] },
    inner: { kind: "run", model: "kilnworksWallLow" }
  },
  scenery: [
    { model: "kilnworksStudyForgingBay", at: { x: 400, y: -155 }, turn: 0 },
    { model: "kilnworksStudyBrickFurnace", at: { x: 900, y: -130 }, turn: 0 },
    { model: "kilnworksStudyButtressedChimney", at: { x: 1300, y: -130 }, turn: 0 },
    { model: "kilnworksStudyCastingStation", at: { x: -145, y: 1000 }, turn: Math.PI / 2 },
    { model: "kilnworksStudyIronIngots", at: { x: 520, y: 65 }, turn: 0 },
    { model: "kilnworksStudyTongsTray", at: { x: 840, y: 60 }, turn: 0 },
    { model: "kilnworksStudyCoalPile", at: { x: 1300, y: 65 }, turn: 0 },
    { model: "kilnworksStudySmallCrucible", at: { x: 1450, y: 60 }, turn: 0 },
    { model: "kilnworksStudyCastingMould", at: { x: 1180, y: 65 }, turn: 0 },
    { model: "kilnworksStudyIronIngots", at: { x: 540, y: 840 }, turn: 0 },
    { model: "kilnworksStudyTongsTray", at: { x: 1260, y: 950 }, turn: 0 },
    { model: "kilnworksStudySmallCrucible", at: { x: 1280, y: 490 }, turn: 0 },
    { model: "kilnworksStudyCastingMould", at: { x: 1190, y: 1725 }, turn: 0 },
    { model: "kilnworksStudyCoalPile", at: { x: 65, y: 690 }, turn: 0 },
    { model: "kilnworksStudyIronIngots", at: { x: -100, y: 950 }, turn: 0 },
    { model: "kilnworksStudyCastingMould", at: { x: -105, y: 1050 }, turn: 0 },
    { model: "kilnworksStudySmallCrucible", at: { x: 900, y: -75 }, turn: 0 },
    { model: "kilnworksStudyCoalPile", at: { x: 1230, y: -130 }, turn: 0 }
  ],
  props: [
    { model: "kilnworksStudyHammerRack", turn: 0 },
    { model: "kilnworksStudyCoalBin", turn: 0 },
    { model: "kilnworksStudyCoalBin", turn: 0 },
    { model: "kilnworksStudyCompactBoiler", turn: 0 },
    { model: "kilnworksStudyCastingBench", turn: Math.PI / 2 },
    { model: "kilnworksStudyHammerRack", turn: Math.PI / 2 },
    { model: "kilnworksStudyCoalBin", turn: Math.PI / 2 },
    { model: "kilnworksStudyCoalBin", turn: 0 },
    { model: "kilnworksStudyCastingBench", turn: 0 },
    { model: "kilnworksStudyCastingBench", turn: 0 },
    { model: "kilnworksStudyCompactAnvil", turn: 0 },
    { model: "kilnworksStudyCompactBoiler", turn: 0 }
  ],
  background: 0x1a1412,
  // Fire trenches framed in dark iron-grey stone.
  pools: {
    fire: { surface: 0xd9481c, band: 0x4a1a12, mark: 0xffb347 },
    rim: { color: 0x4d4643, width: 11 }
  },
  // Warm light, as from the furnaces.
  light: { sky: 0xfff2e8, ground: 0x94847c, sun: 0xffe9d6 }
}

/** Rooted saplings replace the corner pillars along the sanctuary's lanes. Low growth and fallen leaves dress the ground; rooted ruins and the shrine grove frame the exterior. */
export const sanctuaryArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: {
    kind: "tiles",
    apronTiles: 2,
    tiles: ["sanctuaryFloorPlain", "sanctuaryFloorPlain", "sanctuaryFloorPlain", "sanctuaryFloorCracked"],
    color: 0x1f2a1d,
    border: ["sanctuaryFloorWorn"],
    inlays: [
      { model: "sanctuaryFloorInset", column: 6, row: 6 },
      { model: "sanctuaryFloorSmall", column: 5, row: 6 },
      { model: "sanctuaryFloorSmall", column: 7, row: 6 },
      { model: "sanctuaryFloorSmall", column: 6, row: 5 },
      { model: "sanctuaryFloorSmall", column: 6, row: 7 },
      { model: "sanctuaryFloorSmall", column: 5, row: 5 },
      { model: "sanctuaryFloorSmall", column: 5, row: 7 },
      { model: "sanctuaryFloorSmall", column: 7, row: 5 },
      { model: "sanctuaryFloorSmall", column: 7, row: 7 }
    ]
  },
  walls: {
    back: { kind: "run", model: "sanctuaryWallStraight" },
    front: { kind: "run", model: "sanctuaryWallLow" },
    sorted: { kind: "pillar", models: ["sanctuaryPillarLarge", "sanctuaryPillarSmall"] },
    inner: { kind: "run", model: "sanctuaryWallLow" }
  },
  scenery: [
    { model: "sanctuaryStudyRootGateway", at: { x: 900, y: -115 }, turn: 0 },
    { model: "sanctuaryStudyShrineGrove", at: { x: 400, y: -155 }, turn: 0 },
    { model: "sanctuaryStudyRootedRuin", at: { x: -145, y: 600 }, turn: Math.PI / 2 },
    { model: "sanctuaryStudyMushroomGarden", at: { x: -145, y: 1300 }, turn: 0 },
    { model: "sanctuaryStudyGroundFern", at: { x: 330, y: 300 }, turn: 0 },
    { model: "sanctuaryStudySmallMushrooms", at: { x: 400, y: 430 }, turn: 0 },
    { model: "sanctuaryStudyFallenLeaves", at: { x: 1440, y: 420 }, turn: 0 },
    { model: "sanctuaryStudySeedPods", at: { x: 1370, y: 320 }, turn: 0 },
    { model: "sanctuaryStudyMossStone", at: { x: 350, y: 1510 }, turn: 0 },
    { model: "sanctuaryStudyGroundFern", at: { x: 1510, y: 1480 }, turn: Math.PI / 2 },
    { model: "sanctuaryStudySmallMushrooms", at: { x: 430, y: 1440 }, turn: 0 },
    { model: "sanctuaryStudyFallenLeaves", at: { x: 290, y: 1380 }, turn: Math.PI / 2 },
    { model: "sanctuaryStudyFallenLeaves", at: { x: 910, y: 60 }, turn: 0 },
    { model: "sanctuaryStudyGroundFern", at: { x: 70, y: 420 }, turn: 0 },
    { model: "sanctuaryStudyMossStone", at: { x: 1740, y: 480 }, turn: 0 },
    { model: "sanctuaryStudySeedPods", at: { x: 430, y: 65 }, turn: 0 },
    { model: "sanctuaryStudySmallMushrooms", at: { x: 1320, y: 60 }, turn: 0 },
    { model: "sanctuaryStudyGroundFern", at: { x: 840, y: -120 }, turn: Math.PI / 2 },
    { model: "sanctuaryStudyFallenLeaves", at: { x: 500, y: -130 }, turn: 0 },
    { model: "sanctuaryStudySeedPods", at: { x: -100, y: 1360 }, turn: 0 },
    { model: "sanctuaryStudyMossStone", at: { x: -170, y: 700 }, turn: 0 }
  ],
  props: [
    { model: "sanctuaryStudyRootedSapling", turn: 0 },
    { model: "sanctuaryStudyRootedSapling", turn: 0 },
    { model: "sanctuaryStudyRootedSapling", turn: 0 },
    { model: "sanctuaryStudyRootedSapling", turn: 0 },
    { model: "sanctuaryStudyCompactShrine", turn: 0 },
    { model: "sanctuaryStudyHollowStump", turn: 0 },
    { model: "sanctuaryStudyHollowStump", turn: 0 },
    { model: "sanctuaryStudyFallenLog", turn: Math.PI / 2 },
    { model: "sanctuaryStudyFallenLog", turn: Math.PI / 2 },
    { model: "sanctuaryStudyFallenLog", turn: Math.PI / 2 },
    { model: "sanctuaryStudyFallenLog", turn: Math.PI / 2 },
    { model: "sanctuaryStudyTimberSeat", turn: 0 },
    { model: "sanctuaryStudyTimberSeat", turn: 0 }
  ],
  background: 0x161e15,
  light: { sky: 0xf3ffea, ground: 0x869480, sun: 0xfbffe8 }
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

/** Cargo and moorings provide low cover around the harbor's water channels. Small dock gear lies on the boards; a supported crane, net shed and boat cradle stand outside the quay. */
export const harborArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: {
    kind: "tiles",
    apronTiles: 2,
    tiles: ["harborFloorPlain", "harborFloorPlain", "harborFloorPlain", "harborFloorCracked"],
    color: 0x26333a,
    border: ["harborFloorDeck"],
    inlays: [
      { model: "harborFloorRadial", column: 6, row: 7 },
      { model: "harborFloorInset", column: 5, row: 7 },
      { model: "harborFloorInset", column: 7, row: 7 },
      { model: "harborFloorInset", column: 6, row: 6 },
      { model: "harborFloorInset", column: 6, row: 8 },
      { model: "harborFloorSmall", column: 5, row: 6 },
      { model: "harborFloorSmall", column: 5, row: 8 },
      { model: "harborFloorSmall", column: 7, row: 6 },
      { model: "harborFloorSmall", column: 7, row: 8 }
    ]
  },
  walls: {
    back: { kind: "run", model: "harborWallStraight" },
    front: { kind: "run", model: "harborWallLow" },
    sorted: { kind: "pillar", models: ["harborPillarLarge", "harborPillarSmall"] },
    inner: { kind: "run", model: "harborWallLow" }
  },
  scenery: [
    { model: "harborStudyDockCrane", at: { x: 500, y: -155 }, turn: 0 },
    { model: "harborStudyNetShed", at: { x: 1050, y: -155 }, turn: 0 },
    { model: "harborStudyBoatOnCradle", at: { x: 1500, y: -140 }, turn: 0 },
    { model: "harborStudyQuayLoadingBay", at: { x: -145, y: 900 }, turn: Math.PI / 2 },
    { model: "harborStudyRopeCoil", at: { x: 380, y: 65 }, turn: 0 },
    { model: "harborStudyBucket", at: { x: 260, y: 65 }, turn: 0 },
    { model: "harborStudyFishBasket", at: { x: 1420, y: 65 }, turn: 0 },
    { model: "harborStudyFoldedSail", at: { x: 830, y: 60 }, turn: 0 },
    { model: "harborStudyRopeCoil", at: { x: 500, y: 1080 }, turn: 0 },
    { model: "harborStudyFishBasket", at: { x: 1740, y: 1100 }, turn: 0 },
    { model: "harborStudyBucket", at: { x: 75, y: 1030 }, turn: 0 },
    { model: "harborStudyFoldedSail", at: { x: 1750, y: 1280 }, turn: Math.PI / 2 },
    { model: "harborStudyRopeCoil", at: { x: 1330, y: 1150 }, turn: 0 },
    { model: "harborStudyBucket", at: { x: 620, y: 1750 }, turn: 0 },
    { model: "harborStudyFoldedSail", at: { x: 1190, y: 1730 }, turn: 0 },
    { model: "harborStudyFishBasket", at: { x: -100, y: 960 }, turn: 0 },
    { model: "harborStudyRopeCoil", at: { x: 450, y: -100 }, turn: 0 }
  ],
  props: [
    { model: "harborStudyNetRack", turn: 0 },
    { model: "harborStudyBarrelStack", turn: 0 },
    { model: "harborStudyBarrelStack", turn: 0 },
    { model: "harborStudyLanternPost", turn: 0 },
    { model: "harborStudyLanternPost", turn: 0 },
    { model: "harborStudyBollard", turn: 0 },
    { model: "harborStudyBollard", turn: 0 },
    { model: "harborStudyHandcart", turn: 0 },
    { model: "harborStudyCargoCrate", turn: 0 },
    { model: "harborStudyBarrel", turn: 0 },
    { model: "harborStudyLifeRingStand", turn: Math.PI / 2 },
    { model: "harborStudyMooringCluster", turn: 0 },
    { model: "harborStudyBarrel", turn: 0 },
    { model: "harborStudyCargoCrate", turn: 0 },
    { model: "harborStudyMooringCluster", turn: 0 }
  ],
  background: 0x1b3a4a,
  // Channels framed in the quay's stone.
  pools: {
    water: { surface: 0x2a78ad, band: 0x7cc3e6, mark: 0xcbeaf8 },
    rim: { color: 0x6d8894, width: 11 }
  },
  light: { sky: 0xf0f8ff, ground: 0x84909a, sun: 0xffffff }
}

/**
 * The ochre necropolis (`art/environment/ochre-necropolis`): sand-worn
 * stone around a sun medallion, obelisks, urns and torches along the north
 * wall, a winged statue facing its offering table, and what the sand and
 * the robbers left.
 */
export const necropolisArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: {
    kind: "tiles",
    tiles: ["necropolisFloorPlain", "necropolisFloorPlain", "necropolisFloorPlain", "necropolisFloorCracked"],
    color: 0x3a2c1e,
    border: ["necropolisFloorWorn"],
    inlays: [
      { model: "necropolisFloorRadial", column: 6, row: 6 },
      { model: "necropolisFloorInset", column: 5, row: 6 },
      { model: "necropolisFloorInset", column: 7, row: 6 },
      { model: "necropolisFloorInset", column: 6, row: 5 },
      { model: "necropolisFloorInset", column: 6, row: 7 },
      { model: "necropolisFloorSmall", column: 5, row: 5 },
      { model: "necropolisFloorSmall", column: 5, row: 7 },
      { model: "necropolisFloorSmall", column: 7, row: 5 },
      { model: "necropolisFloorSmall", column: 7, row: 7 }
    ]
  },
  walls: {
    back: { kind: "run", model: "necropolisWallStraight" },
    front: { kind: "run", model: "necropolisWallLow" },
    sorted: { kind: "pillar", models: ["necropolisPillarLarge", "necropolisPillarSmall"] },
    inner: { kind: "run", model: "necropolisWallLow" }
  },
  scenery: [
    { model: "necropolisSandDrift", at: { x: 430, y: 1758 }, turn: 0 },
    { model: "necropolisSandDrift", at: { x: 1520, y: 48 }, turn: Math.PI },
    { model: "necropolisSandDrift", at: { x: 1752, y: 1620 }, turn: Math.PI / 2 }
  ],
  props: [
    { model: "necropolisObelisk", turn: 0 },
    { model: "necropolisObelisk", turn: 0 },
    { model: "necropolisUrnTall", turn: 0 },
    { model: "necropolisUrnTall", turn: 0 },
    { model: "necropolisTorchStand", turn: 0 },
    { model: "necropolisTorchStand", turn: 0 },
    { model: "necropolisWingStatue", turn: Math.PI / 2 },
    { model: "necropolisOfferingTable", turn: Math.PI / 2 },
    { model: "necropolisSandRockLarge", turn: Math.PI / 2 - 0.37 },
    { model: "necropolisSarcophagus", turn: 0 },
    { model: "necropolisDeadShrub", turn: 0 },
    { model: "necropolisSandRockSmall", turn: 0.4 },
    { model: "necropolisUrnBroken", turn: 0.8 },
    { model: "necropolisCanopicJars", turn: 0.3 },
    { model: "necropolisObeliskBroken", turn: 0 }
  ],
  background: 0x2b2118,
  // A fire trench and a basin framed in sandstone.
  pools: {
    fire: { surface: 0xdb5a1e, band: 0x5a2412, mark: 0xffc45a },
    water: { surface: 0x3a94b0, band: 0x8fd6d6, mark: 0xd8f3ee },
    rim: { color: 0xa58f6e, width: 11 }
  },
  // Late sun on the sand.
  light: { sky: 0xfff6e2, ground: 0x9a8a72, sun: 0xfff0d0 },
  fires: [
    { at: { x: 460, y: 16 }, height: 86 },
    { at: { x: 1340, y: 16 }, height: 86 }
  ]
}

/**
 * The frostbound monastery (`art/environment/frostbound-monastery`): cold
 * stone, a shrine between two banners, a bench and a brazier by each side
 * wall, ice and snow where the cold got in.
 */
export const monasteryArena: ArenaLook = {
  unitsPerMeter: 70,
  floor: {
    kind: "tiles",
    tiles: ["monasteryFloorPlain", "monasteryFloorPlain", "monasteryFloorPlain", "monasteryFloorCracked"],
    color: 0x2a3036,
    border: ["monasteryFloorWorn"],
    inlays: [
      { model: "monasteryFloorInset", column: 6, row: 6 },
      { model: "monasteryFloorSmall", column: 5, row: 6 },
      { model: "monasteryFloorSmall", column: 7, row: 6 },
      { model: "monasteryFloorSmall", column: 6, row: 5 },
      { model: "monasteryFloorSmall", column: 6, row: 7 },
      { model: "monasteryFloorSmall", column: 5, row: 5 },
      { model: "monasteryFloorSmall", column: 5, row: 7 },
      { model: "monasteryFloorSmall", column: 7, row: 5 },
      { model: "monasteryFloorSmall", column: 7, row: 7 }
    ]
  },
  walls: {
    back: { kind: "run", model: "monasteryWallStraight" },
    front: { kind: "run", model: "monasteryWallLow" },
    sorted: { kind: "pillar", models: ["monasteryPillarLarge", "monasteryPillarSmall"] },
    inner: { kind: "run", model: "monasteryWallLow" }
  },
  scenery: [
    { model: "monasterySnowdrift", at: { x: 60, y: 1130 }, turn: 0.3 },
    { model: "monasterySnowdrift", at: { x: 600, y: 1762 }, turn: 2.2 },
    { model: "monasterySnowdrift", at: { x: 1740, y: 300 }, turn: Math.PI / 2 - 0.37 }
  ],
  props: [
    { model: "monasteryShrine", turn: 0 },
    { model: "monasteryBanner", turn: 0 },
    { model: "monasteryBanner", turn: 0 },
    { model: "monasteryLanternPost", turn: 0 },
    { model: "monasteryLanternPost", turn: 0 },
    { model: "monasteryBench", turn: Math.PI / 2 },
    { model: "monasteryBench", turn: -Math.PI / 2 },
    { model: "monasteryBrazier", turn: 0 },
    { model: "monasteryBrazier", turn: 0 },
    { model: "monasteryIceCluster", turn: 0.6 },
    { model: "monasterySnowRocks", turn: Math.PI / 2 - 0.47 },
    { model: "monasteryBell", turn: 0.3 },
    { model: "monasteryIceCluster", turn: 0.2 },
    { model: "monasterySnowRocks", turn: 2.4 }
  ],
  background: 0x1c212a,
  light: { sky: 0xeaf2ff, ground: 0x8a93a3, sun: 0xf6faff },
  fires: [
    { at: { x: 22, y: 900 }, height: 56 },
    { at: { x: 1778, y: 900 }, height: 56 }
  ]
}

/** The training ground: the courtyard's stone, with nothing standing in it. */
const trainingArena: ArenaLook = { unitsPerMeter: 70, floor: courtyardArena.floor, walls: courtyardArena.walls, scenery: [], background: 0x1f1e1c }

/** Each arena's look, by its id (see `content/arena.ts`). */
export const arenaLooks: Readonly<Record<ArenaId, ArenaLook>> = {
  courtyard: courtyardArena,
  // The training ground is laid in the courtyard's paving.
  trainingGround: trainingArena,
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
