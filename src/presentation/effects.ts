/**
 * Cosmetic effects from gameplay events: slash trails, hit sparks and
 * numbers, recoil, dust, explosions, and heals.
 */
import { projection, view } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import { lerp, normalizeOr } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Action, Death, Enemy, Explosion, Game, Heal, Hit, Impact, Knockback, Player, Position, PrevPosition, RenderClock, RenderHost, RenderNodes, Tuning } from "../schema.ts"
import type { RenderHostValue } from "./host-types.ts"
import { enemyColor, projectileColor } from "./nodes.ts"

/** A world direction as a unit direction on screen. */
const screenDirection = (direction: Vec2): Vec2 => normalizeOr(toScreen(projection, direction), { x: 0, y: -1 })

/**
 * Turns gameplay events into cosmetic effects: slash trails, and for each
 * blow that lands an impact flash, sparks flying along the push, a popping
 * number, a recoil of the body hit, and camera shake (plus a kick and a zoom
 * punch for heavy blows; see `view.impact`).
 */
export const SpawnFx = Game.System("Shooter/SpawnFx", {
  events: {
    action: Game.System.readEvent(Action),
    hit: Game.System.readEvent(Hit),
    death: Game.System.readEvent(Death),
    impact: Game.System.readEvent(Impact),
    explosion: Game.System.readEvent(Explosion),
    heal: Game.System.readEvent(Heal)
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost) }
}, ({ events, resources, services }) => {
  const fx = services.host.fx
  const feedback = services.host.feedback
  const impact = view.impact
  for (const action of events.action.all()) {
    // Full charge: a flash and a ring at the player; releasing it: a bigger flash and a jolt.
    if (action.kind === "charged" || (action.kind === "attack" && action.power)) {
      const at = toScreen(projection, action.at)
      const body = { x: at.x, y: at.y - impact.height * projection.zoom }
      const release = action.kind === "attack"
      fx.flash(body, release ? 54 : 36, view.charge.full, release ? 0.16 : 0.12)
      fx.ring(at, (release ? 70 : 44) * projection.zoom, view.charge.full, release ? 0.3 : 0.25)
      if (release) feedback.shake = Math.max(feedback.shake, impact.shake)
    }
    // Melee moves leave a trail; in a combo, every other arc is a backhand that sweeps the other way.
    if (action.kind === "attack" && action.move.shape !== "shot") {
      services.host.trails.add(action.move, action.move.shape === "arc" && action.step % 2 === 1 ? -1 : 1, action.direction)
    }
  }
  for (const hit of events.hit.all()) {
    const at = toScreen(projection, hit.at)
    const body = { x: at.x, y: at.y - impact.height * projection.zoom }
    const direction = screenDirection(hit.direction)
    if (hit.faction === "player") {
      feedback.shake = Math.max(feedback.shake, view.hurtShake)
      feedback.hurt = 1
      fx.number(at, hit.amount, view.healthFill)
      fx.sparks(body, direction, { color: view.playerHurt, count: 6, speed: 260, spread: 0.7, size: 3, life: 0.22, stretch: 3 })
      continue
    }
    const heavy = hit.heavy
    fx.flash(body, heavy ? 46 : 30, view.hitFlash, heavy ? 0.14 : 0.09)
    fx.sparks(body, direction, { color: impact.spark, count: heavy ? 14 : 8, speed: heavy ? 620 : 440, spread: heavy ? 0.75 : 0.5, size: heavy ? 3.2 : 2.6, life: heavy ? 0.3 : 0.22, stretch: 4 })
    fx.number(at, hit.amount, heavy ? impact.heavyNumber : view.damageNumber, { size: heavy ? 1.5 : 1, drift: direction.x * (heavy ? 26 : 16), life: heavy ? 0.8 : 0.6 })
    feedback.shake = Math.max(feedback.shake, heavy ? impact.heavyShake : hit.killed ? impact.killShake : impact.shake)
    if (heavy) {
      feedback.kick.x = direction.x * impact.kick
      feedback.kick.y = direction.y * impact.kick
      feedback.punch = 1
    }
    if (!hit.killed) {
      feedback.recoil.set(hit.entity, {
        age: 0,
        life: heavy ? impact.recoil.heavySeconds : impact.recoil.seconds,
        x: direction.x,
        y: direction.y,
        strength: heavy ? 1.4 : 1
      })
    }
  }
  for (const heal of events.heal.all()) {
    const at = toScreen(projection, heal.at)
    fx.number(at, heal.amount, view.healNumber, { size: 1.1, drift: 0, life: 0.8 })
    fx.burst({ x: at.x, y: at.y - impact.height * projection.zoom }, { color: view.healNumber, count: 10, speed: 160, size: 4, life: 0.45 })
  }
  for (const death of events.death.all()) {
    const at = toScreen(projection, death.at)
    const color = death.enemy === undefined ? view.player : enemyColor(death.enemy)
    fx.burst({ x: at.x, y: at.y - 16 }, { color, count: 18, speed: 320, size: 6, life: 0.55 })
  }
  for (const explosion of events.explosion.all()) {
    const at = toScreen(projection, explosion.at)
    const nova = explosion.kind === "nova" && explosion.heavy
    const color = nova ? view.ultimate : view.playerArea
    fx.ring(at, explosion.radius * projection.zoom, color, nova ? 0.45 : 0.3)
    fx.burst({ x: at.x, y: at.y - 10 }, { color, count: nova ? 48 : 26, speed: nova ? 620 : 380, size: 6, life: 0.5 })
    fx.burst({ x: at.x, y: at.y - 10 }, { color: view.hitFlash, count: 10, speed: 200, size: 4, life: 0.3 })
    services.host.feedback.shake = Math.max(services.host.feedback.shake, nova ? view.ultimateShake : view.explosionShake)
  }
  for (const impact of events.impact.all()) {
    const at = toScreen(projection, impact.at)
    fx.burst({ x: at.x, y: at.y - view.projectileHeight * projection.zoom }, {
      color: impact.shielded ? view.shieldBlock : impact.wall ? view.wallSpark : projectileColor(impact.faction),
      count: impact.shielded ? 7 : impact.wall ? 5 : 3,
      speed: 140,
      size: 2.5,
      life: 0.18
    })
  }
})

