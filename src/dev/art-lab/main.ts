/**
 * The art lab (`/art-lab.html`): art styles side by side in the game's view
 * (projection, camera zoom, floor, pillars, a telegraph), to judge them at
 * the size they are played at. Not part of the game build.
 *
 * - `?style=pixel|vector|capsule`: one style over a whole arena scene.
 * - `?style=compare`: the three styles next to each other.
 * - `?zoom=2`: a fixed camera zoom (default: the game's zoom for the screen).
 * - `?time=1.3`: freeze the animations at a time (for screenshots).
 * - `?big`: actors drawn 1.5 times larger (pixels 3× instead of 2×).
 */
import { Application, Container, Graphics, Sprite, Text } from "pixi.js"

import { chaser } from "../../art/chaser.ts"
import { floorTiles, floorVariant, TILE_HEIGHT, TILE_WIDTH } from "../../art/floor.ts"
import { swordsman } from "../../art/swordsman.ts"
import { projection, view, viewZoom } from "../../config/view.ts"
import { depthOf, toScreen, toWorld } from "../../math/iso.ts"
import type { Vec2 } from "../../math/vec.ts"
import { pixelActor, pixelTexture } from "./pixel-actor.ts"
import { vectorChaser, vectorSwordsman } from "./vector.ts"
import type { VectorActor } from "./vector.ts"

type Style = "pixel" | "vector" | "capsule"
type Kind = "swordsman" | "chaser"

const params = new URLSearchParams(window.location.search)
const styleParam = params.get("style") ?? "compare"
const frozen = params.get("time") === null ? undefined : Number(params.get("time"))

/** Actors drawn larger than their bodies (`?big`). */
const ACTOR_SCALE = params.has("big") ? 1.5 : 1
/** Screen pixels (at zoom 1) per art pixel. */
const PIXEL_SCALE = 2

/** The current placeholder: a white capsule tinted (see presentation/nodes.ts). */
const capsuleActor = (kind: Kind): VectorActor => {
  const radius = kind === "swordsman" ? 16 : 15
  const look = kind === "swordsman" ? { color: view.player, width: 1.5, height: view.bodyHeightFactor } : view.enemies.chaser
  const widthFactor = "widthFactor" in look ? look.widthFactor : look.width
  const heightFactor = "heightFactor" in look ? look.heightFactor : look.height
  const width = radius * widthFactor
  const height = radius * heightFactor
  const body = new Graphics().roundRect(-width / 2, -height, width, height, width / 2).fill({ color: look.color }).stroke({ width: 2, color: 0x0b1b1a, alpha: 0.6 })
  const root = new Container()
  root.addChild(body)
  return { root, pose: () => {} }
}

const makeActor = (style: Style, kind: Kind): VectorActor => {
  switch (style) {
    case "pixel":
      return pixelActor(kind === "swordsman" ? swordsman : chaser, PIXEL_SCALE * ACTOR_SCALE)
    case "vector":
      return kind === "swordsman" ? vectorSwordsman() : vectorChaser()
    case "capsule":
      return capsuleActor(kind)
  }
}

/** Something on the floor: where it stands, how it moves, and what it faces. */
interface Placed {
  readonly kind: Kind
  readonly style: Style
  /** Position at a time (seconds). */
  readonly at: (time: number) => Vec2
  readonly running: boolean
  /** What a standing actor faces. */
  readonly lookAt?: Vec2
}

const circling = (center: Vec2, radius: number, speed: number, offset = 0) => (time: number): Vec2 => ({
  x: center.x + Math.cos(offset + time * speed) * radius,
  y: center.y + Math.sin(offset + time * speed) * radius
})
const still = (point: Vec2) => () => point

