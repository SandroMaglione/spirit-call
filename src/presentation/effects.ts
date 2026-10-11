/**
 * Cosmetic effects from gameplay events: slash trails, hit sparks and
 * numbers, recoil, dust, explosions, heals, thunder's bolts, and elements
 * (reactions, and motes off bodies in a state).
 */
import { Group, Vector3 } from "three"

import { isMelee } from "../content/attacks.ts"
import type { StateId } from "../content/elements.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { projection, view } from "../config/view.ts"
import { toScreen, toScreenAt } from "../math/iso.ts"
import { lerp, normalizeOr } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { arenaOf } from "../features/arena.ts"
import { Action, Body, Broke, Camera, Cast, Challenge, Death, PerfectDodged, ElementState, Enemy, Explosion, Game, Ground, Guard, Guarded, Heal, Hit, Impact, Knockback, Member, Player, Position, PrevPosition, Raising, Reaction, RenderClock, RenderHost, RenderNodes, Tuning, Zap } from "../schema.ts"
import type { ReactionKind } from "../schema.ts"
import { makeBody } from "./bodies.ts"
import type { RenderHostValue } from "./host-types.ts"
import { arenaLooks, characterLooks } from "./looks.ts"
import { enemyColor, projectileColor } from "./nodes.ts"
import { ownLook } from "./signatures.ts"

/** A world direction as a unit direction on screen. */
const screenDirection = (direction: Vec2): Vec2 => normalizeOr(toScreen(projection, direction), { x: 0, y: -1 })

/**
 * Turns gameplay events into cosmetic effects: slash trails, and for each
 * blow that lands an impact flash, sparks flying along the push, a popping
 * number, a recoil of the body hit, and camera shake (plus a kick and a zoom
 * punch for heavy blows; see `view.impact`).
 */
