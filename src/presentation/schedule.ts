/**
 * The render schedule: ticked once per displayed frame, after the fixed
 * steps for that frame. It reads the world and draws; it never changes
 * gameplay state. Moving things are drawn between their previous and current
 * fixed-step positions (`RenderClock.alpha`), so motion is smooth at any
 * refresh rate while the simulation stays at a fixed rate.
 */
import { RenderSync } from "@typeonce/bevy-ts-pixi"

import { touchButtons } from "../config/input.ts"
import { engine, skillSlots } from "../config/tuning.ts"
import type { AttackMove, SkillEffect, SkillSpec, Tuning as TuningValue } from "../config/tuning.ts"
import { projection, view, viewZoom } from "../config/view.ts"
import { depthOf, toScreen } from "../math/iso.ts"
import { lerp, normalizeOr } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import {
  Action,
  Aim,
  AttackPhase,
  Attacker,
  Body,
  Camera,
  Cast,
  Controls,
  Dash,
  Death,
  Enemy,
  Energy,
  Explosion,
  Flow,
  Game,
  Health,
  Hit,
  HitFlash,
  Hitbox,
  Hurtbox,
  Impact,
  Invulnerable,
  Knockback,
  Lobbed,
  PendingSpawn,
  Player,
  Position,
  PrevPosition,
  RenderClock,
  RenderHost,
  RenderNodes,
  Renderable,
  Run,
  Shield,
  Skills,
  Sounds,
  Stats,
  TouchInput,
  Tuning,
  Wall,
  Waves,
  Weapon
} from "../schema.ts"
import type { SkillsValue } from "../schema.ts"
import type { Area } from "../physics/areas.ts"
import { aimLocked } from "../features/attacks.ts"
import { bySlot, lobTarget, skillRecharge } from "../features/skills.ts"
import { chargeOf } from "../features/weapons.ts"
import type { Graphics } from "pixi.js"
import type { RenderHostValue } from "./host-types.ts"
import { createNode, enemyColor, projectileColor, wallDepth } from "./nodes.ts"
import type { SoundName } from "./sound.ts"

