/**
 * Enemy Practice (see the `practice` objective): no waves, but a field kept
 * full of the enemies picked (`Practice`). Each pick holds spots for its
 * group (fewer when many are picked, so they all fit), repeated up to the
 * fewest the field keeps, at most the most; when more are picked than fit,
 * they take turns. An enemy holds its spot (`PracticeUnit`); when it falls
 * the spot fills again a few seconds later, behind a spawn warning, with
 * the same kind or, taking turns, the next pick. Some come as elites when
 * the picks say so (carrying the elements met so far), some carry shields
 * when asked, and a champion of the first pick that fights up close
 * holds a spot of its own when asked (see `Tuning.champions`). It goes on
 * until the team falls.
 */
import * as Random from "@typeonce/ritmo-math/Random"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { EliteElement } from "../content/challenges.ts"
import type { EnemyKind } from "../content/enemies.ts"
import { Challenge, Game, PendingSpawn, Player, Position, Practice, PracticeField, PracticeUnit, Rng, RunScope, Time, Tuning } from "../schema.ts"
import { makePendingSpawn } from "./enemies.ts"
import { Walls, wallBoxes } from "./motion.ts"
import { pickSpawnPoint } from "./waves.ts"

/** The share of practice spawns that come as elites, when the picks ask for elites. */
const eliteShare = 0.25
/** The share of practice spawns that carry a shield, when the picks ask for shields. */
const shieldShare = 0.3
/** A champion's spot fills again after this many times the objective's wait. */
const championRespawn = 3
const eliteElements: ReadonlyArray<EliteElement> = ["fire", "water", "thunder"]

/**
 * The kinds a field of `picks` keeps, a spot each: every pick with its group
 * (at most its share of `most`, so many picks all fit), in the order picked,
 * repeated until there are at least `fewest`, never more than `most`.
 */
export const practiceSpots = (tuning: TuningValue, picks: ReadonlyArray<EnemyKind>, field: { readonly most: number; readonly fewest: number }): ReadonlyArray<EnemyKind> => {
  const kinds = picks.filter((kind) => tuning.enemies[kind].cost > 0)
  if (kinds.length === 0) return []
  const share = Math.max(1, Math.floor(field.most / kinds.length))
  const spots: Array<EnemyKind> = []
  do {
    for (const kind of kinds) {
      for (let unit = 0; unit < Math.min(tuning.enemies[kind].group, share) && spots.length < field.most; unit++) spots.push(kind)
    }
  } while (spots.length < field.fewest)
  return spots
}

export const KeepPracticeField = Game.System("Shooter/KeepPracticeField", {
  queries: {
    units: Game.Query({ selection: { unit: Game.Query.read(PracticeUnit) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }),
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    walls: Walls
  },
  resources: {
    tuning: Game.System.readResource(Tuning),
    challenge: Game.System.readResource(Challenge),
    practice: Game.System.readResource(Practice),
    field: Game.System.writeResource(PracticeField),
    time: Game.System.readResource(Time),
    rng: Game.System.writeResource(Rng)
  },
  commands: Game.System.commands(Game.System.spawns(PendingSpawn))
}, ({ queries, resources, commands }) => {
  const tuning = resources.tuning.get()
  const objective = tuning.challenges[resources.challenge.get()].objective
  if (!tuning.waves.enabled || objective.kind !== "practice") return
  const picks = resources.practice.get().kinds.filter((kind) => tuning.enemies[kind].cost > 0)
  if (picks.length === 0) return
  let { spots, turn } = resources.field.get()
  // The first step lays the field out, its enemies coming in one after another.
  if (spots.length === 0) {
    const kinds = practiceSpots(tuning, picks, objective)
    spots = kinds.map((kind, index) => ({ kind, wait: tuning.waves.firstDelay + index * tuning.waves.spawnInterval }))
    turn = new Set(kinds).size
    // The champion's spot, after the others: of the first pick that is not ranged (a champion never is).
    const leader = picks.find((kind) => tuning.enemies[kind].behavior.kind !== "kite")
    if (resources.practice.get().champion === true && leader !== undefined) {
      spots = [...spots, { kind: leader, wait: tuning.waves.firstDelay + spots.length * tuning.waves.spawnInterval, champion: true }]
    }
  }
  const held = new Set([
    ...queries.units.each().map(({ data }) => data.unit.get().slot),
    ...queries.pending.each().flatMap(({ data }) => (data.pending.get().slot === undefined ? [] : [data.pending.get().slot!]))
  ])
  // More picks than fit: a spot that empties takes the next pick in turn (the champion's keeps its kind).
  const turns = new Set(spots.filter((spot) => spot.champion !== true).map((spot) => spot.kind)).size < picks.length
  const dt = resources.time.get().dt
  const random = Random.make(resources.rng.get().state)
  const player = queries.player.each()[0]?.data.position.get()
  const boxes = wallBoxes(queries.walls.each())
  const { elites, elements = eliteElements, shields = false } = resources.practice.get()
  spots = spots.map((spot, slot) => {
    if (spot.wait === null) {
      if (held.has(slot)) return spot
      // Its enemy fell: the spot fills again after a while (a champion's, after longer).
      if (spot.champion === true) return { ...spot, wait: objective.respawn * championRespawn }
      const kind = turns ? picks[turn++ % picks.length]! : spot.kind
      return { kind, wait: objective.respawn }
    }
    const wait = spot.wait - dt
    if (wait > 0) return { ...spot, wait }
    const front = random.next() * Math.PI * 2
    const champion = spot.champion === true
    const elite = champion || (elites && elements.length > 0 && random.next() < eliteShare) ? random.pick(elements.length > 0 ? elements : eliteElements) ?? null : null
    const at = pickSpawnPoint(tuning, spot.kind, player, boxes, random, front)
    const shield = shields && random.next() < shieldShare
    commands.spawnIn(RunScope, makePendingSpawn(spot.kind, at, tuning.waves.spawnWarning, elite, slot, champion, shield))
    return { ...spot, wait: null }
  })
  resources.field.set({ spots, turn })
  resources.rng.set({ state: random.state })
})
