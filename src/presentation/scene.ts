/**
 * The scene: render nodes for renderables, the camera, interpolated actor
 * positions, and pillars fading in front of the player.
 */
import { RenderSync } from "@typeonce/bevy-ts-pixi"
import { projection, view, viewZoom } from "../config/view.ts"
import { depthOf, screenHeight, toScreen } from "../math/iso.ts"
import { lerp } from "../math/vec.ts"
import { Camera, Game, Player, Position, PrevPosition, RenderClock, RenderHost, RenderNodes, Renderable, Wall } from "../schema.ts"
import { createNode } from "./nodes.ts"

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

/** Camera position (interpolated), screen shake, and the hurt vignette. */
export const ApplyCamera = Game.System("Shooter/ApplyCamera", {
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
  const target = services.host.view
  target.offset.x = (Math.random() * 2 - 1) * feedback.shake - feedback.kick.x
  target.offset.y = (Math.random() * 2 - 1) * feedback.shake - feedback.kick.y
  const center = lerp({ x: camera.prevX, y: camera.prevY }, camera, services.clock.alpha)
  target.center.x = center.x
  target.center.y = center.y
  // Phones zoom out (see view.camera); the camera stays centered on the player. Heavy blows punch in.
  target.pixelsPerUnit = projection.zoom * viewZoom(services.host.size) * (1 + view.impact.zoomPunch * feedback.punch)
  services.host.hud.vignette.style.opacity = feedback.hurt.toFixed(3)
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