/** Linear blend of two 0xRRGGBB colors. */
const mixColor = (from: number, to: number, t: number): number => {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return Math.round(a + (b - a) * t) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

/** Draws an attack area in world space (the ground layer projects it). */
const drawArea = (g: Graphics, area: Area, progress: number, style: { readonly color: number; readonly fill: number; readonly outline: number }): void => {
  switch (area.kind) {
    case "circle":
      g.circle(area.center.x, area.center.y, area.radius).fill({ color: style.color, alpha: style.fill })
      g.circle(area.center.x, area.center.y, area.radius).stroke({ width: 3, color: style.color, alpha: style.outline })
      if (progress > 0) g.circle(area.center.x, area.center.y, area.radius * progress).fill({ color: style.color, alpha: style.fill + 0.2 })
      return
    case "cone": {
      const angle = Math.atan2(area.direction.y, area.direction.x)
      const sector = (radius: number) => g
        .moveTo(area.origin.x, area.origin.y)
        .arc(area.origin.x, area.origin.y, radius, angle - area.halfAngle, angle + area.halfAngle)
        .lineTo(area.origin.x, area.origin.y)
      sector(area.radius).fill({ color: style.color, alpha: style.fill })
      sector(area.radius).stroke({ width: 3, color: style.color, alpha: style.outline })
      if (progress > 0) sector(area.radius * progress).fill({ color: style.color, alpha: style.fill + 0.2 })
      return
    }
    case "line":
      return
    case "lane": {
      const side = { x: -area.direction.y * area.halfWidth, y: area.direction.x * area.halfWidth }
      const strip = (length: number) => {
        const end = { x: area.origin.x + area.direction.x * length, y: area.origin.y + area.direction.y * length }
        return [area.origin.x + side.x, area.origin.y + side.y, end.x + side.x, end.y + side.y, end.x - side.x, end.y - side.y, area.origin.x - side.x, area.origin.y - side.y]
      }
      g.poly(strip(area.length)).fill({ color: style.color, alpha: style.fill })
      g.poly(strip(area.length)).stroke({ width: 3, color: style.color, alpha: style.outline })
      if (progress > 0) g.poly(strip(area.length * progress)).fill({ color: style.color, alpha: style.fill + 0.2 })
      return
    }
  }
}

/**
 * Creates nodes for new renderables (placed once from their position) and
 * destroys them on removal or despawn. Moving nodes are placed every frame
 * by `InterpolateActors`.
 */
const SyncNodes = RenderSync.system(Game, {
  name: "Shooter/SyncNodes",
  renderable: Renderable,
  registry: RenderNodes,
  select: { position: Game.Query.read(Position) },
  services: { host: RenderHost },
  create: ({ renderable, services }) => createNode(renderable, services.host.assets, services.host.projectilePool),
  apply: (node, { renderable, data }) => {
    const position = data.position.get()
    const screen = toScreen(projection, position)
    node.root.position.set(screen.x, screen.y)
    node.root.zIndex = renderable.kind === "wall" ? wallDepth(renderable.placement, depthOf(position)) : depthOf(position)
  }
})

/** Camera position (interpolated), screen shake, and the hurt vignette. */
const ApplyCamera = Game.System("Shooter/ApplyCamera", {
  resources: { camera: Game.System.readResource(Camera) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ resources, services }) => {
  const camera = resources.camera.get()
  const feedback = services.host.feedback
  const seconds = services.clock.frameSeconds
  const decay = Math.exp(-view.shakeDecay * seconds)
  feedback.shake = feedback.shake * decay < 0.2 ? 0 : feedback.shake * decay
  feedback.hurt = feedback.hurt * decay < 0.01 ? 0 : feedback.hurt * decay
  const kickDecay = Math.exp(-view.impact.kickDecay * seconds)
  feedback.kick.x *= kickDecay
  feedback.kick.y *= kickDecay
  feedback.punch = feedback.punch * Math.exp(-view.impact.punchDecay * seconds) < 0.01 ? 0 : feedback.punch * Math.exp(-view.impact.punchDecay * seconds)
  // Shake jitters; a kick moves the view along the blow and eases back.
  const offsetX = (Math.random() * 2 - 1) * feedback.shake - feedback.kick.x
  const offsetY = (Math.random() * 2 - 1) * feedback.shake - feedback.kick.y
  const center = toScreen(projection, lerp({ x: camera.prevX, y: camera.prevY }, camera, services.clock.alpha))
  const screen = services.host.app.screen
  // Phones zoom out (see view.camera); the camera stays centered on the player. Heavy blows punch in.
  const zoom = viewZoom(screen) * (1 + view.impact.zoomPunch * feedback.punch)
  services.host.world.scale.set(zoom)
  services.host.world.position.set(Math.round(screen.width / 2 - center.x * zoom + offsetX), Math.round(screen.height / 2 - center.y * zoom + offsetY))
  services.host.hud.vignette.style.opacity = feedback.hurt.toFixed(3)
})

/** Draws moving entities between their previous and current fixed-step positions. */
const InterpolateActors = RenderSync.interpolate(Game, {
  name: "Shooter/InterpolateActors",
  registry: RenderNodes,
  previous: PrevPosition,
  current: Position,
  clock: RenderClock,
  place: (node, position) => {
    const screen = toScreen(projection, position)
    node.root.position.set(screen.x, screen.y)
    node.root.zIndex = depthOf(position)
  }
})

const DrawPlayer = Game.System("Shooter/DrawPlayer", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        previous: Game.Query.read(PrevPosition),
        aim: Game.Query.read(Aim),
        dash: Game.Query.read(Dash),
        invulnerable: Game.Query.read(Invulnerable),
        flash: Game.Query.read(HitFlash),
        skills: Game.Query.read(Skills),
        energy: Game.Query.read(Energy),
        weapon: Game.Query.read(Weapon)
      },
      with: [Player]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { nodes: Game.System.service(RenderNodes), host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const marks = services.host.groundMarks
  marks.clear()
  const tuning = resources.tuning.get()
  for (const { entity, data } of queries.player.each()) {
    const position = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const dash = data.dash.get()
    const radius = tuning.player.radius

    // Stella Sora-style facing: a subtle ring at a melee attack's reach (close around a gun), with a small arrow on it.
    const aim = data.aim.get()
    const weapon = data.weapon.get()
    const attack = tuning.attacks[weapon.attack]
    const first = attack.combo[0]
    const around = first !== undefined && first.shape !== "shot" ? first.reach : radius + view.facingRing.gap
    marks.circle(position.x, position.y, around).stroke({ width: 2, color: view.aim, alpha: view.facingRing.alpha })
    const tip = { x: position.x + aim.x * (around + view.facingRing.arrow), y: position.y + aim.y * (around + view.facingRing.arrow) }
    const base = { x: position.x + aim.x * around, y: position.y + aim.y * around }
    const side = { x: -aim.y * view.facingRing.arrow * 0.7, y: aim.x * view.facingRing.arrow * 0.7 }
    marks.poly([base.x + side.x, base.y + side.y, tip.x, tip.y, base.x - side.x, base.y - side.y]).fill({ color: view.aim, alpha: view.facingRing.arrowAlpha })

    // Dash readiness ring around the feet.
    const ready = dash.cooldown <= 0
    const progress = ready ? 1 : 1 - dash.cooldown / tuning.dash.cooldown
    const ring = radius + 6
    const startAngle = -Math.PI / 2
    marks.moveTo(position.x + Math.cos(startAngle) * ring, position.y + Math.sin(startAngle) * ring)
      .arc(position.x, position.y, ring, startAngle, startAngle + progress * Math.PI * 2)
      .stroke({ width: 3, color: ready ? view.aim : 0x5b6b7d, alpha: ready ? 0.5 : 0.8 })

    // Charging the power attack: a ring filling up around the feet, brighter and thicker once full.
    const charge = attack.power === null ? 0 : chargeOf(attack.power, weapon.held)
    if (charge > 0) {
      const full = charge >= 1
      const chargeRing = radius + view.charge.gap
      marks.moveTo(position.x + Math.cos(startAngle) * chargeRing, position.y + Math.sin(startAngle) * chargeRing)
        .arc(position.x, position.y, chargeRing, startAngle, startAngle + charge * Math.PI * 2)
        .stroke({ width: full ? view.charge.fullWidth : view.charge.width, color: full ? view.charge.full : view.charge.filling, alpha: full ? 0.95 : 0.7 })
    }

    // A nova ready to use: a faint ring showing what it would catch.
    const skills = data.skills.get()
    const energy = data.energy.get().current
    for (const slot of skillSlots) {
      const spec = tuning.skills[skills[slot].skill]
      if (spec.effect.kind !== "nova" || skillRecharge(spec, skills[slot].cooldown, energy) > 0) continue
      marks.circle(position.x, position.y, spec.effect.radius).stroke({ width: 3, color: view.ultimate, alpha: view.ultimateReadyAlpha })
    }

    const node = services.nodes.get(entity.id)
    if (node?.kind === "player") {
      node.body.tint = data.flash.get().remaining > 0 ? view.hitFlash : dash.remaining > 0 ? view.playerDashing : view.player
      node.root.alpha = data.invulnerable.get().remaining > 0 ? 0.55 : 1
    }
  }
})

