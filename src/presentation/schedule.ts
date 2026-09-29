/**
 * The render schedule: ticked once per displayed frame, after the fixed
 * steps for that frame. It reads the world and draws; it never changes
 * gameplay state. Moving things are drawn between their previous and current
 * fixed-step positions (`RenderClock.alpha`), so motion is smooth at any
 * refresh rate while the simulation stays at a fixed rate.
 */
import { RenderSync } from "@typeonce/bevy-ts-pixi"

import { touchButtons } from "../config/input.ts"
import { engine } from "../config/tuning.ts"
import { projection, view, viewZoom } from "../config/view.ts"
import { depthOf, toScreen } from "../math/iso.ts"
import { lerp } from "../math/vec.ts"
import {
  Aim,
  Attacker,
  AttackPhase,
  Body,
  Camera,
  Controls,
  Dash,
  Death,
  Enemy,
  Explosion,
  Flow,
  Grenade,
  Game,
  Health,
  Hit,
  HitFlash,
  Hitbox,
  Hurtbox,
  Impact,
  Invulnerable,
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
  Stats,
  Ultimate,
  TouchInput,
  Tuning,
  Wall,
  Waves,
  Weapon
} from "../schema.ts"
import type { Area } from "../physics/areas.ts"
import { aimLocked } from "../features/attacks.ts"
import type { Graphics } from "pixi.js"
import { createNode, enemyColor, projectileColor, wallDepth } from "./nodes.ts"

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
  const decay = Math.exp(-view.shakeDecay * services.clock.frameSeconds)
  feedback.shake = feedback.shake * decay < 0.2 ? 0 : feedback.shake * decay
  feedback.hurt = feedback.hurt * decay < 0.01 ? 0 : feedback.hurt * decay
  const shakeX = (Math.random() * 2 - 1) * feedback.shake
  const shakeY = (Math.random() * 2 - 1) * feedback.shake
  const center = toScreen(projection, lerp({ x: camera.prevX, y: camera.prevY }, camera, services.clock.alpha))
  const screen = services.host.app.screen
  // Phones zoom out (see view.camera); the camera stays centered on the player.
  const zoom = viewZoom(screen)
  services.host.world.scale.set(zoom)
  services.host.world.position.set(Math.round(screen.width / 2 - center.x * zoom + shakeX), Math.round(screen.height / 2 - center.y * zoom + shakeY))
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
        ultimate: Game.Query.read(Ultimate)
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
    const aim = data.aim.get()
    const dash = data.dash.get()
    const radius = tuning.player.radius

    // Aim chevron on the floor.
    const tip = { x: position.x + aim.x * (radius + 46), y: position.y + aim.y * (radius + 46) }
    const base = { x: position.x + aim.x * (radius + 16), y: position.y + aim.y * (radius + 16) }
    const side = { x: -aim.y * 12, y: aim.x * 12 }
    marks.poly([base.x + side.x, base.y + side.y, tip.x, tip.y, base.x - side.x, base.y - side.y]).fill({ color: view.aim, alpha: 0.7 })

    // Dash readiness ring around the feet.
    const ready = dash.cooldown <= 0
    const progress = ready ? 1 : 1 - dash.cooldown / tuning.dash.cooldown
    const ring = radius + 6
    const startAngle = -Math.PI / 2
    marks.moveTo(position.x + Math.cos(startAngle) * ring, position.y + Math.sin(startAngle) * ring)
      .arc(position.x, position.y, ring, startAngle, startAngle + progress * Math.PI * 2)
      .stroke({ width: 3, color: ready ? view.aim : 0x5b6b7d, alpha: ready ? 0.5 : 0.8 })

    // Ultimate ready: a faint ring showing what it would catch.
    if (data.ultimate.get().energy >= tuning.ultimate.energy) {
      marks.circle(position.x, position.y, tuning.ultimate.radius).stroke({ width: 3, color: view.ultimate, alpha: view.ultimateReadyAlpha })
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
    grenades: Game.Query({ selection: { grenade: Game.Query.read(Grenade) } }),
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

  // Grenades: an arc through the air (shadow on the floor, orb above it), then the fuse ring.
  const spec = tuning.skills.grenade
  const overlay = services.host.overlay
  for (const { data } of queries.grenades.each()) {
    const grenade = data.grenade.get()
    const elapsed = grenade.elapsed + services.clock.alpha * engine.stepSeconds
    const flight = Math.min(1, elapsed / spec.flightTime)
    const fuse = Math.max(0, Math.min(1, (elapsed - spec.flightTime) / spec.fuse))
    g.circle(grenade.to.x, grenade.to.y, spec.radius).stroke({ width: 2, color: view.playerArea, alpha: flight < 1 ? 0.35 : 0.9 })
    if (fuse > 0) g.circle(grenade.to.x, grenade.to.y, spec.radius * fuse).fill({ color: view.playerArea, alpha: 0.25 })
    const ground = { x: grenade.from.x + (grenade.to.x - grenade.from.x) * flight, y: grenade.from.y + (grenade.to.y - grenade.from.y) * flight }
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

/** Turns gameplay events into cosmetic effects. */
const SpawnFx = Game.System("Shooter/SpawnFx", {
  events: {
    hit: Game.System.readEvent(Hit),
    death: Game.System.readEvent(Death),
    impact: Game.System.readEvent(Impact),
    explosion: Game.System.readEvent(Explosion)
  },
  services: { host: Game.System.service(RenderHost) }
}, ({ events, services }) => {
  const fx = services.host.fx
  for (const hit of events.hit.all()) {
    const at = toScreen(projection, hit.at)
    if (hit.faction === "player") {
      services.host.feedback.shake = Math.max(services.host.feedback.shake, view.hurtShake)
      services.host.feedback.hurt = 1
    }
    fx.number(at, hit.amount, hit.faction === "enemy" ? view.damageNumber : view.healthFill)
    fx.burst({ x: at.x, y: at.y - 18 }, { color: view.hitFlash, count: 4, speed: 160, size: 3, life: 0.2 })
  }
  for (const death of events.death.all()) {
    const at = toScreen(projection, death.at)
    const color = death.enemy === undefined ? view.player : enemyColor(death.enemy)
    fx.burst({ x: at.x, y: at.y - 16 }, { color, count: 18, speed: 320, size: 6, life: 0.55 })
  }
  for (const explosion of events.explosion.all()) {
    const at = toScreen(projection, explosion.at)
    const ultimate = explosion.kind === "ultimate"
    const color = ultimate ? view.ultimate : view.playerArea
    fx.ring(at, explosion.radius * projection.zoom, color, ultimate ? 0.45 : 0.3)
    fx.burst({ x: at.x, y: at.y - 10 }, { color, count: ultimate ? 48 : 26, speed: ultimate ? 620 : 380, size: 6, life: 0.5 })
    fx.burst({ x: at.x, y: at.y - 10 }, { color: view.hitFlash, count: 10, speed: 200, size: 4, life: 0.3 })
    services.host.feedback.shake = Math.max(services.host.feedback.shake, ultimate ? view.ultimateShake : view.explosionShake)
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

const UpdateFx = Game.System("Shooter/UpdateFx", {
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ services }) => {
  services.host.fx.update(services.clock.frameSeconds)
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
 * Where the player faces, drawn on the floor: with the sword, the outline of
 * the slash in front of the player (brighter while slashing). On touch, also
 * a line along the aim while shooting, and, while the grenade is dragged,
 * where it will land (clamped to its range) and its blast radius.
 */
const DrawTouchAim = Game.System("Shooter/DrawTouchAim", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), aim: Game.Query.read(Aim) }, with: [Player] }),
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
  if (tuning.slash.enabled) {
    const aim = player.data.aim.get()
    const halfAngle = (tuning.slash.arcDegrees * Math.PI) / 360
    drawArea(g, { kind: "cone", origin: at, direction: aim, radius: tuning.slash.reach, halfAngle }, 0, {
      color: view.playerArea,
      fill: controls.fireHeld ? 0.1 : 0.04,
      outline: controls.fireHeld ? 0.5 : 0.25
    })
  }
  if (controls.device !== "touch") return
  // The enemy an attack now would turn toward (attack assist), ringed on the floor.
  if (controls.assistTarget !== null) {
    for (const { entity, data } of queries.enemies.each()) {
      if (entity.id.value !== controls.assistTarget) continue
      const target = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
      const radius = data.hurtbox.get().radius + 8
      g.circle(target.x, target.y, radius).fill({ color: view.reticle, alpha: controls.fireHeld ? 0.18 : 0.08 })
      g.circle(target.x, target.y, radius).stroke({ width: 3, color: view.reticle, alpha: controls.fireHeld ? 0.95 : 0.6 })
    }
  }
  if (controls.fireHeld && !tuning.slash.enabled) {
    const dx = controls.aimPoint.x - at.x
    const dy = controls.aimPoint.y - at.y
    const reach = Math.min(tuning.weapon.range, 320) / (Math.hypot(dx, dy) || 1)
    g.moveTo(at.x, at.y).lineTo(at.x + dx * reach, at.y + dy * reach).stroke({ width: 3, color: view.reticle, alpha: 0.45 })
  }
  if (controls.grenadeAiming !== null) {
    const spec = tuning.skills.grenade
    const dx = controls.grenadeAiming.x - at.x
    const dy = controls.grenadeAiming.y - at.y
    const clamp = Math.min(1, spec.maxRange / (Math.hypot(dx, dy) || 1))
    const target = { x: at.x + dx * clamp, y: at.y + dy * clamp }
    g.moveTo(at.x, at.y).lineTo(target.x, target.y).stroke({ width: 2, color: view.reticle, alpha: 0.35 })
    g.circle(target.x, target.y, spec.radius).fill({ color: view.reticle, alpha: 0.08 }).stroke({ width: 2, color: view.reticle, alpha: 0.6 })
  }
})

/**
 * The on-screen touch controls: the stick under the thumb (or a faint hint
 * where it usually is), the buttons with their cooldowns, and the drag marker
 * of an aiming button. Keyboard-only HUD parts hide while playing by touch.
 */
const SyncTouchPad = Game.System("Shooter/SyncTouchPad", {
  queries: {
    player: Game.Query({ selection: { dash: Game.Query.read(Dash), skills: Game.Query.read(Skills), ultimate: Game.Query.read(Ultimate), weapon: Game.Query.read(Weapon) }, with: [Player] })
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
  const fill = {
    // The sword recharges between slashes; the gun fires too fast to show.
    attack: player === undefined || !tuning.slash.enabled ? 0 : player.data.weapon.get().cooldown / tuning.slash.interval,
    skill: player === undefined ? 0 : player.data.skills.get().grenade.cooldown / tuning.skills.grenade.cooldown,
    dash: player === undefined ? 0 : player.data.dash.get().cooldown / tuning.dash.cooldown,
    ultimate: player === undefined ? 1 : 1 - player.data.ultimate.get().energy / tuning.ultimate.energy
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
    player: Game.Query({ selection: { dash: Game.Query.read(Dash), health: Game.Query.read(Health), skills: Game.Query.read(Skills), ultimate: Game.Query.read(Ultimate) }, with: [Player] }),
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
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, machines, services }) => {
  const hud = services.host.hud
  const waves = resources.waves.get()
  const feedback = services.host.feedback
  if (waves.number !== feedback.bannerWave) {
    feedback.bannerWave = waves.number
    if (waves.number > 0) {
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
    const specs = resources.tuning.get()
    const grenade = player.value.data.skills.get().grenade.cooldown
    hud.skills.grenade.cooldown.style.height = `${Math.min(100, (100 * grenade) / specs.skills.grenade.cooldown)}%`
    hud.skills.grenade.root.classList.toggle("is-ready", grenade <= 0)
    // The ultimate slot fills up with energy.
    const energy = player.value.data.ultimate.get().energy
    hud.skills.ultimate.cooldown.style.height = `${Math.max(0, 100 - (100 * energy) / specs.ultimate.energy)}%`
    hud.skills.ultimate.root.classList.toggle("is-ready", energy >= specs.ultimate.energy)
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
  hud.stats.textContent = `${stats.fps.toFixed(0)} fps · sim ${stats.simMs.toFixed(1)}ms · draw ${stats.drawMs.toFixed(1)}ms · ${services.host.actors.children.length} nodes · ${services.host.fx.active} fx`
})

export const frame = Game.Schedule(
  SyncNodes,
  ApplyCamera,
  InterpolateActors,
  DrawPlayer,
  DrawEnemies,
  DrawTelegraphs,
  DrawTouchAim,
  SpawnFx,
  UpdateFx,
  FadeOccluders,
  DrawReticle,
  SyncHud,
  SyncTouchPad
)
