/**
 * The scene: render nodes for renderables, the camera, interpolated actor
 * positions, and pillars fading in front of the player.
 */
import { RenderSync } from "@typeonce/bevy-ts-pixi"
import { projection, view, viewZoom } from "../config/view.ts"
import { engine } from "../config/tuning.ts"
import { depthOf, screenHeight, toScreen, worldHeight } from "../math/iso.ts"
import { lerp } from "../math/vec.ts"
import { arenaOf, hazardBoxes } from "../features/arena.ts"
import { Camera, Challenge, Disc, Game, Lobbed, Player, Position, PrevPosition, Projectile, RenderClock, RenderHost, RenderNodes, Renderable, SlowMotion, Tuning, Velocity, Wall } from "../schema.ts"
import { createNode, placeTracer, projectileColor } from "./nodes.ts"
import { mixColor } from "./draw.ts"

/**
 * Creates nodes for new renderables (placed once from their position) and
 * destroys them on removal or despawn. Moving nodes are placed every frame
 * by `InterpolateActors`.
 */
export const SyncNodes = RenderSync.system(Game, {
  name: "Shooter/SyncNodes",
  renderable: Renderable,
  registry: RenderNodes,
  select: { position: Game.Query.read(Position) },
  services: { host: RenderHost },
  create: ({ renderable, services }) => createNode(renderable, services.host.assets, services.host.projectilePool),
  apply: (node, { data }) => {
    const position = data.position.get()
    node.root.position.set(position.x, 0, position.y)
  }
})

/** Dresses the floor of the arena the run stands in (the challenge's: see `content/arena.ts`). */
export const SyncArena = Game.System("Shooter/SyncArena", {
  resources: { tuning: Game.System.readResource(Tuning), challenge: Game.System.readResource(Challenge) },
  services: { host: Game.System.service(RenderHost) }
}, ({ resources, services }) => {
  const tuning = resources.tuning.get()
  const id = arenaOf(tuning, resources.challenge.get())
  services.host.showArena(id, hazardBoxes(tuning, id).map((hazard) => hazard.box))
})

/** Camera position (interpolated), screen shake, and the hurt vignette. */
export const ApplyCamera = Game.System("Shooter/ApplyCamera", {
  resources: { camera: Game.System.readResource(Camera), slowMotion: Game.System.readResource(SlowMotion), tuning: Game.System.readResource(Tuning) },
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
  feedback.protection = Math.max(0, feedback.protection - seconds)
  feedback.entrance += seconds
  feedback.wideEyes = Math.max(0, feedback.wideEyes - seconds)
  feedback.punch = feedback.punch * Math.exp(-view.impact.punchDecay * seconds) < 0.01 ? 0 : feedback.punch * Math.exp(-view.impact.punchDecay * seconds)
  // Shake jitters; a kick moves the view along the blow and eases back. Both as much as the player wants (see `comfort`).
  const target = services.host.view
  const { comfort } = services.host
  target.offset.x = ((Math.random() * 2 - 1) * feedback.shake - feedback.kick.x) * comfort.shake
  target.offset.y = ((Math.random() * 2 - 1) * feedback.shake - feedback.kick.y) * comfort.shake
  const center = lerp({ x: camera.prevX, y: camera.prevY }, camera, services.clock.alpha)
  target.center.x = center.x
  target.center.y = center.y
  // Phones zoom out (see view.camera); the camera stays centered on the player. Heavy blows punch in.
  // An ultimate's moment pushes in on her (see `ShowUltimateMoments`).
  // Reduced motion keeps the zoom still on heavy blows.
  const punch = comfort.reducedMotion ? 0 : view.impact.zoomPunch * feedback.punch
  target.pixelsPerUnit = projection.zoom * viewZoom(services.host.size) * (1 + punch) * (1 + view.ultimateMoment.zoom * feedback.moment)
  services.host.hud.vignette.style.opacity = feedback.hurt.toFixed(3)
  // A perfect dodge's slow motion glows at full strength, fading out over its last part (a fall's beat does not).
  const motion = resources.slowMotion.get()
  const slow = motion.dodge ? motion.remaining / Math.max(1e-6, resources.tuning.get().perfectDodge.slowSeconds) : 0
  services.host.hud.focus.style.opacity = Math.min(1, slow * 2.5).toFixed(3)
})