/** Hit flash on enemy bodies and health bars over damaged enemies. */
const DrawEnemies = Game.System("Shooter/DrawEnemies", {
  queries: {
    enemies: Game.Query({
      selection: {
        enemy: Game.Query.read(Enemy),
        health: Game.Query.read(Health),
        flash: Game.Query.read(HitFlash),
        attacker: Game.Query.read(Attacker),
        phase: Game.Query.read(AttackPhase),
        renderable: Game.Query.read(Renderable)
      }
    })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { nodes: Game.System.service(RenderNodes), host: Game.System.service(RenderHost) }
}, ({ queries, resources, services }) => {
  const tuning = resources.tuning.get()
  const overlay = services.host.overlay
  overlay.clear()
  for (const { entity, data } of queries.enemies.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "enemy") continue
    const kind = data.enemy.get().kind
    const attacker = data.attacker.get()
    const spec = tuning.enemies[kind].attack
    // Anticipation: the body brightens through the windup.
    const windup = spec !== null && data.phase.get() === "windup" ? Math.min(1, attacker.elapsed / spec.windup) : 0
    node.body.tint = data.flash.get().remaining > 0 ? view.hitFlash : mixColor(enemyColor(kind), view.windupTint, windup * 0.75)
    const health = data.health.get()
    if (health.current >= health.max) continue
    const renderable = data.renderable.get()
    const radius = renderable.kind === "enemy" ? renderable.radius : 16
    const width = 34
    const x = node.root.position.x - width / 2
    const y = node.root.position.y - radius * view.enemies[data.enemy.get().kind].heightFactor * projection.zoom - 12
    overlay.rect(x - 1, y - 1, width + 2, 6).fill({ color: view.healthBack, alpha: 0.85 })
    overlay.rect(x, y, width * (health.current / health.max), 4).fill({ color: view.healthFill })
  }
})

/**
 * Everything dangerous, drawn on the floor: attack windups (the exact area
 * that will be hit, filling up until it lands), active hitboxes, aim lines of
 * shooters (brighter once the aim locks), and spawn warnings.
 */
