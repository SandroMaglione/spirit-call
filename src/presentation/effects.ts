/**
 * Cosmetic effects from gameplay events: slash trails, hit sparks and
 * numbers, recoil, dust, explosions, heals, thunder's bolts, and elements
 * (reactions, and motes off bodies in a state).
 */
import { Vector3 } from "three"

import { isMelee } from "../content/attacks.ts"
import { projection, view } from "../config/view.ts"
import { toScreen, toScreenAt } from "../math/iso.ts"
import { lerp, normalizeOr } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { arenaOf } from "../features/arena.ts"
import { Action, Body, Broke, Camera, Cast, Challenge, Death, PerfectDodged, ElementState, Enemy, Explosion, Game, Ground, Heal, Hit, Impact, Knockback, Player, Position, PrevPosition, Reaction, RenderClock, RenderHost, RenderNodes, Tuning, Zap } from "../schema.ts"
import type { ReactionKind } from "../schema.ts"
import type { RenderHostValue } from "./host-types.ts"
import { arenaLooks } from "./looks.ts"
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
    broke: Game.System.readEvent(Broke),
    perfect: Game.System.readEvent(PerfectDodged),
    impact: Game.System.readEvent(Impact),
    explosion: Game.System.readEvent(Explosion),
    heal: Game.System.readEvent(Heal),
    reaction: Game.System.readEvent(Reaction),
    zap: Game.System.readEvent(Zap),
    cast: Game.System.readEvent(Cast)
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost) }
}, ({ events, resources, services }) => {
  const tuning = resources.tuning.get()
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
    // A character comes in: a flash and a ring in her color.
    if (action.kind === "switch" && !action.fell) {
      const at = toScreen(projection, action.at)
      const color = view.characters[action.character]
      fx.flash({ x: at.x, y: at.y - impact.height * projection.zoom }, 40, color, 0.14)
      fx.ring(at, 56 * projection.zoom, color, 0.35)
    }
    // After a fall she comes in for good: a column of light, rings, a flash, her name; protected a while (see `DrawPlayer`).
    if (action.kind === "switch" && action.fell) {
      const at = toScreen(projection, action.at)
      const color = view.characters[action.character]
      const spec = view.fallEntry
      const body = { x: at.x, y: at.y - impact.height * projection.zoom }
      fx.flash(body, spec.flash, view.hitFlash, 0.3)
      fx.flash(body, spec.flash * 0.7, color, 0.45)
      fx.ring(at, spec.ring * projection.zoom, color, 0.55)
      fx.ring(at, spec.ring * 0.55 * projection.zoom, view.hitFlash, 0.35)
      // Streaks rising off the ground around her: a column of light.
      fx.burst(at, { color, count: spec.beam, speed: 260, size: 3, life: 0.7, gravity: -900, drag: 1, stretch: 6 })
      fx.burst(body, { color: view.hitFlash, count: 14, speed: 300, size: 4, life: 0.4 })
      feedback.shake = Math.max(feedback.shake, spec.shake)
      feedback.punch = Math.max(feedback.punch, 1)
      feedback.protection = tuning.team.fallProtection
      const banner = services.host.hud.banner
      banner.textContent = `${tuning.characters[action.character].name.toUpperCase()} STEPS IN`
      banner.classList.remove("is-showing")
      void banner.offsetWidth // restart the CSS animation
      banner.classList.add("is-showing")
    }
    // Melee moves leave a trail; in a combo, every other arc is a backhand that sweeps the other way.
    if (action.kind === "attack" && isMelee(action.move)) {
      services.host.trails.add(action.move, action.move.shape === "arc" && action.step % 2 === 1 ? -1 : 1, action.direction)
    }
  }
  for (const hit of events.hit.all()) {
    // A blow that deals nothing (a gust's push) shows nothing of a hit.
    if (hit.amount <= 0) continue
    const at = toScreen(projection, hit.at)
    const body = { x: at.x, y: at.y - impact.height * projection.zoom }
    const direction = screenDirection(hit.direction)
    // A burn: a small number in the fire's color, and for the player a faint vignette, without the jolt of a blow.
    if (hit.periodic) {
      fx.number(at, hit.amount, view.elements.fire, { size: 0.8, life: 0.5 })
      if (hit.faction === "player") feedback.hurt = Math.max(feedback.hurt, 0.35)
      continue
    }
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
      const along = normalizeOr(hit.direction, { x: 0, y: 1 })
      feedback.recoil.set(hit.entity, {
        age: 0,
        life: heavy ? impact.recoil.heavySeconds : impact.recoil.seconds,
        x: along.x,
        y: along.y,
        strength: heavy ? 1.4 : 1
      })
    }
  }
  for (const heal of events.heal.all()) {
    const at = toScreen(projection, heal.at)
    fx.number(at, heal.amount, view.healNumber, { size: 1.1, drift: 0, life: 0.8 })
    fx.burst({ x: at.x, y: at.y - impact.height * projection.zoom }, { color: view.healNumber, count: 10, speed: 160, size: 4, life: 0.45 })
  }
  // A kill bursts the body apart (it is gone at once: no fall), in its color, sized by its width.
  for (const death of events.death.all()) {
    const at = toScreen(projection, death.at)
    const color = death.enemy === undefined ? view.player : enemyColor(death.enemy)
    const scale = death.enemy === undefined ? 1 : view.enemies[death.enemy].widthFactor / 1.5
    const heart = { x: at.x, y: at.y - 18 * scale * projection.zoom }
    const spec = view.death
    fx.flash(heart, spec.flash * scale, view.hitFlash, 0.12)
    fx.ring(at, spec.ring * scale * projection.zoom, color, 0.35)
    fx.burst(heart, { color, count: Math.round(spec.chunks * scale), speed: spec.speed * scale, size: spec.size * scale, life: spec.life, gravity: 520, drag: 2.5 })
    fx.burst(heart, { color: view.hitFlash, count: Math.round(spec.chunks * 0.4 * scale), speed: spec.speed * 0.6, size: spec.size * 0.6, life: spec.life * 0.6 })
    services.host.feedback.shake = Math.max(services.host.feedback.shake, spec.shake * scale)
  }
  // A break: a burst of light from the body, a wide ring, sparks, and a heavy kick of the camera.
  for (const broke of events.broke.all()) {
    const at = toScreen(projection, broke.at)
    const scale = view.enemies[broke.enemy].widthFactor / 1.5
    const heart = { x: at.x, y: at.y - 18 * scale * projection.zoom }
    const spec = view.breaking
    fx.flash(heart, spec.flash * scale, spec.full, 0.2)
    fx.ring(at, spec.ring * scale * projection.zoom, spec.bar, 0.45)
    fx.burst(heart, { color: spec.bar, count: 26, speed: 420, size: 4, life: 0.5, stretch: 3, drag: 2 })
    fx.burst(heart, { color: spec.full, count: 12, speed: 240, size: 5, life: 0.35 })
    services.host.feedback.shake = Math.max(services.host.feedback.shake, spec.shake)
    services.host.feedback.punch = Math.max(services.host.feedback.punch, 1)
  }
  // A wave (the Tidal Wave): spray of its element rushing down its lane.
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "cut") continue
    const at = toScreen(projection, cast.from)
    const color = effect.element === null ? view.playerArea : view.elements[effect.element]
    const base = Math.atan2(cast.direction.y, cast.direction.x)
    for (let streak = 0; streak < 18; streak++) {
      // Spread across the lane's width, all heading down it.
      const side = ((streak % 6) / 5 - 0.5) * (effect.width / 2)
      const from = toScreen(projection, { x: cast.from.x - Math.sin(base) * side, y: cast.from.y + Math.cos(base) * side })
      const direction = screenDirection(cast.direction)
      const speed = (effect.length * 2.4 + (streak % 3) * 80) * projection.zoom
      fx.mote({ x: from.x, y: from.y - 8 * projection.zoom }, direction.x * speed, direction.y * speed, { color, size: 4, life: 0.35, drag: 3, stretch: 4 })
    }
    fx.burst({ x: at.x, y: at.y - 10 }, { color, count: 10, speed: 160, size: 4, life: 0.35 })
  }
  // A blast (the Gust): streaks of its element rushing out across its fan.
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "blast") continue
    const at = toScreen(projection, cast.from)
    const color = effect.element === null ? view.playerArea : view.elements[effect.element]
    const half = (effect.arcDegrees * Math.PI) / 360
    const base = Math.atan2(cast.direction.y, cast.direction.x)
    // All around her: streaks evenly spread; a fan: across its width.
    const round = effect.arcDegrees >= 360
    const streaks = round ? 22 : 14
    for (let streak = 0; streak < streaks; streak++) {
      const angle = round ? base + (streak / streaks) * Math.PI * 2 : base + (streak / (streaks - 1) - 0.5) * half * 2
      const direction = screenDirection({ x: Math.cos(angle), y: Math.sin(angle) })
      const speed = (effect.radius * 3.2 + (streak % 3) * 60) * projection.zoom
      fx.mote({ x: at.x, y: at.y - impact.height * projection.zoom }, direction.x * speed, direction.y * speed, { color, size: 3, life: 0.28, drag: 4, stretch: 5 })
    }
    feedback.shake = Math.max(feedback.shake, 3)
  }
  // A perfect dodge: a bright flash where she slipped through, a ring rushing out, and streaks off her.
  for (const perfect of events.perfect.all()) {
    const at = toScreen(projection, perfect.at)
    const heart = { x: at.x, y: at.y - 18 * projection.zoom }
    const spec = view.perfectDodge
    fx.flash(heart, spec.flash, spec.color, 0.3)
    fx.flash(heart, spec.flash * 0.45, view.hitFlash, 0.18)
    fx.ring(at, spec.ring * projection.zoom, spec.color, 0.5)
    fx.ring(at, spec.ring * 0.55 * projection.zoom, view.hitFlash, 0.3)
    fx.burst(heart, { color: spec.color, count: 40, speed: 640, size: 3.5, life: 0.55, stretch: 5, drag: 3 })
    fx.burst(heart, { color: view.hitFlash, count: 14, speed: 300, size: 4, life: 0.4 })
    services.host.feedback.punch = Math.max(services.host.feedback.punch, 1)
    services.host.feedback.shake = Math.max(services.host.feedback.shake, spec.shake)
  }
  for (const explosion of events.explosion.all()) {
    const at = toScreen(projection, explosion.at)
    const nova = explosion.kind === "nova" && explosion.heavy
    const color = explosion.element !== null ? view.elements[explosion.element] : nova ? view.ultimate : view.playerArea
    fx.ring(at, explosion.radius * projection.zoom, color, nova ? 0.45 : 0.3)
    fx.burst({ x: at.x, y: at.y - 10 }, { color, count: nova ? 48 : 26, speed: nova ? 620 : 380, size: 6, life: 0.5 })
    fx.burst({ x: at.x, y: at.y - 10 }, { color: view.hitFlash, count: 10, speed: 200, size: 4, life: 0.3 })
    services.host.feedback.shake = Math.max(services.host.feedback.shake, nova ? view.ultimateShake : view.explosionShake)
  }
  for (const reaction of events.reaction.all()) react(services.host, toScreen(projection, reaction.at), reaction.kind)
  // Thunder: a bolt along its path at body height, a spark where it lands; a healing zap in the heal color.
  for (const zap of events.zap.all()) {
    const color = zap.heal ? view.totem.heal : view.elements.thunder
    const points = zap.path.map((point) => {
      const at = toScreen(projection, point)
      return { x: at.x, y: at.y - impact.height * projection.zoom }
    })
    fx.bolt(points, color, zap.heal ? 0.28 : 0.2)
    const end = points[points.length - 1]!
    fx.flash(end, zap.heal ? 30 : 24, color, 0.12)
    fx.burst(end, { color, count: zap.heal ? 8 : 6, speed: 180, size: 3, life: 0.3, gravity: zap.heal ? -220 : 0 })
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

/** The effect of elements meeting at `at` (projected coordinates). */
const react = (host: RenderHostValue, at: Vec2, kind: ReactionKind): void => {
  const fx = host.fx
  const body = { x: at.x, y: at.y - view.impact.height * projection.zoom }
  switch (kind) {
    case "ignite":
      fx.flash(body, 30, view.elements.fire, 0.14)
      fx.burst(body, { color: view.elements.fire, count: 10, speed: 160, size: 3.5, life: 0.4, gravity: -260 })
      return
    case "soak":
      fx.burst(body, { color: view.elements.water, count: 12, speed: 200, size: 3.5, life: 0.4, gravity: 420 })
      return
    case "steam":
      fx.flash(body, 40, view.steam, 0.2)
      fx.burst(body, { color: view.steam, count: 16, speed: 120, size: 7, life: 0.8, gravity: -200, drag: 3, alpha: 0.6 })
      return
    case "fizzle":
      fx.burst(body, { color: view.steam, count: 6, speed: 90, size: 5, life: 0.5, gravity: -160, drag: 3, alpha: 0.5 })
      return
    case "carry":
      fx.burst(body, { color: view.elements.wind, count: 8, speed: 220, size: 3, life: 0.3 })
      return
    case "shock":
      fx.flash(body, 42, view.elements.thunder, 0.16)
      fx.ring(at, 46 * projection.zoom, view.elements.thunder, 0.3)
      fx.burst(body, { color: view.elements.thunder, count: 12, speed: 280, size: 3, life: 0.3, stretch: 3 })
      return
    case "swirl":
      // A whirl taking on an element: a gust bursting out from its center (the whirl turns the element's color).
      fx.flash(body, 60, view.elements.wind, 0.2)
      fx.ring(at, 120 * projection.zoom, view.elements.wind, 0.4)
      fx.burst(body, { color: view.elements.wind, count: 18, speed: 320, size: 4, life: 0.45, drag: 2 })
      host.feedback.shake = Math.max(host.feedback.shake, view.impact.heavyShake)
      return
    case "stun":
      fx.flash(body, 44, view.stun, 0.16)
      fx.ring(at, 50 * projection.zoom, view.stun, 0.35)
      fx.burst(body, { color: view.stun, count: 12, speed: 260, size: 3.5, life: 0.35 })
      host.feedback.shake = Math.max(host.feedback.shake, view.impact.heavyShake)
      return
  }
}

/** Motes off bodies in a state (embers rising off burning ones, drops falling off soaked ones), and embers off fire pools. */
export const ShedStateMotes = Game.System("Shooter/ShedStateMotes", {
  queries: {
    bodies: Game.Query({
      selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), body: Game.Query.read(Body), state: Game.Query.read(ElementState) }
    }),
    pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } })
  },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, services }) => {
  const chance = services.clock.frameSeconds * view.states.motes
  for (const { data } of queries.bodies.each()) {
    const state = data.state.get().current
    if (state === null || Math.random() >= chance) continue
    const at = toScreen(projection, lerp(data.previous.get(), data.position.get(), services.clock.alpha))
    const r = data.body.get().radius * projection.zoom
    const from = { x: at.x + (Math.random() - 0.5) * r * 1.6, y: at.y - Math.random() * r * view.bodyHeightFactor }
    if (state.id === "burning") services.host.fx.mote(from, (Math.random() - 0.5) * 30, -60 - Math.random() * 50, { color: view.states.burning, size: 3 + Math.random() * 2, life: 0.5, gravity: -80, drag: 1 })
    else services.host.fx.mote(from, (Math.random() - 0.5) * 16, 10, { color: view.states.soaked, size: 2.5, life: 0.45, gravity: 520, drag: 0.5 })
  }
  for (const { data } of queries.pools.each()) {
    const pool = data.ground.get()
    // More embers off a bigger fire.
    // Arena hazards stay still (see `presentation/hazards.ts`).
    if (pool.element !== "fire" || pool.permanent || Math.random() >= chance * (pool.radius / 40)) continue
    const angle = Math.random() * Math.PI * 2
    const distance = Math.sqrt(Math.random()) * pool.radius
    const from = toScreen(projection, { x: pool.center.x + Math.cos(angle) * distance, y: pool.center.y + Math.sin(angle) * distance })
    services.host.fx.mote(from, (Math.random() - 0.5) * 20, -50 - Math.random() * 60, { color: view.states.burning, size: 3 + Math.random() * 3, life: 0.6, gravity: -60, drag: 1 })
  }
})