/** Draws moving entities between their previous and current fixed-step positions. */
export const InterpolateActors = RenderSync.interpolate(Game, {
  name: "Shooter/InterpolateActors",
  registry: RenderNodes,
  previous: PrevPosition,
  current: Position,
  clock: RenderClock,
  place: (node, position) => {
    node.root.position.set(position.x, 0, position.y)
  }
})

/**
 * Turns every bolt along its flight and stretches its tracer by its speed;
 * its halo flickers (thunder crackles harder) and its core spins.
 */
export const OrientBolts = Game.System("Shooter/OrientBolts", {
  queries: {
    bolts: Game.Query({ selection: { velocity: Game.Query.read(Velocity), projectile: Game.Query.read(Projectile), previous: Game.Query.read(PrevPosition) } }),
    discs: Game.Query({ selection: { disc: Game.Query.read(Disc), previous: Game.Query.read(PrevPosition) } }),
    lobbed: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { nodes: Game.System.service(RenderNodes), host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const now = performance.now() / 1000
  const light = services.host.combatLight
  light.begin(services.clock.frameSeconds)
  for (const { entity, data } of queries.bolts.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "projectile" || node.style !== "bolt") continue
    const velocity = data.velocity.get()
    const speed = Math.hypot(velocity.x, velocity.y)
    const projectile = data.projectile.get()
    if (node.look === null) {
      const kind = projectile.weapon
      node.look = projectile.faction === "enemy" ? "enemy" : kind === "gun" ? "round" : projectile.radius >= 11 ? "orb" : "spark"
      if (node.look === "spark") {
        node.orb.batch.remove(node.orb)
        node.orb.batch = services.host.assets.sparks
        node.orb.batch.add(node.orb)
      }
      const color = projectile.blow.element === null ? node.look === "round" ? 0xffce7a : node.look === "enemy" ? view.enemyProjectile : 0xa8a5ff : projectileColor(projectile.faction, "bolt", projectile.blow.element.id)
      const r = node.radius
      node.orb.color.setHex(color)
      node.core.color.setHex(mixColor(color, 0xffffff, 0.85))
      node.halo.color.setHex(color).multiplyScalar(node.look === "enemy" ? 1 : 0.35)
      node.streak.color.setHex(mixColor(color, 0xffffff, 0.65))
      node.trail.color.setHex(color).multiplyScalar(0.55)
      // Gun rounds are narrow darts; Staff sparks are bright diamonds, its charged orb much rounder.
      node.orb.object.scale.set(node.look === "round" ? r * 1.6 : node.look === "spark" ? r * 1.7 : r, node.look === "round" ? r * 0.38 : r * 0.8, node.look === "round" ? r * 0.38 : r * 0.8)
      node.core.object.scale.set(node.look === "round" ? r * 1.3 : r * 0.5, r * 0.25, r * 0.25)
      const origin = projectile.origin ?? data.previous.get()
      light.launch(origin, node.bolt.position.y, speed > 0 ? { x: velocity.x / speed, y: velocity.y / speed } : { x: 1, y: 0 }, color, node.look)
      node.last = origin
    }
    const at = { x: node.root.position.x, y: node.root.position.z }
    if (node.last !== null) node.travelled += Math.hypot(at.x - node.last.x, at.y - node.last.y)
    node.last = at
    // The floor's y is the scene's z: a turn about the vertical axis.
    if (speed > 0) node.orb.object.rotation.y = node.bolt.rotation.y = Math.atan2(-velocity.y, velocity.x)
    placeTracer(node, speed * (node.look === "round" ? 0.065 : node.look === "orb" ? 0.09 : 0.04))
    const thunder = data.projectile.get().blow.element?.id === "thunder"
    const flicker = thunder ? 0.8 + Math.random() * 0.5 : 1 + 0.1 * Math.sin(now * 38 + entity.id.value)
    const halo = node.radius * (node.look === "round" ? 0.9 : view.bolt.halo) * flicker
    node.halo.object.scale.set(node.look === "round" ? halo * 2 : node.look === "spark" ? halo * 1.2 : halo, node.look === "spark" ? halo * 0.35 : halo, node.look === "spark" ? halo * 0.35 : halo)
    if (node.look !== "round") {
      node.core.object.rotation.x = now * 9
      node.orb.object.rotation.x = now * 7
    }
  }
  for (const { entity, data } of queries.discs.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "projectile") continue
    const disc = data.disc.get()
    const at = { x: node.root.position.x, y: node.root.position.z }
    const thrower = services.nodes.get(disc.thrower)
    const dx = thrower === undefined ? -disc.direction.x : thrower.root.position.x - at.x
    const dy = thrower === undefined ? -disc.direction.y : thrower.root.position.z - at.y
    const distance = Math.hypot(dx, dy)
    const direction = disc.phase === "back" && distance > 0 ? { x: dx / distance, y: dy / distance } : disc.direction
    const height = worldHeight(projection, view.disc.height)
    node.bolt.position.y = height
    node.bolt.rotation.y = Math.atan2(-direction.y, direction.x)
    node.orb.object.rotation.y = now * 16
    node.halo.color.copy(node.orb.color)
    node.halo.object.scale.set(node.radius * 1.5, node.radius * 0.22, node.radius * 1.5)
    if (!node.launched) {
      const origin = disc.origin ?? data.previous.get()
      light.launch(origin, height, direction, node.orb.color.getHex(), "disc")
      node.last = origin
      node.launched = true
    }
    if (node.last !== null) node.travelled += Math.hypot(at.x - node.last.x, at.y - node.last.y)
    node.last = at
    node.trail.color.copy(node.orb.color)
    node.streak.color.setHex(0xf3fffa)
    placeTracer(node, disc.phase === "hover" ? 0 : disc.speed * 0.035)
  }
  for (const { entity, data } of queries.lobbed.each()) {
    const lob = data.lobbed.get()
    if (lob.splinter === true || lob.faction !== "player") continue
    const elapsed = lob.elapsed + services.clock.alpha * engine.stepSeconds
    if (elapsed < 0) continue
    const flight = Math.min(1, elapsed / lob.effect.flightTime)
    const dx = lob.to.x - lob.from.x, dy = lob.to.y - lob.from.y
    const length = Math.hypot(dx, dy)
    const direction = length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 }
    const offset = resources.tuning.get().player.muzzleOffset
    const muzzle = { x: lob.from.x + direction.x * offset, y: worldHeight(projection, view.projectileHeight), z: lob.from.y + direction.y * offset }
    const at = { x: muzzle.x + (lob.to.x - muzzle.x) * flight, y: worldHeight(projection, 4 * view.grenadeArc * flight * (1 - flight) + view.projectileHeight * (1 - flight) + 6 * flight), z: muzzle.z + (lob.to.y - muzzle.z) * flight }
    light.lob(entity.id.value, at, muzzle, direction, flight, lob.effect.element === null ? 0xc8bb83 : view.elements[lob.effect.element])
  }
})

