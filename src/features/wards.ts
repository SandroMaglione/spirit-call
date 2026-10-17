/**
 * Wards (see `WardSpec`): a warder tethers itself to one ally, the one
 * nearest the player within its range, and once the tether has formed that
 * ally takes only a share of the damage it would (see `wardedTaken`, applied
 * by `ApplyDamage`). The player cuts it by crossing the tether (her body, a
 * dash through it included) or by any blow on the warder; it also drops when
 * the warder is stunned or broken and when the ally leaves its range. It
 * reaches for an ally again after its cooldown. Wards run at the enemies'
 * pace, and stand still in a hit-stop.
 */
import { normalizeOr, subtract, type Vec2 } from "@typeonce/ritmo-math/Vec2"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { areaTouchesCircle } from "../physics/areas.ts"
import { Enemy, Game, Health, Hit, HitStop, Hurtbox, Player, Poise, Position, SlowMotion, Stunned, Time, Tuning, Ward } from "../schema.ts"
import type { WardValue } from "../schema.ts"
import { enemyPace } from "./time.ts"

/** How much farther than its range the ally may stray before the tether drops (so it does not flicker at the edge). */
const slack = 1.25

/** Whether a body of `radius` at `at` touches the tether from `from` to `to`. */
export const crossesTether = (from: Vec2, to: Vec2, at: Vec2, radius: number): boolean => {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (length <= 0) return false
  return areaTouchesCircle({ kind: "lane", origin: from, direction: normalizeOr(subtract(to, from), { x: 1, y: 0 }), length, halfWidth: 2 }, at, radius)
}

/** The ids of the enemies warded now (tethers fully formed), and the share of damage each takes. */
export const wardedTaken = (tuning: TuningValue, wards: ReadonlyArray<{ readonly kind: keyof TuningValue["enemies"]; readonly ward: WardValue }>): ReadonlyMap<number, number> => {
  const taken = new Map<number, number>()
  for (const { kind, ward } of wards) {
    const spec = tuning.enemies[kind].ward
    if (spec === null || ward.ally === null || ward.formed < spec.link) continue
    taken.set(ward.ally.id, Math.min(taken.get(ward.ally.id) ?? 1, spec.taken))
  }
  return taken
}

export const UpdateWards = Game.System("Shooter/UpdateWards", {
  queries: {
    warders: Game.Query({
      selection: {
        ward: Game.Query.write(Ward),
        enemy: Game.Query.read(Enemy),
        position: Game.Query.read(Position),
        stunned: Game.Query.read(Stunned),
        poise: Game.Query.read(Poise)
      }
    }),
    allies: Game.Query({ selection: { position: Game.Query.read(Position), enemy: Game.Query.read(Enemy) }, with: [Health] }),
    player: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox) }, with: [Player] })
  },
  resources: {
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time),
    slowMotion: Game.System.readResource(SlowMotion),
    hitStop: Game.System.readResource(HitStop)
  },
  events: { hit: Game.System.readEvent(Hit) }
}, ({ queries, resources, events }) => {
  const tuning = resources.tuning.get()
  // It runs through hit-stops, to see every blow (see `schedules.ts`); its time stands still in them.
  const dt = resources.hitStop.get().remaining > 1e-9 ? 0 : resources.time.get().dt * enemyPace(resources.slowMotion.get())
  // Warders struck this step (a burn does not cut a tether).
  const struck = new Set(events.hit.all().filter((hit) => !hit.periodic).map((hit) => hit.entity))
  const [player] = queries.player.each()
  const her = player === undefined ? undefined : { at: player.data.position.get(), radius: player.data.hurtbox.get().radius }
  const allies = queries.allies.each().map(({ entity, data }) => ({ entity, id: entity.id, at: data.position.get(), kind: data.enemy.get().kind }))
  const taken = new Set(queries.warders.each().flatMap(({ data }) => (data.ward.get().ally === null ? [] : [data.ward.get().ally!.id])))

  for (const { entity, data } of queries.warders.each()) {
    const spec = tuning.enemies[data.enemy.get().kind].ward
    if (spec === null) continue
    const ward = data.ward.get()
    const at = data.position.get()
    const drop = (): WardValue => ({ ally: null, formed: 0, wait: spec.cooldown })
    if (ward.ally !== null) {
      const ally = allies.find((candidate) => candidate.id === ward.ally!.id)
      const cut = ally === undefined ||
        struck.has(Game.Entity.handle(entity.id, Health)) ||
        data.stunned.get().remaining > 0 ||
        data.poise.get().broken > 0 ||
        Math.hypot(ally.at.x - at.x, ally.at.y - at.y) > spec.range * slack ||
        (her !== undefined && crossesTether(at, ally.at, her.at, her.radius))
      if (cut) {
        taken.delete(ward.ally.id)
        data.ward.set(drop())
      } else {
        data.ward.set({ ...ward, formed: Math.min(spec.link, ward.formed + dt) })
      }
      continue
    }
    const wait = Math.max(0, ward.wait - dt)
    if (wait > 0 || her === undefined || data.stunned.get().remaining > 0) {
      data.ward.set({ ...ward, wait })
      continue
    }
    // The ally nearest her within its range: the one she is fighting. Never itself, nor one warded already.
    const reach = allies.filter((ally) => ally.id !== entity.id && !taken.has(ally.id) && Math.hypot(ally.at.x - at.x, ally.at.y - at.y) <= spec.range)
    const chosen = reach.reduce<(typeof reach)[number] | undefined>((best, ally) => {
      const away = (candidate: { readonly at: Vec2 }) => Math.hypot(candidate.at.x - her.at.x, candidate.at.y - her.at.y)
      return best === undefined || away(ally) < away(best) ? ally : best
    }, undefined)
    if (chosen === undefined) {
      data.ward.set({ ...ward, wait })
      continue
    }
    taken.add(chosen.id)
    data.ward.set({ ally: { handle: Game.Entity.handle(chosen.entity.id, Position), id: chosen.id }, formed: 0, wait: 0 })
  }
})
