/**
 * The render schedule: ticked once per displayed frame, after the fixed
 * steps for that frame. It reads the world and draws; it never changes
 * gameplay state. Moving things are drawn between their previous and current
 * fixed-step positions (`RenderClock.alpha`), so motion is smooth at any
 * refresh rate while the simulation stays at a fixed rate.
 */
import { RenderSync } from "@typeonce/bevy-ts-pixi"

import { projection, view } from "../config/view.ts"
import { depthOf, toScreen } from "../math/iso.ts"
import { lerp } from "../math/vec.ts"
import {
  Aim,
  Attacker,
  Camera,
  Dash,
  Death,
  Enemy,
  Flow,
  Game,
  Health,
  Hit,
  HitFlash,
  Hitbox,
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
  Stats,
  Tuning,
  Wall,
  Waves
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
  }
}

/** Creates nodes for new renderables and destroys them on removal or despawn. */
const SyncNodes = RenderSync.system(Game, {
  name: "Shooter/SyncNodes",
  renderable: Renderable,
  transform: Renderable,
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
  services.host.world.position.set(Math.round(screen.width / 2 - center.x + shakeX), Math.round(screen.height / 2 - center.y + shakeY))
  services.host.hud.vignette.style.opacity = feedback.hurt.toFixed(3)
})

const InterpolateActors = Game.System("Shooter/InterpolateActors", {
  queries: {
    actors: Game.Query({
      selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) },
      with: [Renderable]
    })
  },
  services: { nodes: Game.System.service(RenderNodes), clock: Game.System.service(RenderClock) }
}, ({ queries, services }) => {
  const alpha = services.clock.alpha
  for (const { entity, data } of queries.actors.each()) {
    const node = services.nodes.get(entity.id)
    if (node === undefined) continue
    const position = lerp(data.previous.get(), data.position.get(), alpha)
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
        flash: Game.Query.read(HitFlash)
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
    const windup = spec !== null && attacker.phase === "windup" ? Math.min(1, attacker.elapsed / spec.windup) : 0
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
    attackers: Game.Query({ selection: { enemy: Game.Query.read(Enemy), attacker: Game.Query.read(Attacker) } }),
    hitboxes: Game.Query({ selection: { hitbox: Game.Query.read(Hitbox) } })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost) }
}, ({ queries, resources, services }) => {
  const g = services.host.telegraphs
  g.clear()
  const tuning = resources.tuning.get()
  for (const { data } of queries.attackers.each()) {
    const attacker = data.attacker.get()
    const spec = tuning.enemies[data.enemy.get().kind].attack
    if (spec === null || attacker.area === null || attacker.phase !== "windup") continue
    const progress = Math.min(1, attacker.elapsed / spec.windup)
    const area = attacker.area
    if (area.kind === "line" && spec.kind === "volley") {
      const locked = aimLocked(spec, attacker)
      const base = Math.atan2(area.direction.y, area.direction.x)
      for (let shot = 0; shot < spec.count; shot++) {
        const offset = spec.count === 1 ? 0 : (shot / (spec.count - 1) - 0.5) * area.spread * 2
        const end = { x: area.origin.x + Math.cos(base + offset) * area.length, y: area.origin.y + Math.sin(base + offset) * area.length }
        g.moveTo(area.origin.x, area.origin.y).lineTo(end.x, end.y)
          .stroke({ width: locked ? 4 : 2, color: locked ? view.telegraphLocked : view.telegraph, alpha: locked ? 0.75 : 0.35 })
      }
      continue
    }
    drawArea(g, area, progress, { color: view.telegraph, fill: 0.12, outline: 0.7 })
  }
  for (const { data } of queries.hitboxes.each()) {
    drawArea(g, data.hitbox.get().area, 0, { color: view.telegraphLocked, fill: 0.55, outline: 1 })
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
    impact: Game.System.readEvent(Impact)
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
  for (const impact of events.impact.all()) {
    const at = toScreen(projection, impact.at)
    fx.burst({ x: at.x, y: at.y - view.projectileHeight * projection.zoom }, {
      color: impact.wall ? view.wallSpark : projectileColor(impact.faction),
      count: impact.wall ? 5 : 3,
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

const DrawReticle = Game.System("Shooter/DrawReticle", {
  services: { host: Game.System.service(RenderHost) }
}, ({ services }) => {
  const { reticle, cursor } = services.host
  reticle.clear()
  reticle.visible = cursor.over
  if (!cursor.over) return
  const r = 12 * projection.zoom
  reticle.ellipse(cursor.x, cursor.y, r, r * projection.squash).stroke({ width: 2, color: view.reticle })
  reticle.circle(cursor.x, cursor.y, 2).fill({ color: view.reticle })
})

const SyncHud = Game.System("Shooter/SyncHud", {
  queries: {
    player: Game.Query({ selection: { dash: Game.Query.read(Dash), health: Game.Query.read(Health) }, with: [Player] }),
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
  SpawnFx,
  UpdateFx,
  FadeOccluders,
  DrawReticle,
  SyncHud
)