const DrawTelegraphs = Game.System("Shooter/DrawTelegraphs", {
  queries: {
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }),
    attackers: Game.Query({ selection: { enemy: Game.Query.read(Enemy), attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase) } }),
    hitboxes: Game.Query({ selection: { hitbox: Game.Query.read(Hitbox) } }),
    lobbed: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }),
    shields: Game.Query({
      selection: { shield: Game.Query.read(Shield), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), body: Game.Query.read(Body) }
    })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const g = services.host.telegraphs
  g.clear()
  const tuning = resources.tuning.get()
  for (const { data } of queries.attackers.each()) {
    const attacker = data.attacker.get()
    const spec = tuning.enemies[data.enemy.get().kind].attack
    if (spec === null || attacker.area === null || data.phase.get() !== "windup") continue
    const progress = Math.min(1, attacker.elapsed / spec.windup)
    const area = attacker.area
    if (area.kind === "line" && spec.kind === "volley") {
      const locked = aimLocked(spec, "windup", attacker.elapsed)
      const base = Math.atan2(area.direction.y, area.direction.x)
      for (let shot = 0; shot < spec.count; shot++) {
        const offset = spec.count === 1 ? 0 : (shot / (spec.count - 1) - 0.5) * area.spread * 2
        const end = { x: area.origin.x + Math.cos(base + offset) * area.length, y: area.origin.y + Math.sin(base + offset) * area.length }
        g.moveTo(area.origin.x, area.origin.y).lineTo(end.x, end.y)
          .stroke({ width: locked ? 4 : 2, color: locked ? view.telegraphLocked : view.telegraph, alpha: locked ? 0.75 : 0.35 })
      }
      continue
    }
    // Beams track until their aim locks: dim while tracking, bright once locked.
    const tracking = !aimLocked(spec, "windup", attacker.elapsed)
    drawArea(g, area, progress, tracking
      ? { color: view.telegraph, fill: 0.05, outline: 0.35 }
      : { color: spec.kind === "beam" ? view.telegraphLocked : view.telegraph, fill: 0.12, outline: 0.75 })
  }

  // Guardian shields: a bright arc on the side they face.
  for (const { data } of queries.shields.each()) {
    const shield = data.shield.get()
    const at = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const radius = data.body.get().radius + 9
    const facing = Math.atan2(shield.facing.y, shield.facing.x)
    g.moveTo(at.x + Math.cos(facing - shield.halfAngle) * radius, at.y + Math.sin(facing - shield.halfAngle) * radius)
      .arc(at.x, at.y, radius, facing - shield.halfAngle, facing + shield.halfAngle)
      .stroke({ width: 6, color: view.shield, alpha: 0.9 })
  }
  for (const { data } of queries.hitboxes.each()) {
    const hitbox = data.hitbox.get()
    drawArea(g, hitbox.area, 0, { color: hitbox.faction === "player" ? view.playerArea : view.telegraphLocked, fill: 0.55, outline: 1 })
  }

  // Lobbed skills: an arc through the air (shadow on the floor, orb above it), then the fuse ring.
  const overlay = services.host.overlay
  for (const { data } of queries.lobbed.each()) {
    const lobbed = data.lobbed.get()
    const spec = lobbed.effect
    const elapsed = lobbed.elapsed + services.clock.alpha * engine.stepSeconds
    const flight = Math.min(1, elapsed / spec.flightTime)
    const fuse = Math.max(0, Math.min(1, (elapsed - spec.flightTime) / spec.fuse))
    g.circle(lobbed.to.x, lobbed.to.y, spec.radius).stroke({ width: 2, color: view.playerArea, alpha: flight < 1 ? 0.35 : 0.9 })
    if (fuse > 0) g.circle(lobbed.to.x, lobbed.to.y, spec.radius * fuse).fill({ color: view.playerArea, alpha: 0.25 })
    const ground = { x: lobbed.from.x + (lobbed.to.x - lobbed.from.x) * flight, y: lobbed.from.y + (lobbed.to.y - lobbed.from.y) * flight }
    g.circle(ground.x, ground.y, 7).fill({ color: view.shadow, alpha: 0.35 })
    const screen = toScreen(projection, ground)
    const height = 4 * view.grenadeArc * flight * (1 - flight) * projection.zoom
    overlay.circle(screen.x, screen.y - height - 6, 6).fill({ color: view.grenade })
    if (flight >= 1) overlay.circle(screen.x, screen.y - 6, 6).stroke({ width: 2, color: view.playerArea, alpha: 0.5 + 0.5 * Math.sin(elapsed * 40) })
  }
  for (const { data } of queries.pending.each()) {
    const pending = data.pending.get()
    const radius = tuning.enemies[pending.kind].radius + 10
    const progress = 1 - pending.remaining / pending.duration
    g.circle(pending.at.x, pending.at.y, radius).stroke({ width: 3, color: view.spawnWarning, alpha: 0.8 })
    g.circle(pending.at.x, pending.at.y, radius * progress).fill({ color: view.spawnWarning, alpha: 0.25 })
  }
})

/** The sound of each kind of move. It climbs in pitch through the combo (`comboPitchStep` per move); a power move goes deeper. */
const moveSounds: Record<AttackMove["shape"], SoundName> = { arc: "slash", thrust: "thrust", spin: "spin", shot: "shot" }
const comboPitchStep = 0.067
const powerPitch = 0.85

/** The sound of using a skill, by its effect (a nova sounds as it goes off: see `Explosion`). */
const castSounds: Record<SkillEffect["kind"], SoundName | null> = { cut: "wave", lob: "throw", nova: null }

/**
 * Sounds for what happened since the last frame: the player's actions (each
 * combo move its own swing), blows landing (heavier for heavy blows and
 * kills, harsh when the player is hit), explosions, blows turned by shields,
 * and the player's death. Each is panned by where it happened on screen.
 */