/** The flames in the arena's scenery (see `ArenaLook.fires`): each near the camera flickers and sheds an ember now and then. */
export const ShedArenaEmbers = Game.System("Shooter/ShedArenaEmbers", {
  resources: { tuning: Game.System.readResource(Tuning), challenge: Game.System.readResource(Challenge), camera: Game.System.readResource(Camera) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ resources, services }) => {
  const fires = arenaLooks[arenaOf(resources.tuning.get(), resources.challenge.get())].fires
  if (fires === undefined) return
  const camera = resources.camera.get()
  const spec = view.arenaFires
  const seconds = services.clock.frameSeconds
  for (const fire of fires) {
    if (Math.hypot(fire.at.x - camera.x, fire.at.y - camera.y) > spec.reach) continue
    const from = toScreenAt(projection, fire.at, fire.height)
    // The flame: short, fat motes that barely rise; then an ember off it now and then.
    if (Math.random() < seconds * spec.flames) services.host.fx.mote({ x: from.x + (Math.random() - 0.5) * 8, y: from.y }, (Math.random() - 0.5) * 10, -22, { color: Math.random() < 0.5 ? spec.flame : spec.ember, size: 6 + Math.random() * 4, life: 0.3, gravity: -40, drag: 1 })
    if (Math.random() < seconds * spec.embers) services.host.fx.mote(from, (Math.random() - 0.5) * 26, -45 - Math.random() * 40, { color: spec.ember, size: 2 + Math.random() * 2, life: 0.9, gravity: -50, drag: 0.8 })
  }
})

