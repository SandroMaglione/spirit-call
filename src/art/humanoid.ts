/**
 * Humanoid sprites from parts: a head and a torso (with arms) for each
 * facing, one grid per leg, and a sword carried on the back. Every grid of a
 * part is drawn in the part's frame (same size, placed at the part's
 * position), so a part can move as a whole: the upper body bobs and each leg
 * lifts on its own.
 *
 * Animations: idle breathes (the upper body sinks a pixel); run alternates
 * a lifted leg with both feet down, the body a pixel lower on the contacts.
 */
import { canvas, checkGrid, draw, outline, set, stamp } from "./pixel.ts"
import type { Canvas, Grid } from "./pixel.ts"
import { outlineColor, palette } from "./palette.ts"
import type { Facing, Sprite } from "./sprite.ts"

interface Part {
  readonly front: Grid
  readonly back: Grid
  readonly x: number
  readonly y: number
}

/** A sword as a 45° diagonal from its pommel, going down-right (`direction` 1) or down-left (-1), `length` pixels long. */
interface SwordSpec {
  readonly x: number
  readonly y: number
  readonly direction: 1 | -1
  readonly length: number
}

export interface HumanoidSpec {
  readonly name: string
  readonly width: number
  readonly height: number
  readonly anchor: { readonly x: number; readonly y: number }
  /** Screen pixels per art pixel at zoom 1. */
  readonly pixelSize: number
  readonly head: Part
  readonly torso: Part
  readonly legs: { readonly left: Grid; readonly right: Grid; readonly x: number; readonly y: number }
  /** How far a stepping leg lifts. */
  readonly step: number
  /** Behind the body seen from the front, across the back seen from behind. */
  readonly sword: { readonly front: SwordSpec; readonly back: SwordSpec }
}

const sword = (width: number, height: number, spec: SwordSpec): Canvas => {
  const layer = canvas(width, height)
  const at = (step: number, side = 0) => ({ x: spec.x + (step + side) * spec.direction, y: spec.y + step })
  for (let step = 0; step < 3; step++) {
    const p = at(step)
    set(layer, p.x, p.y, step === 0 ? palette.g! : palette.b!)
  }
  // The guard crosses the blade.
  const guard = at(3)
  set(layer, guard.x, guard.y, palette.g!)
  set(layer, guard.x + spec.direction, guard.y - 1, palette.g!)
  set(layer, guard.x - spec.direction, guard.y + 1, palette.G!)
  for (let step = 4; step < spec.length; step++) {
    const edge = at(step)
    set(layer, edge.x, edge.y, palette.v!)
    const flat = at(step, 1)
    if (step < spec.length - 1) set(layer, flat.x, flat.y, palette.V!)
  }
  return outline(layer, outlineColor)
}

export const humanoid = (spec: HumanoidSpec): Sprite => {
  const grids = { headFront: spec.head.front, headBack: spec.head.back, torsoFront: spec.torso.front, torsoBack: spec.torso.back, legLeft: spec.legs.left, legRight: spec.legs.right }
  for (const [part, grid] of Object.entries(grids)) checkGrid(`${spec.name}.${part}`, grid, palette)

  const frame = (facing: Facing, { sink, leftUp, rightUp }: { sink: number; leftUp: number; rightUp: number }): Canvas => {
    const result = canvas(spec.width, spec.height)
    const blade = sword(spec.width, spec.height, facing === "front" ? spec.sword.front : spec.sword.back)
    if (facing === "front") draw(result, blade, 0, sink)
    stamp(result, spec.legs.left, palette, spec.legs.x, spec.legs.y - leftUp)
    stamp(result, spec.legs.right, palette, spec.legs.x, spec.legs.y - rightUp)
    stamp(result, spec.torso[facing], palette, spec.torso.x, spec.torso.y + sink)
    stamp(result, spec.head[facing], palette, spec.head.x, spec.head.y + sink)
    if (facing === "back") draw(result, blade, 0, sink)
    return result
  }

  const frames = (facing: Facing) => ({
    idle: [frame(facing, { sink: 0, leftUp: 0, rightUp: 0 }), frame(facing, { sink: 1, leftUp: 0, rightUp: 0 })],
    run: [
      frame(facing, { sink: 0, leftUp: spec.step, rightUp: 0 }),
      frame(facing, { sink: 1, leftUp: 0, rightUp: 0 }),
      frame(facing, { sink: 0, leftUp: 0, rightUp: spec.step }),
      frame(facing, { sink: 1, leftUp: 0, rightUp: 0 })
    ]
  })
  const front = frames("front")
  const back = frames("back")
  return {
    width: spec.width,
    height: spec.height,
    anchor: spec.anchor,
    pixelSize: spec.pixelSize,
    fps: { idle: 2.5, run: 9 },
    frames: { idle: { front: front.idle, back: back.idle }, run: { front: front.run, back: back.run } }
  }
}
