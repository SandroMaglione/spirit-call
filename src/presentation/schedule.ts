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
  Camera,
  Dash,
  Death,
  Enemy,
  Game,
  Health,
  Hit,
  HitFlash,
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
  Stats,
  Tuning,
  Wall
} from "../schema.ts"
import { createNode, enemyColor, projectileColor, wallDepth } from "./nodes.ts"

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

const ApplyCamera = Game.System("Shooter/ApplyCamera", {
  resources: { camera: Game.System.readResource(Camera) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ resources, services }) => {
  const camera = resources.camera.get()
  const center = toScreen(projection, lerp({ x: camera.prevX, y: camera.prevY }, camera, services.clock.alpha))
  const screen = services.host.app.screen
  services.host.world.position.set(Math.round(screen.width / 2 - center.x), Math.round(screen.height / 2 - center.y))
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
        renderable: Game.Query.read(Renderable)
      }
    })
  },
  services: { nodes: Game.System.service(RenderNodes), host: Game.System.service(RenderHost) }
}, ({ queries, services }) => {
  const overlay = services.host.overlay
  overlay.clear()
  for (const { entity, data } of queries.enemies.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "enemy") continue
    node.body.tint = data.flash.get().remaining > 0 ? view.hitFlash : enemyColor(data.enemy.get().kind)
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

/** Spawn warnings on the floor: a ring that fills up until the enemy appears. */
const DrawTelegraphs = Game.System("Shooter/DrawTelegraphs", {
  queries: { pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }) },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost) }
}, ({ queries, resources, services }) => {
  const g = services.host.telegraphs
  g.clear()
  const tuning = resources.tuning.get()
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
  queries: { player: Game.Query({ selection: { dash: Game.Query.read(Dash) }, with: [Player] }) },
  resources: { stats: Game.System.readResource(Stats) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const stats = services.host.stats
  stats.sinceHud += services.clock.frameSeconds
  if (stats.sinceHud < 0.1) return
  stats.sinceHud = 0
  const player = queries.player.singleOptional()
  const dash = player.ok && player.value !== undefined ? player.value.data.dash.get() : undefined
  const hud = services.host.hud
  hud.dash.textContent = dash === undefined ? "" : dash.cooldown <= 0 ? "DASH ready" : `DASH ${dash.cooldown.toFixed(2)}s`
  const combat = resources.stats.get()
  hud.combat.textContent = `kills ${combat.kills} · shots ${combat.shots}`
  hud.stats.textContent = `${stats.fps.toFixed(0)} fps · ${services.host.actors.children.length} nodes · ${services.host.fx.active} fx`
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