const PlaySounds = Game.System("Shooter/PlaySounds", {
  events: {
    action: Game.System.readEvent(Action),
    cast: Game.System.readEvent(Cast),
    hit: Game.System.readEvent(Hit),
    death: Game.System.readEvent(Death),
    impact: Game.System.readEvent(Impact),
    explosion: Game.System.readEvent(Explosion)
  },
  resources: { camera: Game.System.readResource(Camera) },
  services: { sounds: Game.System.service(Sounds), host: Game.System.service(RenderHost) }
}, ({ events, resources, services }) => {
  const sounds = services.sounds
  const camera = resources.camera.get()
  const screen = services.host.app.screen
  const zoom = viewZoom(screen)
  /** Left-right position on screen, softened so nothing plays fully in one ear. */
  const pan = (at: Vec2): number => {
    const x = toScreen(projection, { x: at.x - camera.x, y: at.y - camera.y }).x * zoom
    return Math.max(-1, Math.min(1, x / (screen.width / 2))) * 0.6
  }
  for (const action of events.action.all()) {
    if (action.kind === "attack") sounds.play(moveSounds[action.move.shape], { pitch: action.power ? powerPitch : 1 + action.step * comboPitchStep })
    else sounds.play(action.kind)
  }
  for (const cast of events.cast.all()) {
    const sound = castSounds[cast.effect.kind]
    if (sound !== null) sounds.play(sound, { pan: pan(cast.from) })
  }
  for (const hit of events.hit.all()) {
    if (hit.faction === "player") sounds.play("hurt")
    else sounds.play(hit.killed ? "kill" : hit.heavy ? "heavyHit" : "hit", { pan: pan(hit.at) })
  }
  for (const death of events.death.all()) {
    if (death.faction === "player") sounds.play("death")
  }
  for (const impact of events.impact.all()) {
    if (impact.shielded) sounds.play("block", { pan: pan(impact.at) })
  }
  for (const explosion of events.explosion.all()) sounds.play(explosion.kind === "nova" ? "nova" : "boom", { pan: pan(explosion.at) })
})

/** A world direction as a unit direction on screen. */
const screenDirection = (direction: Vec2): Vec2 => normalizeOr(toScreen(projection, direction), { x: 0, y: -1 })

/**
 * Turns gameplay events into cosmetic effects: slash trails, and for each
 * blow that lands an impact flash, sparks flying along the push, a popping
 * number, a recoil of the body hit, and camera shake (plus a kick and a zoom
 * punch for heavy blows; see `view.impact`).
 */
const SpawnFx = Game.System("Shooter/SpawnFx", {
  events: {
    action: Game.System.readEvent(Action),
    hit: Game.System.readEvent(Hit),
    death: Game.System.readEvent(Death),
    impact: Game.System.readEvent(Impact),
    explosion: Game.System.readEvent(Explosion)
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost) }
}, ({ events, resources, services }) => {
  const fx = services.host.fx
  const feedback = services.host.feedback
  const impact = view.impact
  for (const action of events.action.all()) {
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
  for (const death of events.death.all()) {
    const at = toScreen(projection, death.at)
    const color = death.enemy === undefined ? view.player : enemyColor(death.enemy)
    fx.burst({ x: at.x, y: at.y - 16 }, { color, count: 18, speed: 320, size: 6, life: 0.55 })
  }
  for (const explosion of events.explosion.all()) {
    const at = toScreen(projection, explosion.at)
    const nova = explosion.kind === "nova"
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
const ReactToHits = Game.System("Shooter/ReactToHits", {
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

const UpdateFx = Game.System("Shooter/UpdateFx", {
  queries: { player: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) }, with: [Player] }) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, services }) => {
  const seconds = services.clock.frameSeconds
  services.host.fx.update(seconds)
  const [player] = queries.player.each()
  services.host.trails.update(seconds, player === undefined ? undefined : lerp(player.data.previous.get(), player.data.position.get(), services.clock.alpha))
})

/**
 * Fades pillars that stand in front of the player, so the player is never
 * fully hidden. Runs after actors are placed for this frame.
 */
const FadeOccluders = Game.System("Shooter/FadeOccluders", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    occluders: Game.Query({ selection: { renderable: Game.Query.read(Renderable) }, with: [Wall] })
  },
  services: { nodes: Game.System.service(RenderNodes) }
}, ({ queries, services }) => {
  const players = queries.player.each().flatMap(({ entity }) => {
    const node = services.nodes.get(entity.id)
    return node === undefined ? [] : [{ bounds: node.root.getBounds(), depth: node.root.zIndex }]
  })
  for (const { entity, data } of queries.occluders.each()) {
    const renderable = data.renderable.get()
    if (renderable.kind !== "wall" || renderable.placement !== "sorted") continue
    const node = services.nodes.get(entity.id)
    if (node === undefined) continue
    const bounds = node.root.getBounds()
    const hides = players.some((player) =>
      player.depth < node.root.zIndex &&
      player.bounds.x < bounds.x + bounds.width && player.bounds.x + player.bounds.width > bounds.x &&
      player.bounds.y < bounds.y + bounds.height && player.bounds.y + player.bounds.height > bounds.y)
    node.root.alpha = hides ? view.occluderAlpha : 1
  }
})