/**
 * Hit reactions on enemy bodies: a recoil after each blow (the body squashes,
 * leans away from the blow, and shifts back, springing back over the
 * recoil's life), and dust kicked up while sliding from a strong push.
 */
export const ReactToHits = Game.System("Shooter/ReactToHits", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), knockback: Game.Query.read(Knockback) }, with: [Enemy] })
  },
  services: { nodes: Game.System.service(RenderNodes), host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, services }) => {
  const seconds = services.clock.frameSeconds
  const recoils = services.host.feedback.recoil
  const spec = view.impact
  for (const recoil of recoils.values()) recoil.age += seconds
  for (const { entity, data } of queries.enemies.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "enemy") continue
    const recoil = recoils.get(entity.id.value)
    if (recoil === undefined || recoil.age >= recoil.life) {
      node.body.scale.set(1)
      node.body.rotation = 0
      node.body.position.set(0, 0)
    } else {
      // Sharp at the blow, springing back with a small overshoot.
      const t = recoil.age / recoil.life
      const k = (1 - t) * (1 - t) * Math.cos(t * Math.PI * 1.2) * recoil.strength
      node.body.scale.set(1 + spec.recoil.squash * 0.8 * k, 1 - spec.recoil.squash * k)
      node.body.rotation = recoil.x * spec.recoil.lean * k
      node.body.position.set(recoil.x * spec.recoil.shift * k, recoil.y * spec.recoil.shift * 0.5 * k)
    }
    const push = data.knockback.get()
    const speed = Math.hypot(push.x, push.y)
    if (speed > spec.dustSpeed && Math.random() < seconds * 40) {
      fxDust(services.host, data.position.get(), push, speed)
    }
  }
  for (const [id, recoil] of recoils) {
    if (recoil.age >= recoil.life) recoils.delete(id)
  }
})

const fxDust = (host: RenderHostValue, at: Vec2, push: Vec2, speed: number): void => {
  const screen = toScreen(projection, at)
  host.fx.dust(screen, screenDirection({ x: push.x / speed, y: push.y / speed }), view.impact.dust)
}

export const UpdateFx = Game.System("Shooter/UpdateFx", {
  queries: { player: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) }, with: [Player] }) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, services }) => {
  const seconds = services.clock.frameSeconds
  services.host.fx.update(seconds)
  const [player] = queries.player.each()
  services.host.trails.update(seconds, player === undefined ? undefined : lerp(player.data.previous.get(), player.data.position.get(), services.clock.alpha))
})