/** An arena moment: the Swordsman, a second one running laps, and Chasers closing in. */
const arenaScene = (style: Style): Array<Placed> => [
  { kind: "swordsman", style, at: still({ x: 0, y: 0 }), running: false, lookAt: { x: 1, y: 1 } },
  { kind: "swordsman", style, at: circling({ x: 0, y: 0 }, 190, 1.1), running: true },
  { kind: "chaser", style, at: still({ x: -150, y: -70 }), running: false, lookAt: { x: 0, y: 0 } },
  { kind: "chaser", style, at: circling({ x: 150, y: -150 }, 50, -2.2), running: true },
  { kind: "chaser", style, at: still({ x: 190, y: 90 }), running: false, lookAt: { x: 0, y: 0 } },
  { kind: "chaser", style, at: still({ x: -40, y: 150 }), running: false, lookAt: { x: 0, y: 0 } },
  { kind: "chaser", style, at: circling({ x: -200, y: 120 }, 40, 2.6, 1), running: true }
]

/** The three styles in columns, each with a Swordsman and a Chaser, standing (top) and running (bottom); laid out in screen pixels. */
const compareScene = (): Array<Placed> => (["capsule", "vector", "pixel"] as const).flatMap((style, column) => {
  const cell = (dx: number, dy: number) => toWorld(projection, { x: (column - 1) * COLUMN + dx, y: dy })
  return [
    { kind: "swordsman", style, at: still(cell(-32, -20)), running: false, lookAt: cell(-32, 100) },
    { kind: "chaser", style, at: still(cell(32, -20)), running: false, lookAt: cell(32, 100) },
    { kind: "swordsman", style, at: still(cell(-32, 70)), running: true, lookAt: cell(-200, -100) },
    { kind: "chaser", style, at: still(cell(32, 70)), running: true, lookAt: cell(100, 100) }
  ] satisfies Array<Placed>
})

/** Screen pixels between the compare columns. */
const COLUMN = 200

