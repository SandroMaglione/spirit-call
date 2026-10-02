/**
 * What everything looks like: each character, each enemy, and the arena's
 * floor, walls, and scenery, as a placeholder shape or a model (see
 * `models.ts`). Giving something its model is changing its entry here; no
 * system changes. See `docs/models.md`.
 */
import type { CharacterId } from "../content/characters.ts"
import type { EnemyKind } from "../content/enemies.ts"
import type { SkillId } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import { view } from "../config/view.ts"
import type { Vec2 } from "../math/vec.ts"
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
      // The four combo moves, and the charged thrust as the third.
      attack: crowCombo.map((move) => ({ clip: "AttackCombo", ...move })),
      power: { clip: "AttackCombo", ...crowCombo[2] }
    },
    held: { grip: "weapon_grip", weapons: { trainingBlade: "trainingBlade", crescendo: "crescendo" } }
  },
  gunner: { ...crow, moments: crowLoops },
  tidecaller: { ...crow, moments: crowLoops }
}

const capsule = (kind: EnemyKind): BodyLook => ({ kind: "capsule", ...view.enemies[kind] })

export const enemyLooks: Readonly<Record<EnemyKind, BodyLook>> = {
  dummy: capsule("dummy"),
  chaser: capsule("chaser"),
  shooter: capsule("shooter"),
  brute: capsule("brute"),
  swarmer: capsule("swarmer"),
  charger: capsule("charger"),
  sniper: capsule("sniper"),
  guardian: capsule("guardian")
}

/**
 * A wall or pillar: a lit `box`, or a model stretched to fill the wall's box
 * (its footprint, and the wall's height from `view`).
 */
export type WallLook = { readonly kind: "box"; readonly color: number } | { readonly kind: "model"; readonly model: ModelId }

/** A model placed in the arena for looks only (it blocks nothing): at a floor point, turned `turn` radians, `scale` times its size in meters. */
export interface Scenery {
  readonly model: ModelId
  readonly at: Vec2
  readonly turn: number
  readonly scale: number
}

/**
 * The arena: its floor (the flat grid, or `none` when scenery brings its
 * own), its walls by placement (`back` and `front` edges, `sorted` pillars),
 * and scenery. What blocks movement and shots is the simulation's walls
 * (`content/arena.ts`); the looks only dress them.
 */
export interface ArenaLook {
  readonly floor: { readonly kind: "grid"; readonly color: number; readonly line: number; readonly spacing: number } | { readonly kind: "none" }
  readonly walls: Readonly<Record<"back" | "front" | "sorted", WallLook>>
  readonly scenery: ReadonlyArray<Scenery>
}

export const arenaLook: ArenaLook = {
  floor: { kind: "grid", color: view.floor, line: view.floorGrid, spacing: view.floorGridSpacing },
  walls: { back: { kind: "box", color: view.wall }, front: { kind: "box", color: view.wall }, sorted: { kind: "box", color: view.wall } },
  scenery: []
}

/** Every model the looks use: loaded before the arena opens. */
export const modelsInLooks = (): ReadonlySet<ModelId> => {
  const ids = new Set<ModelId>()
  for (const look of [...Object.values(characterLooks), ...Object.values(enemyLooks)]) {
    if (look.kind !== "model") continue
    ids.add(look.model)
    for (const weapon of Object.values(look.held?.weapons ?? {})) ids.add(weapon)
  }
  for (const look of Object.values(arenaLook.walls)) if (look.kind === "model") ids.add(look.model)
  for (const scenery of arenaLook.scenery) ids.add(scenery.model)
  return ids
}