/**
 * Fades pillars that stand in front of the player and overlap her on
 * screen, so the player is never fully hidden. Runs after actors are placed
 * for this frame.
 */
export const FadeOccluders = Game.System("Shooter/FadeOccluders", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    occluders: Game.Query({ selection: { renderable: Game.Query.read(Renderable) }, with: [Wall] })
  },
  services: { nodes: Game.System.service(RenderNodes) }
}, ({ queries, services }) => {
  const players = queries.player.each().flatMap(({ entity }) => {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "player") return []
    const feet = { x: node.root.position.x, y: node.root.position.z }
    const at = toScreen(projection, feet)
    const top = at.y - screenHeight(projection, node.body.height)
    const half = node.body.radius * projection.zoom
    return [{ depth: depthOf(feet), left: at.x - half, right: at.x + half, top, bottom: at.y }]
  })
  for (const { entity, data } of queries.occluders.each()) {
    const renderable = data.renderable.get()
    if (renderable.kind !== "wall" || renderable.placement !== "sorted") continue
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "wall") continue
    const bounds = node.bounds
    const hides = players.some((player) =>
      player.depth < node.depth &&
      player.left < bounds.x + bounds.width && player.right > bounds.x &&
      player.top < bounds.y + bounds.height && player.bottom > bounds.y)
    node.fade(hides ? view.occluderAlpha : 1)
  }
})