/** Where each body that sheds drops was last frame, and its share of a drop still owed. */
const shedding = new WeakMap<object, { at: Vec2; owed: number }>()

/**
 * Drops (or embers, or wisps) off a moving spirit (a look's `drops`), into
 * the 3D scene so its body hides the ones behind it: each leaves from its
 * back, low on it, thrown back against its motion; drops fall to the
 * floor, about half leaving a ripple there, embers drift up and burn out,
 * wisps curl away and fade. More the faster it goes; none while it stands.
 */
export const ShedSpiritDrops = Game.System("Shooter/ShedSpiritDrops", {
  queries: {
    players: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), body: Game.Query.read(Body) }, with: [Player] })
  },
  services: { host: Game.System.service(RenderHost), nodes: Game.System.service(RenderNodes), clock: Game.System.service(RenderClock) }
}, ({ queries, services }) => {
  const seconds = services.clock.frameSeconds
  for (const { entity, data } of queries.players.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "player" || node.drops === null) continue
    const drops = node.drops
    const at = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const last = shedding.get(node) ?? { at, owed: 0 }
    shedding.set(node, last)
    const moved = { x: at.x - last.at.x, y: at.y - last.at.y }
    last.at = at
    if (seconds <= 0) continue
    const speed = Math.hypot(moved.x, moved.y) / seconds
    if (speed < 20) {
      last.owed = 0
      continue
    }
    last.owed += drops.rate * seconds * Math.min(1, speed / 290)
    const back = { x: -moved.x / (speed * seconds), y: -moved.y / (speed * seconds) }
    const radius = data.body.get().radius
    while (last.owed >= 1) {
      last.owed -= 1
      const color = drops.colors[Math.floor(Math.random() * drops.colors.length)]!
      // From its back, a little to either side, low on its body.
      const across = (Math.random() - 0.5) * radius * 1.1
      const from = { x: at.x + back.x * radius * 0.9 - back.y * across, y: at.y + back.y * radius * 0.9 + back.x * across }
      const height = node.body.height * (0.12 + Math.random() * 0.3)
      const kind = drops.kind ?? "drop"
      const thrown = kind === "drop" ? 50 + Math.random() * 70 : kind === "ember" ? 25 + Math.random() * 40 : 60 + Math.random() * 50
      services.host.drops.emit(from, height, back, thrown, drops.size * (0.7 + Math.random() * 0.6), color, kind)
    }
  }
})