const start = async () => {
  const mount = document.getElementById("lab")!
  const app = new Application()
  await app.init({ antialias: true, background: view.background, resizeTo: mount, autoDensity: true, resolution: window.devicePixelRatio })
  mount.replaceChildren(app.canvas)

  const world = new Container()
  app.stage.addChild(world)

  const pixelFloor = styleParam === "pixel"
  if (pixelFloor) {
    const textures = floorTiles.map(pixelTexture)
    const floor = new Container()
    for (let i = -24; i <= 24; i++) {
      for (let j = -24; j <= 24; j++) {
        const tile = new Sprite(textures[floorVariant(i, j)]!)
        tile.scale.set(PIXEL_SCALE)
        tile.position.set(((i - j) * TILE_WIDTH) / 2 * PIXEL_SCALE - (TILE_WIDTH / 2) * PIXEL_SCALE, ((i + j) * TILE_HEIGHT) / 2 * PIXEL_SCALE)
        floor.addChild(tile)
      }
    }
    world.addChild(floor)
  }

  // The floor's projection, as in the game: rotate 45°, then squash.
  const ground = new Container()
  ground.scale.set(projection.zoom, projection.zoom * projection.squash)
  const groundRotated = new Container()
  groundRotated.rotation = Math.PI / 4
  ground.addChild(groundRotated)
  const marks = new Graphics()
  if (!pixelFloor) {
    marks.rect(-1200, -1200, 2400, 2400).fill({ color: view.floor })
    for (let line = -1200; line <= 1200; line += view.floorGridSpacing) marks.moveTo(line, -1200).lineTo(line, 1200).moveTo(-1200, line).lineTo(1200, line)
    marks.stroke({ width: 2, color: view.floorGrid })
  }
  const scene = styleParam === "compare" ? compareScene() : arenaScene(styleParam as Style)
  if (styleParam !== "compare") {
    // The facing ring around the standing Swordsman, and a Chaser's swipe telegraph.
    marks.circle(0, 0, 80).stroke({ width: 2, color: view.aim, alpha: view.facingRing.alpha })
    const from = { x: -40, y: 150 }
    const angle = Math.atan2(-from.y, -from.x)
    marks.moveTo(from.x, from.y).arc(from.x, from.y, 80, angle - 0.87, angle + 0.87).lineTo(from.x, from.y).fill({ color: view.telegraph, alpha: 0.22 })
    marks.moveTo(from.x, from.y).arc(from.x, from.y, 80, angle - 0.87, angle + 0.87).lineTo(from.x, from.y).stroke({ width: 3, color: view.telegraph, alpha: 0.6 })
  }
  groundRotated.addChild(marks)
  world.addChild(ground)

  const actors = new Container()
  actors.sortableChildren = true
  world.addChild(actors)

  // Pillars, as the game draws them (extruded boxes).
  const pillar = (center: Vec2, size: number) => {
    const corner = (x: number, y: number) => toScreen(projection, { x, y })
    const half = size / 2
    const nw = corner(-half, -half)
    const ne = corner(half, -half)
    const se = corner(half, half)
    const sw = corner(-half, half)
    const h = view.wallHeight * projection.zoom
    const g = new Graphics()
    g.poly([sw.x, sw.y, se.x, se.y, se.x, se.y - h, sw.x, sw.y - h]).fill({ color: view.wallSideDark })
    g.poly([ne.x, ne.y, se.x, se.y, se.x, se.y - h, ne.x, ne.y - h]).fill({ color: view.wallSideLight })
    g.poly([nw.x, nw.y - h, ne.x, ne.y - h, se.x, se.y - h, sw.x, sw.y - h]).fill({ color: view.wallTop }).stroke({ width: 1, color: 0x56657a, alpha: 0.8 })
    const screen = toScreen(projection, center)
    g.position.set(screen.x, screen.y)
    g.zIndex = depthOf(center)
    actors.addChild(g)
  }
  if (styleParam !== "compare") {
    pillar({ x: -300, y: -120 }, 60)
    pillar({ x: 60, y: -320 }, 60)
  }

  const shadow = (radius: number) => new Graphics().ellipse(0, 0, radius * projection.zoom, radius * projection.zoom * projection.squash).fill({ color: view.shadow, alpha: 0.35 })
  const live = scene.map((placed) => {
    const actor = makeActor(placed.style, placed.kind)
    if (placed.style === "vector") actor.root.scale.set(ACTOR_SCALE)
    const holder = new Container()
    holder.addChild(shadow(placed.kind === "swordsman" ? 16 : 15), actor.root)
    actors.addChild(holder)
    return { placed, actor, holder }
  })

  if (styleParam === "compare") {
    for (const [column, name] of ["current", "B: vector", "A: pixel"].entries()) {
      const label = new Text({ text: name, style: { fill: 0xe6edf3, fontFamily: "ui-monospace, monospace", fontSize: 12 } })
      label.anchor.set(0.5)
      label.position.set((column - 1) * COLUMN, -110)
      world.addChild(label)
    }
  }

  const begin = performance.now()
  app.ticker.add(() => {
    const time = frozen ?? (performance.now() - begin) / 1000
    for (const { placed, actor, holder } of live) {
      const position = placed.at(time)
      const screen = toScreen(projection, position)
      holder.position.set(screen.x, screen.y)
      holder.zIndex = depthOf(position)
      // Facing: toward where it runs, or toward what it looks at; the drawn facings are turned toward screen-right, and flipped for the left.
      const ahead = placed.running && placed.lookAt === undefined ? placed.at(time + 0.05) : placed.lookAt ?? position
      const direction = toScreen(projection, { x: ahead.x - position.x, y: ahead.y - position.y })
      if (Math.abs(direction.x) > 0.01) actor.root.scale.x = Math.abs(actor.root.scale.x) * (direction.x < 0 ? -1 : 1)
      actor.pose(time, direction.y >= 0 ? "front" : "back", placed.running)
    }
    const zoom = params.get("zoom") === null ? viewZoom(app.screen) : Number(params.get("zoom"))
    world.scale.set(zoom)
    world.position.set(Math.round(app.screen.width / 2), Math.round(app.screen.height / 2 - (styleParam === "compare" ? 0 : 20 * zoom)))
  })
}

void start()