/**
 * Attack cues, drawn on the floor. With a melee attack, the opening move's
 * area in front of the player, only while it matters: an enemy within the
 * attack assist's range, or a move still recharging; otherwise it lingers
 * briefly and fades (`view.slashCue`), so a facing that nothing depends on is
 * not on screen. On touch, also the assist's pick (a ring), a line along the
 * aim while holding a projectile attack, and, while a skill button is
 * dragged, what the skill will cover (see `drawSkillAim`).
 */
const DrawTouchAim = Game.System("Shooter/DrawTouchAim", {
  queries: {
    player: Game.Query({
      selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), aim: Game.Query.read(Aim), weapon: Game.Query.read(Weapon), skills: Game.Query.read(Skills) },
      with: [Player]
    }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), hurtbox: Game.Query.read(Hurtbox) }, with: [Enemy] })
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const controls = resources.controls.get()
  const [player] = queries.player.each()
  if (player === undefined) return
  const g = services.host.telegraphs
  const at = lerp(player.data.previous.get(), player.data.position.get(), services.clock.alpha)
  const tuning = resources.tuning.get()
  const first = tuning.attacks[player.data.weapon.get().attack].combo[0]
  if (first !== undefined && first.shape !== "shot") {
    const cue = services.host.feedback.slashCue
    const range = first.reach + tuning.touch.assist.range
    const nearby = queries.enemies.each().some(({ data }) => {
      const enemy = data.position.get()
      return Math.hypot(enemy.x - at.x, enemy.y - at.y) - data.hurtbox.get().radius <= range
    })
    const recharging = player.data.weapon.get().cooldown > 0
    const seconds = services.clock.frameSeconds
    if (nearby || recharging) {
      cue.idle = 0
      cue.alpha = Math.min(1, cue.alpha + seconds / view.slashCue.fadeInSeconds)
    } else {
      cue.idle += seconds
      if (cue.idle > view.slashCue.lingerSeconds) cue.alpha = Math.max(0, cue.alpha - seconds / view.slashCue.fadeOutSeconds)
    }
    if (cue.alpha > 0) {
      // The opening move's reach and arc (the combo's other moves differ).
      const halfAngle = first.shape === "arc" ? (first.arcDegrees * Math.PI) / 360 : Math.PI
      drawArea(g, { kind: "cone", origin: at, direction: player.data.aim.get(), radius: first.reach, halfAngle }, 0, {
        color: view.playerArea,
        fill: (recharging ? 0.1 : 0.05) * cue.alpha,
        outline: (recharging ? 0.5 : 0.3) * cue.alpha
      })
    }
  }
  if (controls.device !== "touch") return
  // The enemy an attack now would turn toward (attack assist), ringed on the floor.
  if (controls.assistTarget !== null) {
    for (const { entity, data } of queries.enemies.each()) {
      if (entity.id.value !== controls.assistTarget) continue
      const target = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
      const radius = data.hurtbox.get().radius + 8
      g.circle(target.x, target.y, radius).fill({ color: view.reticle, alpha: controls.attackHeld ? 0.18 : 0.08 })
      g.circle(target.x, target.y, radius).stroke({ width: 3, color: view.reticle, alpha: controls.attackHeld ? 0.95 : 0.6 })
    }
  }
  if (controls.attackHeld && first?.shape === "shot") {
    const dx = controls.aimPoint.x - at.x
    const dy = controls.aimPoint.y - at.y
    const reach = Math.min(first.range, 320) / (Math.hypot(dx, dy) || 1)
    g.moveTo(at.x, at.y).lineTo(at.x + dx * reach, at.y + dy * reach).stroke({ width: 3, color: view.reticle, alpha: 0.45 })
  }
  const skills = player.data.skills.get()
  for (const slot of skillSlots) {
    const aiming = controls.skills[slot].aiming
    if (aiming !== null) drawSkillAim(g, tuning.skills[skills[slot].skill].effect, at, aiming)
  }
})

