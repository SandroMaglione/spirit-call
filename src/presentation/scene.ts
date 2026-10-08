/**
 * The scene: render nodes for renderables, the camera, interpolated actor
 * positions, and pillars fading in front of the player.
 */
import { RenderSync } from "@typeonce/bevy-ts-pixi"
import { projection, view, viewZoom } from "../config/view.ts"
import { depthOf, screenHeight, toScreen } from "../math/iso.ts"
import { lerp } from "../math/vec.ts"
import { arenaOf, hazardBoxes } from "../features/arena.ts"
import { Camera, Challenge, Game, Player, Position, PrevPosition, Projectile, RenderClock, RenderHost, RenderNodes, Renderable, SlowMotion, Tuning, Velocity, Wall } from "../schema.ts"
import { createNode, placeTracer } from "./nodes.ts"

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
  // Shake jitters; a kick moves the view along the blow and eases back.
  const target = services.host.view
  target.offset.x = (Math.random() * 2 - 1) * feedback.shake - feedback.kick.x
  target.offset.y = (Math.random() * 2 - 1) * feedback.shake - feedback.kick.y
  const center = lerp({ x: camera.prevX, y: camera.prevY }, camera, services.clock.alpha)
  target.center.x = center.x
  target.center.y = center.y
  // Phones zoom out (see view.camera); the camera stays centered on the player. Heavy blows punch in.
  // An ultimate's moment pushes in on her (see `ShowUltimateMoments`).
  target.pixelsPerUnit = projection.zoom * viewZoom(services.host.size) * (1 + view.impact.zoomPunch * feedback.punch) * (1 + view.ultimateMoment.zoom * feedback.moment)
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
  queries: { bolts: Game.Query({ selection: { velocity: Game.Query.read(Velocity), projectile: Game.Query.read(Projectile) } }) },
  services: { nodes: Game.System.service(RenderNodes) }
}, ({ queries, services }) => {
  const now = performance.now() / 1000
  for (const { entity, data } of queries.bolts.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "projectile" || node.style === "disc") continue
    const velocity = data.velocity.get()
    const speed = Math.hypot(velocity.x, velocity.y)
    // The floor's y is the scene's z: a turn about the vertical axis.
    if (speed > 0) node.bolt.rotation.y = Math.atan2(-velocity.y, velocity.x)
    placeTracer(node, speed * view.bolt.streakSeconds)
    const thunder = data.projectile.get().blow.element?.id === "thunder"
    const flicker = thunder ? 0.8 + Math.random() * 0.5 : 1 + 0.1 * Math.sin(now * 38 + entity.id.value)
    node.halo.object.scale.setScalar(node.radius * view.bolt.halo * flicker)
    node.core.object.rotation.set(now * 9, now * 13, 0)
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
