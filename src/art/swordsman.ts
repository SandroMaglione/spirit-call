/**
 * The Swordsman: silver hair, a teal coat, and a long sword carried on the
 * back. 32×32, chibi proportions (a big head over a short body).
 *
 * Built in parts so the animations reuse them: the upper body (head and
 * torso) bobs, the legs change per frame, and the sword sits behind the body
 * seen from the front and across the back seen from behind.
 */
import { canvas, checkGrid, draw, outline, set, stamp } from "./pixel.ts"
import type { Canvas, Grid } from "./pixel.ts"
import { outlineColor, palette } from "./palette.ts"
import type { Sprite } from "./sprite.ts"

const SIZE = 32

const headFront: Grid = [
  ".......kk.......",
  "......khk.......",
  "....kkkhkkkk....",
  "..kkhhhhhhhhkk..",
  ".khhhhhhhhhhhHk.",
  ".khhwwhhhhhhHHk.",
  "khhhHhhhhhhhHHjk",
  "khhHHhhhHhhHHjjk",
  "khHHsHHsHHsHHjjk",
  "khHskksssskksHjk",
  "khHsweSsssweSHjk",
  "khHsEEssssEESHjk",
  "kjHspsssssspSjjk",
  "kjjSssssmsssSjjk",
  "kjkkSssssssSkkjk",
  ".k..kkkkkkkk..k."
]

const headBack: Grid = [
  ".......kk.......",
  "......khk.......",
  "....kkkhkkkk....",
  "..kkhhhhhhhhkk..",
  ".khhhhhhhhhhhHk.",
  ".khhwwhhhhhhHHk.",
  "khhhhhhhhhhhHHjk",
  "khhhHhhhhhhHHHjk",
  "khhHHhhHhhHHHjjk",
  "khHHHHHHHHHHHjjk",
  "khHHjHHHHjHHjjjk",
  "kjHHjHHjHHjHjjJk",
  "kjjHjjHjjHjjjJJk",
  "kjjjJjjJjjJjjJJk",
  "kjkkjJjjjJjJkkjk",
  ".k..kkkkkkkk..k."
]

const bodyFront: Grid = [
  "...kkccggcckk...",
  "..ktTTccccTTqk..",
  ".ktTTTTcgTTTqqk.",
  "ktTkTTTcTTTTkqqk",
  "ktTkTTTTTTTqkqqk",
  "kTqkbbbbgbbbkqQk",
  "ksSkTTTTTTTqksxk",
  ".kkkTTTqqTTqkkk.",
  "...kqqqkkqqqk..."
]

const bodyBack: Grid = [
  "...kkqTTTTqkk...",
  "..ktTTTTTTTTqk..",
  ".ktTTTTTTTTTqqk.",
  "ktTkTTTTTTTqkqqk",
  "ktTkTTTTTTTqkqqk",
  "kTqkbbbbbbbbkqQk",
  "ksSkTTTTTTTqksxk",
  ".kkkTTTqqTTqkkk.",
  "...kqqqkkqqqk..."
]

/** Legs standing, and one stride (the other is its mirror). */
const legsStand: Grid = [
  "....knNkknNk....",
  "....knNkknNk....",
  "....kbBkkbBk....",
  "...kbbBkkbbBk...",
  "...kkkkkkkkkk..."
]

const legsStride: Grid = [
  "...knNk.knNk....",
  "...knNk.kbBk....",
  "..kbbBk.kkkk....",
  "..kbbBk.........",
  "..kkkkk........."
]

for (const [name, grid] of Object.entries({ headFront, headBack, bodyFront, bodyBack, legsStand, legsStride })) checkGrid(`swordsman.${name}`, grid, palette)

/**
 * The sword, as a 45° diagonal from its pommel at (`x`, `y`) going
 * `direction` (1: down-right, -1: down-left): grip, guard, then a two-pixel
 * blade, outlined.
 */
const sword = (x: number, y: number, direction: 1 | -1): Canvas => {
  const layer = canvas(SIZE, SIZE)
  const at = (step: number, side = 0) => ({ x: x + step * direction + side * direction, y: y + step })
  for (let step = 0; step < 3; step++) {
    const p = at(step)
    set(layer, p.x, p.y, step === 0 ? palette.g! : palette.b!)
  }
  // The guard crosses the blade.
  const guard = at(3)
  set(layer, guard.x, guard.y, palette.g!)
  set(layer, guard.x + direction, guard.y - 1, palette.g!)
  set(layer, guard.x - direction, guard.y + 1, palette.G!)
  for (let step = 4; step < 18; step++) {
    const edge = at(step)
    set(layer, edge.x, edge.y, palette.v!)
    const flat = at(step, 1)
    if (step < 17) set(layer, flat.x, flat.y, step % 5 === 0 ? palette.v! : palette.V!)
  }
  return outline(layer, outlineColor)
}

const HEAD_X = 8
const HEAD_Y = 0
const BODY_Y = 16
const LEGS_Y = 25

/** One frame: legs (`legs`, mirrored if `flipLegs`), then the upper body `lift` pixels down. */
const frame = (facing: "front" | "back", legs: Grid, flipLegs: boolean, lift: number): Canvas => {
  const result = canvas(SIZE, SIZE)
  const blade = facing === "front" ? sword(4, 3 + lift, 1) : sword(27, 3 + lift, -1)
  if (facing === "front") draw(result, blade, 0, 0)
  stamp(result, legs, palette, HEAD_X, LEGS_Y, flipLegs)
  stamp(result, facing === "front" ? bodyFront : bodyBack, palette, HEAD_X, BODY_Y + lift)
  stamp(result, facing === "front" ? headFront : headBack, palette, HEAD_X, HEAD_Y + lift)
  if (facing === "back") draw(result, blade, 0, 0)
  return result
}

const facingFrames = (facing: "front" | "back") => ({
  idle: [frame(facing, legsStand, false, 0), frame(facing, legsStand, false, 1)],
  run: [frame(facing, legsStride, false, 1), frame(facing, legsStand, false, 0), frame(facing, legsStride, true, 1), frame(facing, legsStand, false, 0)]
})

const front = facingFrames("front")
const back = facingFrames("back")

export const swordsman: Sprite = {
  width: SIZE,
  height: SIZE,
  anchor: { x: 16, y: 30 },
  fps: { idle: 2.5, run: 10 },
  frames: {
    idle: { front: front.idle, back: back.idle },
    run: { front: front.run, back: back.run }
  }
}