/** What a skill used from `at` toward `aiming` will cover: a cut's lane, or where a lob lands and its blast. */
const drawSkillAim = (g: Graphics, effect: SkillEffect, at: Vec2, aiming: Vec2): void => {
  switch (effect.kind) {
    case "cut": {
      const direction = normalizeOr({ x: aiming.x - at.x, y: aiming.y - at.y }, { x: 1, y: 0 })
      drawArea(g, { kind: "lane", origin: at, direction, length: effect.length, halfWidth: effect.width / 2 }, 0, { color: view.reticle, fill: 0.08, outline: 0.6 })
      return
    }
    case "lob": {
      const target = lobTarget(effect, at, aiming)
      g.moveTo(at.x, at.y).lineTo(target.x, target.y).stroke({ width: 2, color: view.reticle, alpha: 0.35 })
      g.circle(target.x, target.y, effect.radius).fill({ color: view.reticle, alpha: 0.08 }).stroke({ width: 2, color: view.reticle, alpha: 0.6 })
      return
    }
    case "nova":
      g.circle(at.x, at.y, effect.radius).fill({ color: view.reticle, alpha: 0.08 }).stroke({ width: 2, color: view.reticle, alpha: 0.6 })
      return
  }
}

/**
 * The on-screen touch controls: the stick under the thumb (or a faint hint
 * where it usually is), the buttons with their cooldowns, and the drag marker
 * of an aiming button. Keyboard-only HUD parts hide while playing by touch.
 */
const SyncTouchPad = Game.System("Shooter/SyncTouchPad", {
  queries: {
    player: Game.Query({ selection: { dash: Game.Query.read(Dash), skills: Game.Query.read(Skills), energy: Game.Query.read(Energy), weapon: Game.Query.read(Weapon) }, with: [Player] })
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost), touch: Game.System.service(TouchInput) }
}, ({ queries, resources, services }) => {
  const hud = services.host.hud
  const pad = hud.pad
  const touchMode = resources.controls.get().device === "touch"
  if (pad.root.hidden === touchMode) {
    pad.root.hidden = !touchMode
    for (const element of hud.desktopOnly) element.hidden = touchMode
    hud.gameOverHint.textContent = touchMode ? "Tap a button to restart" : "Press R or click to restart"
  }
  if (!touchMode) return
  const live = services.touch.view()
  const place = (element: HTMLElement, x: number, y: number, radius: number) => {
    element.style.transform = `translate(${x - radius}px, ${y - radius}px)`
    element.style.width = element.style.height = `${radius * 2}px`
  }
  const stickRadius = live.layout.stick.radius
  if (live.stick === null) {
    // Where the thumb usually rests: a hint of the floating stick.
    const region = live.layout.stick.region
    const rest = { x: region.left + stickRadius * 2, y: region.top + region.height - stickRadius * 2 }
    place(pad.stick, rest.x, rest.y, stickRadius)
    place(pad.knob, stickRadius, stickRadius, stickRadius * 0.45)
    pad.stick.classList.remove("is-active")
  } else {
    place(pad.stick, live.stick.origin.x, live.stick.origin.y, stickRadius)
    place(pad.knob, stickRadius + live.stick.knob.x - live.stick.origin.x, stickRadius + live.stick.knob.y - live.stick.origin.y, stickRadius * 0.45)
    pad.stick.classList.add("is-active")
  }

  const tuning = resources.tuning.get()
  const [player] = queries.player.each()
  const slots = player === undefined ? undefined : skillStatus(tuning, player.data.skills.get(), player.data.energy.get().current)
  const fill = {
    // The attack recharges between moves.
    attack: player === undefined ? 0 : recharge(player.data.weapon.get()),
    special: slots?.special.recharge ?? 0,
    dash: player === undefined ? 0 : player.data.dash.get().cooldown / tuning.dash.cooldown,
    ultimate: slots?.ultimate.recharge ?? 1
  }
  if (slots !== undefined) {
    for (const slot of skillSlots) setText(pad.buttons[slot].root.querySelector("span"), slots[slot].spec.label)
  }
  for (const name of touchButtons) {
    const zone = live.layout.buttons[name]
    const refs = pad.buttons[name]
    const state = live.buttons[name]
    place(refs.root, zone.center.x, zone.center.y, zone.radius)
    refs.root.classList.toggle("is-held", state.held)
    refs.root.classList.toggle("is-ready", fill[name] <= 0)
    refs.cooldown.style.height = `${Math.max(0, Math.min(100, fill[name] * 100))}%`
    const aim = state.aim
    refs.aim.hidden = aim === null || zone.aimRadius === undefined
    if (aim !== null && zone.aimRadius !== undefined) {
      place(refs.aim, zone.center.x + aim.x * zone.aimRadius, zone.center.y + aim.y * zone.aimRadius, 14)
    }
  }
})

/** Each slot's skill and how far it is from ready (0..1, see `skillRecharge`). */
const skillStatus = (tuning: TuningValue, skills: SkillsValue, energy: number) =>
  bySlot((slot) => {
    const spec: SkillSpec = tuning.skills[skills[slot].skill]
    return { spec, recharge: skillRecharge(spec, skills[slot].cooldown, energy) }
  })

/** How much of the current move's recovery is left, 0..1. */
const recharge = (weapon: { readonly cooldown: number; readonly recovery: number }): number =>
  weapon.recovery <= 0 ? 0 : weapon.cooldown / weapon.recovery