/**
 * Hit reactions on enemy bodies: a recoil after each blow (the body squashes,
 * leans away from the blow over its feet, and shifts back, springing back
 * over the recoil's life), and dust kicked up while sliding from a strong
 * push.
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
    const pivot = node.pivot
    if (recoil === undefined || recoil.age >= recoil.life) {
      pivot.scale.setScalar(1)
      pivot.quaternion.identity()
      pivot.position.set(0, 0, 0)
    } else {
      // Sharp at the blow, springing back with a small overshoot.
      const t = recoil.age / recoil.life
      const k = (1 - t) * (1 - t) * Math.cos(t * Math.PI * 1.2) * recoil.strength
      const widen = 1 + spec.recoil.squash * 0.8 * k
      pivot.scale.set(widen, 1 - spec.recoil.squash * k, widen)
      // Tipped over the feet, the top away from the blow: about the floor axis across the push.
      leanAxis.set(recoil.y, 0, -recoil.x)
      pivot.quaternion.setFromAxisAngle(leanAxis, spec.recoil.lean * k)
      pivot.position.set(recoil.x * spec.recoil.shift * k, 0, recoil.y * spec.recoil.shift * k)
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

const leanAxis = new Vector3()

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
  services.host.drops.update(seconds)
  const [player] = queries.player.each()
  services.host.trails.update(seconds, player === undefined ? undefined : lerp(player.data.previous.get(), player.data.position.get(), services.clock.alpha))
})