export const SpawnFx = Game.System("Shooter/SpawnFx", {
  queries: { player: Game.Query({ selection: { member: Game.Query.read(Member) }, with: [Player] }) },
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
    cast: Game.System.readEvent(Cast),
    guarded: Game.System.readEvent(Guarded)
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, events, resources, services }) => {
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
    // She falls: her body is left behind for a moment, going down (see `PlayFalls`).
    if (action.kind === "fall") {
      const look = characterLooks[action.character]
      const root = new Group()
      const pivot = new Group()
      const body = makeBody(services.host.assets, look, tuning.characters[action.character].radius, false)
      pivot.add(body.object)
      root.add(pivot)
      root.position.set(action.at.x, 0, action.at.y)
      body.face(action.facing)
      services.host.actors.add(root)
      services.host.fallen.push({ root, pivot, body, facing: action.facing, color: view.elements[tuning.characters[action.character].element], age: 0 })
      // The world darkens for the beat, its edges glowing in her color as her light goes out, and the camera leans in on her.
      const drain = services.host.hud.fall
      drain.style.setProperty("--el", `#${view.elements[tuning.characters[action.character].element].toString(16).padStart(6, "0")}`)
      drain.classList.remove("is-on")
      void drain.offsetWidth
      drain.classList.add("is-on")
      feedback.punch = Math.max(feedback.punch, 0.8)
    }
    // A character comes in: a flash and a ring in her color.
    if (action.kind === "switch" && !action.fell) {
      const at = toScreen(projection, action.at)
      const color = view.characters[action.character]
      fx.flash({ x: at.x, y: at.y - impact.height * projection.zoom }, 40, color, 0.14)
      fx.ring(at, 56 * projection.zoom, color, 0.35)
    }
    // After a fall the next one comes in once the fallen one is down (see `PlayFalls`).
    if (action.kind === "switch" && action.fell) feedback.stepIn = { at: action.at, character: action.character, wait: tuning.team.fallBeat.seconds }
  }
  // She comes in for good: a column of light, rings, a flash, her name; protected a while (see `DrawPlayer`).
  if (feedback.stepIn !== null) {
    feedback.stepIn.wait -= services.clock.frameSeconds
    if (feedback.stepIn.wait <= 0) {
      const action = feedback.stepIn
      feedback.stepIn = null
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
  }
  for (const action of events.action.all()) {
    // Melee moves leave a trail; in a combo, every other arc is a backhand that sweeps the other way.
    if (action.kind === "attack" && isMelee(action.move) && action.move.shape !== "slam" && queries.player.each()[0]?.data.member.get().character !== "swordsman") {
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
    if (effect.kind !== "cut" || (cast.skill !== null && ownLook.has(cast.skill))) continue
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
    if (effect.kind !== "blast" || cast.skill === "bladeWave") continue
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
    // A chain's later steps go off bigger, its count over her.
    const grow = 1 + spec.chainGrowth * (perfect.chain - 1)
    fx.flash(heart, spec.flash * grow, spec.color, 0.3)
    fx.flash(heart, spec.flash * 0.45 * grow, view.hitFlash, 0.18)
    fx.ring(at, spec.ring * grow * projection.zoom, spec.color, 0.5)
    fx.ring(at, spec.ring * 0.55 * grow * projection.zoom, view.hitFlash, 0.3)
    if (perfect.chain > 1) fx.ring(at, spec.ring * 1.4 * grow * projection.zoom, spec.color, 0.65)
    fx.burst(heart, { color: spec.color, count: Math.round(40 * grow), speed: 640, size: 3.5, life: 0.55, stretch: 5, drag: 3 })
    fx.burst(heart, { color: view.hitFlash, count: 14, speed: 300, size: 4, life: 0.4 })
    if (perfect.chain > 1) fx.number({ x: heart.x, y: heart.y - 30 * projection.zoom }, perfect.chain, spec.color, { size: 1.6, life: 0.7 })
    services.host.feedback.punch = Math.max(services.host.feedback.punch, grow)
    services.host.feedback.shake = Math.max(services.host.feedback.shake, spec.shake * grow)
  }
  // The skills with a look of their own are drawn by `ShowSignatures`.
  for (const explosion of events.explosion.all()) {
    if (explosion.skill != null && ownLook.has(explosion.skill)) continue
    // A hammer's blow is drawn by `ShowHammerBlows`.
    if (explosion.kind === "blow") continue
    const at = toScreen(projection, explosion.at)
    // A ring of stone bursting out around her (a guard cast): spikes all around, leaning out, dust, a heavy jolt.
    if (explosion.kind === "upheaval") {
      services.host.stones.ring(explosion.at, explosion.radius * 0.7, view.earthrise.tall * 0.7)
      fx.ring(at, explosion.radius * projection.zoom, view.stone.glow, 0.4)
      fx.burst(at, { color: view.stone.light, count: 30, speed: 340, size: 7, life: 0.7, gravity: -120, drag: 3, alpha: 0.55 })
      services.host.feedback.shake = Math.max(services.host.feedback.shake, view.ultimateShake)
      services.host.feedback.punch = Math.max(services.host.feedback.punch, 1)
      continue
    }
    // A rock erupting: stone shooting out of the floor (see `Stones`), a burst of dust and grit, a heavy jolt.
    if (explosion.kind === "eruption") {
      const spec = view.earthrise
      services.host.stones.erupt(explosion.at, explosion.radius, spec.tall)
      fx.flash({ x: at.x, y: at.y - 20 * projection.zoom }, spec.flash, view.stone.glow, 0.16)
      fx.ring(at, explosion.radius * 1.3 * projection.zoom, view.stone.glow, 0.35)
      fx.burst(at, { color: view.stone.light, count: 22, speed: 260, size: 7, life: 0.7, gravity: -120, drag: 3, alpha: 0.55 })
      fx.burst({ x: at.x, y: at.y - 30 * projection.zoom }, { color: view.stone.dark, count: 16, speed: 480, size: 4.5, life: 0.6, gravity: 1100 })
      services.host.feedback.shake = Math.max(services.host.feedback.shake, spec.shake)
      services.host.feedback.punch = Math.max(services.host.feedback.punch, 0.6)
      continue
    }
    const nova = explosion.kind === "nova" && explosion.heavy
    const color = explosion.element !== null ? view.elements[explosion.element] : nova ? view.ultimate : view.playerArea
    fx.ring(at, explosion.radius * projection.zoom, color, nova ? 0.45 : 0.3)
    fx.burst({ x: at.x, y: at.y - 10 }, { color, count: nova ? 48 : 26, speed: nova ? 620 : 380, size: 6, life: 0.5 })
    fx.burst({ x: at.x, y: at.y - 10 }, { color: view.hitFlash, count: 10, speed: 200, size: 4, life: 0.3 })
    services.host.feedback.shake = Math.max(services.host.feedback.shake, nova ? view.ultimateShake : view.explosionShake)
  }
  // A guard: its plates rising around her in a puff of dust; a plate breaking, its chunks thrown out.
  for (const guarded of events.guarded.all()) {
    const at = toScreen(projection, guarded.at)
    // A shot breaking on a barrier: a puff of wind where it met it.
    if (guarded.kind === "barred") {
      fx.burst(at, { color: view.elements.wind, count: 8, speed: 220, size: 4, life: 0.35 })
      continue
    }
    if (guarded.kind === "raised") {
      fx.ring(at, 60 * projection.zoom, view.stone.glow, 0.3)
      fx.burst(at, { color: view.stone.light, count: 14, speed: 160, size: 6, life: 0.6, gravity: -80, drag: 3, alpha: 0.5 })
      continue
    }
    services.host.stones.shatter(guarded.at, 12, 22, 3.5, 360)
    fx.flash({ x: at.x, y: at.y - impact.height * projection.zoom }, 46, view.stone.glow, 0.14)
    fx.ring(at, 90 * projection.zoom, view.stone.middle, 0.3)
    services.host.feedback.shake = Math.max(services.host.feedback.shake, view.impact.heavyShake)
  }
  for (const reaction of events.reaction.all()) react(services.host, toScreen(projection, reaction.at), reaction.kind, reaction.state, resources.tuning.get())
  // Thunder: a bolt along its path at body height, a spark where it lands; a healing zap in the heal color.
  for (const zap of events.zap.all()) {
    if (zap.skill != null && ownLook.has(zap.skill)) continue
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

/** The effect of what elements do at `at` (projected coordinates): a state taking hold, a burst (a ring as far as it reaches), an arc, a slam, a pool put out. */
const react = (host: RenderHostValue, at: Vec2, kind: ReactionKind, state: StateId | null, tuning: TuningValue): void => {
  const fx = host.fx
  const body = { x: at.x, y: at.y - view.impact.height * projection.zoom }
  const color = state === null ? view.stun : view.states[state]
  switch (kind) {
    case "apply":
      if (state === "burning") fx.burst(body, { color, count: 10, speed: 160, size: 3.5, life: 0.4, gravity: -260 })
      else if (state === "soaked") fx.burst(body, { color, count: 12, speed: 200, size: 3.5, life: 0.4, gravity: 420 })
      else if (state === "charged") fx.burst(body, { color, count: 8, speed: 260, size: 2.5, life: 0.25, stretch: 3 })
      // Grit chipped off, falling.
      else if (state === "cracked") fx.burst(body, { color, count: 10, speed: 180, size: 3.5, life: 0.35, gravity: 600 })
      else fx.burst(body, { color, count: 8, speed: 220, size: 3, life: 0.3 })
      return
    case "burst": {
      const reach = state === null ? 100 : tuning.elements.bursts[state].radius
      fx.flash(body, 56, color, 0.2)
      fx.ring(at, reach * projection.zoom, color, 0.45)
      fx.burst(body, { color, count: 22, speed: 340, size: 4, life: 0.45, drag: 2, ...(state === "charged" ? { stretch: 3 } : {}) })
      // A Shatter throws heavy chips that fall back.
      if (state === "cracked") fx.burst(body, { color: view.stone.dark, count: 14, speed: 420, size: 5, life: 0.55, gravity: 900 })
      host.feedback.shake = Math.max(host.feedback.shake, view.impact.heavyShake)
      return
    }
    case "arc":
      return
    case "slam":
      fx.flash(body, 44, view.stun, 0.16)
      fx.ring(at, 50 * projection.zoom, view.stun, 0.35)
      fx.burst(body, { color: view.stun, count: 12, speed: 260, size: 3.5, life: 0.35 })
      host.feedback.shake = Math.max(host.feedback.shake, view.impact.heavyShake)
      return
    case "out":
      fx.flash(body, 40, view.steam, 0.2)
      fx.burst(body, { color: view.steam, count: 16, speed: 120, size: 7, life: 0.8, gravity: -200, drag: 3, alpha: 0.6 })
      return
  }
}

/** Motes off bodies in a state (embers rising off burning ones, drops falling off soaked ones, sparks off charged ones, wisps off swept ones, grit off cracked ones), and embers off fire pools. */
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
    else if (state.id === "soaked") services.host.fx.mote(from, (Math.random() - 0.5) * 16, 10, { color: view.states.soaked, size: 2.5, life: 0.45, gravity: 520, drag: 0.5 })
    else if (state.id === "charged") services.host.fx.mote(from, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, { color: view.states.charged, size: 2, life: 0.15, drag: 4 })
    else if (state.id === "cracked") services.host.fx.mote(from, (Math.random() - 0.5) * 30, -20, { color: view.states.cracked, size: 2.5, life: 0.4, gravity: 600, drag: 0.5 })
    else services.host.fx.mote(from, (Math.random() - 0.5) * 50, -30 - Math.random() * 30, { color: view.states.swept, size: 3, life: 0.4, gravity: -40, drag: 2, alpha: 0.6 })
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
 * wisps curl away and fade. More the faster it goes; standing, only a few
 * still leave its back (`view.spirit.standing` of its rate), small and
 * slow, behind where it faces: seen from behind, they say which way that
 * is. Standing, drops rise like bubbles instead of falling (a body
 * dripping on the spot reads wrong).
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
    const standing = speed < 20
    last.owed += drops.rate * seconds * (standing ? view.spirit.standing : Math.min(1, speed / 290))
    const back = standing ? { x: -node.facing.x, y: -node.facing.y } : { x: -moved.x / (speed * seconds), y: -moved.y / (speed * seconds) }
    const radius = data.body.get().radius
    while (last.owed >= 1) {
      last.owed -= 1
      const color = drops.colors[Math.floor(Math.random() * drops.colors.length)]!
      // From its back, a little to either side, low on its body.
      const across = (Math.random() - 0.5) * radius * 1.1
      const from = { x: at.x + back.x * radius * 0.9 - back.y * across, y: at.y + back.y * radius * 0.9 + back.x * across }
      const height = node.body.height * (standing ? 0.3 + Math.random() * 0.3 : 0.12 + Math.random() * 0.3)
      const shed = drops.kind ?? "drop"
      const kind = standing && shed === "drop" ? "ember" : shed
      const thrown = kind === "drop" ? 50 + Math.random() * 70 : kind === "ember" ? 25 + Math.random() * 40 : 60 + Math.random() * 50
      services.host.drops.emit(from, height, back, standing ? thrown * 0.3 : thrown, drops.size * (standing ? 0.6 : 1) * (0.7 + Math.random() * 0.6), color, kind)
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
    const recoil = recoils.get(entity.id)
    const pivot = node.pivot
    if (recoil === undefined || recoil.age >= recoil.life) {
      pivot.scale.setScalar(1)
      pivot.quaternion.identity()
      // (Its height is a lift's, see `presentation/windwall.ts`.)
      pivot.position.set(0, pivot.position.y, 0)
    } else {
      // Sharp at the blow, springing back with a small overshoot.
      const t = recoil.age / recoil.life
      const k = (1 - t) * (1 - t) * Math.cos(t * Math.PI * 1.2) * recoil.strength
      const widen = 1 + spec.recoil.squash * 0.8 * k
      pivot.scale.set(widen, 1 - spec.recoil.squash * k, widen)
      // Tipped over the feet, the top away from the blow: about the floor axis across the push.
      leanAxis.set(recoil.y, 0, -recoil.x)
      pivot.quaternion.setFromAxisAngle(leanAxis, spec.recoil.lean * k)
      pivot.position.set(recoil.x * spec.recoil.shift * k, pivot.position.y, recoil.y * spec.recoil.shift * k)
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

/**
 * Characters who just fell: each one's body tips back and sinks, her eyes
 * shut and her light going out, coming apart into her element's light,
 * then fades and is gone, over the fall's beat (`Tuning.team.fallBeat`;
 * see `view.spirit.fall`). The next one pops up once she is down (see
 * `DrawPlayer`).
 */
export const PlayFalls = Game.System("Shooter/PlayFalls", {
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ resources, services }) => {
  const fallen = services.host.fallen
  const spec = { ...view.spirit.fall, seconds: resources.tuning.get().team.fallBeat.seconds }
  const seconds = services.clock.frameSeconds
  for (let index = fallen.length - 1; index >= 0; index--) {
    const one = fallen[index]!
    one.age += seconds
    if (one.age >= spec.seconds) {
      services.host.actors.remove(one.root)
      one.body.dispose()
      fallen.splice(index, 1)
      continue
    }
    const t = one.age / spec.seconds
    // Quick at first, settling: knocked down, not lying down.
    const down = 1 - (1 - t) * (1 - t)
    one.pivot.scale.set(1 + 0.3 * down, 1 - (1 - spec.flat) * down, 1 + 0.3 * down)
    // Tipped over her feet, her top away from where she faced.
    leanAxis.set(-one.facing.y, 0, one.facing.x)
    one.pivot.quaternion.setFromAxisAngle(leanAxis, spec.lean * down)
    one.body.animate({ x: one.root.position.x, y: one.root.position.z }, one.facing, 0, true)
    one.body.express?.(1, view.spirit.shut)
    one.body.aura?.(1 - down)
    one.body.paint(0xffffff, view.hitFlash, Math.max(0, 0.8 - t * 3), Math.min(1, (1 - t) / spec.fade))
    // Coming apart: her light rises off her body, more as she fades.
    const body = toScreen(projection, { x: one.root.position.x, y: one.root.position.z })
    const count = Math.floor(spec.motes * seconds * (0.5 + t) + Math.random())
    for (let mote = 0; mote < count; mote++) {
      const from = { x: body.x + (Math.random() - 0.5) * 30, y: body.y - Math.random() * view.impact.height * projection.zoom * 1.6 }
      services.host.fx.mote(from, (Math.random() - 0.5) * 40, -50 - Math.random() * 70, { color: Math.random() < 0.3 ? view.hitFlash : one.color, size: 2 + Math.random() * 3, life: 0.6 + Math.random() * 0.4, gravity: -60, drag: 1.5 })
    }
  }
})

/**
 * The team's stone plates (see `Guard`), circling whoever is on the field
 * at her middle; while she raises a guard, the plates rise out of the floor
 * around her as it gathers.
 */
export const ShowPlates = Game.System("Shooter/ShowPlates", {
  queries: {
    player: Game.Query({
      selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), body: Game.Query.read(Body), raising: Game.Query.optional(Raising) },
      with: [Player]
    })
  },
  resources: { guard: Game.System.readResource(Guard) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const [player] = queries.player.each()
  const time = performance.now() / 1000
  if (player === undefined) {
    services.host.stones.plates(null, 0, 0, 0, 0, time)
    return
  }
  const at = lerp(player.data.previous.get(), player.data.position.get(), services.clock.alpha)
  const radius = player.data.body.get().radius
  const raising = player.data.raising.present ? 1 - player.data.raising.get().remaining / player.data.raising.get().effect.raise : 0
  services.host.stones.plates(at, radius * 2.3, radius * view.bodyHeightFactor * 0.45, resources.guard.get().plates, raising, time)
})

export const UpdateFx = Game.System("Shooter/UpdateFx", {
  queries: { player: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) }, with: [Player] }) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, services }) => {
  const seconds = services.clock.frameSeconds
  services.host.fx.update(seconds)
  services.host.drops.update(seconds)
  services.host.stones.update(seconds)
  services.host.combatLight.finish()
  const [player] = queries.player.each()
  services.host.trails.update(seconds, player === undefined ? undefined : lerp(player.data.previous.get(), player.data.position.get(), services.clock.alpha))
})