/** Sets an element's text only when it changes. */
const setText = (element: Element | null, text: string): void => {
  if (element !== null && element.textContent !== text) element.textContent = text
}

const DrawReticle = Game.System("Shooter/DrawReticle", {
  resources: { controls: Game.System.readResource(Controls) },
  services: { host: Game.System.service(RenderHost) }
}, ({ resources, services }) => {
  const { reticle, cursor } = services.host
  reticle.clear()
  reticle.visible = cursor.over && resources.controls.get().device === "desktop"
  if (!cursor.over) return
  const r = 12 * projection.zoom
  reticle.ellipse(cursor.x, cursor.y, r, r * projection.squash).stroke({ width: 2, color: view.reticle })
  reticle.circle(cursor.x, cursor.y, 2).fill({ color: view.reticle })
})

const SyncHud = Game.System("Shooter/SyncHud", {
  queries: {
    player: Game.Query({ selection: { dash: Game.Query.read(Dash), health: Game.Query.read(Health), skills: Game.Query.read(Skills), energy: Game.Query.read(Energy) }, with: [Player] }),
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } })
  },
  resources: {
    stats: Game.System.readResource(Stats),
    waves: Game.System.readResource(Waves),
    run: Game.System.readResource(Run),
    tuning: Game.System.readResource(Tuning)
  },
  machines: { flow: Game.System.machine(Flow) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock), sounds: Game.System.service(Sounds) }
}, ({ queries, resources, machines, services }) => {
  const hud = services.host.hud
  const waves = resources.waves.get()
  const feedback = services.host.feedback
  if (waves.number !== feedback.bannerWave) {
    feedback.bannerWave = waves.number
    if (waves.number > 0) {
      services.sounds.play("waveStart")
      hud.banner.textContent = `WAVE ${waves.number}`
      hud.banner.classList.remove("is-showing")
      void hud.banner.offsetWidth // restart the CSS animation
      hud.banner.classList.add("is-showing")
    }
  }
  const over = machines.flow.get() === "GameOver"
  if (hud.gameOver.hidden === over) {
    hud.gameOver.hidden = !over
    const run = resources.run.get()
    const combat = resources.stats.get()
    hud.gameOverStats.textContent = `Wave ${waves.number} · ${combat.kills} kills · ${run.time.toFixed(1)}s`
  }

  const stats = services.host.stats
  stats.sinceHud += services.clock.frameSeconds
  if (stats.sinceHud < 0.1) return
  stats.sinceHud = 0
  const player = queries.player.singleOptional()
  const dash = player.ok && player.value !== undefined ? player.value.data.dash.get() : undefined
  const health = player.ok && player.value !== undefined ? player.value.data.health.get() : { current: 0, max: resources.tuning.get().player.hp }
  if (player.ok && player.value !== undefined) {
    // Each slot drains as its cooldown runs down and as energy fills up.
    const slots = skillStatus(resources.tuning.get(), player.value.data.skills.get(), player.value.data.energy.get().current)
    for (const slot of skillSlots) {
      const refs = hud.skills[slot]
      setText(refs.root.querySelector("span"), slots[slot].spec.name)
      refs.cooldown.style.height = `${100 * slots[slot].recharge}%`
      refs.root.classList.toggle("is-ready", slots[slot].recharge <= 0)
    }
  }
  hud.health.style.width = `${(100 * health.current) / health.max}%`
  hud.healthText.textContent = `${Math.ceil(health.current)} / ${health.max}`
  const remaining = queries.enemies.each().length + queries.pending.each().length + waves.queue.length
  hud.wave.textContent = !resources.tuning.get().waves.enabled
    ? "training"
    : waves.number === 0 ? "get ready" : waves.phase === "break" ? `wave ${waves.number} cleared` : `wave ${waves.number} · ${remaining} left`
  hud.dash.textContent = dash === undefined ? "" : dash.cooldown <= 0 ? "DASH ready" : `DASH ${dash.cooldown.toFixed(2)}s`
  const combat = resources.stats.get()
  hud.combat.textContent = `kills ${combat.kills} · shots ${combat.shots}`
  hud.stats.textContent = `${stats.fps.toFixed(0)} fps · sim ${stats.simMs.toFixed(1)}ms · draw ${stats.drawMs.toFixed(1)}ms · ${services.host.actors.children.length} nodes · ${services.host.fx.active + services.host.trails.active} fx`
})

export const frame = Game.Schedule(
  SyncNodes,
  ApplyCamera,
  InterpolateActors,
  DrawPlayer,
  DrawEnemies,
  DrawTelegraphs,
  DrawTouchAim,
  PlaySounds,
  SpawnFx,
  ReactToHits,
  UpdateFx,
  FadeOccluders,
  DrawReticle,
  SyncHud,
  SyncTouchPad
)
