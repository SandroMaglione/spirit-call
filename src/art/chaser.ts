/**
 * The Chaser: a round orange imp with horns, glowing eyes, a toothy grin,
 * and big claws held out to swipe. 32×32.
 *
 * The body is a shaded ball; horns, face, claws, and feet are placed pixel
 * by pixel over it, and the whole is outlined at the end.
 */
import { ball, canvas, outline, set } from "./pixel.ts"
import type { Canvas } from "./pixel.ts"
import { ink, outlineColor } from "./palette.ts"
import type { Sprite } from "./sprite.ts"

const SIZE = 32

/** Pixels as `[x, y, color]`, for the left half; `mirrored` adds the right half. */
type Pixels = ReadonlyArray<readonly [number, number, number]>
const mirrored = (pixels: Pixels, swap: ReadonlyMap<number, number> = new Map()): Pixels => [
  ...pixels,
  ...pixels.map(([x, y, color]) => [31 - x, y, swap.get(color) ?? color] as const)
]

// The right side is turned from the light: its bone and eyes are a step darker.
const shadeRight = new Map([[ink.l, ink.L]])

const horns = mirrored([
  [12, 11, ink.L], [11, 11, ink.l], [11, 10, ink.L], [10, 10, ink.l], [10, 9, ink.l], [9, 9, ink.l], [9, 8, ink.l], [8, 7, ink.l], [8, 6, ink.l]
], shadeRight)

const eyes = mirrored([
  [10, 14, ink.k], [11, 14, ink.k], [12, 14, ink.k],
  [10, 15, ink.k], [11, 15, ink.y], [12, 15, ink.y], [13, 15, ink.k],
  [10, 16, ink.k], [11, 16, ink.Y], [12, 16, ink.y], [13, 16, ink.y], [14, 16, ink.k],
  [11, 17, ink.k], [12, 17, ink.k], [13, 17, ink.k]
])

const grin: Pixels = [
  ...[12, 13, 14, 15, 16, 17, 18, 19].map((x) => [x, 19, ink.k] as const),
  [11, 18, ink.k], [20, 18, ink.k],
  [12, 20, ink.k], [13, 20, ink.l], [14, 20, ink.k], [15, 20, ink.l], [16, 20, ink.L], [17, 20, ink.k], [18, 20, ink.L], [19, 20, ink.k],
  ...[13, 14, 15, 16, 17, 18].map((x) => [x, 21, ink.k] as const)
]

const spines: Pixels = [[15, 12, ink.r], [16, 12, ink.R], [15, 15, ink.r], [16, 15, ink.R], [15, 18, ink.r], [16, 18, ink.R], [15, 21, ink.r], [16, 21, ink.R]]

const lift = (pixels: Pixels, up: number): Pixels => pixels.map(([x, y, color]) => [x, y - up, color] as const)

/** The left arm and its claws. */
const arm: Pixels = [
  [7, 19, ink.O], [6, 19, ink.O], [7, 20, ink.r], [6, 20, ink.r],
  [5, 18, ink.l], [4, 17, ink.l], [3, 16, ink.l],
  [5, 19, ink.l], [4, 19, ink.l], [3, 19, ink.l],
  [5, 20, ink.l], [4, 21, ink.l], [3, 22, ink.l]
]
/** Both arms, `raise` pixels up (the swing of a run). */
const claws = (raise: number): Pixels => mirrored(lift(arm, raise), shadeRight)

const leftFoot: Pixels = [[11, 26, ink.r], [12, 26, ink.r], [13, 26, ink.R], [10, 27, ink.r], [11, 27, ink.r], [12, 27, ink.R], [13, 27, ink.R]]
const rightFoot: Pixels = [[18, 26, ink.r], [19, 26, ink.R], [20, 26, ink.R], [18, 27, ink.r], [19, 27, ink.R], [20, 27, ink.R], [21, 27, ink.R]]

/** Feet, the left one `leftUp` pixels up and the right one `rightUp`. */
const feet = (leftUp: number, rightUp: number): Pixels => [...lift(leftFoot, leftUp), ...lift(rightFoot, rightUp)]

const place = (target: Canvas, pixels: Pixels, dy: number) => {
  for (const [x, y, color] of pixels) set(target, x, y + dy, color)
}

const frame = (facing: "front" | "back", { bob, leftUp, rightUp, raise }: { bob: number; leftUp: number; rightUp: number; raise: number }): Canvas => {
  const result = canvas(SIZE, SIZE)
  place(result, feet(leftUp, rightUp), 0)
  place(result, claws(raise), bob)
  ball(result, 16, 18.5 + bob, 9, 8, [ink.o, ink.O, ink.r, ink.R])
  place(result, horns, bob)
  if (facing === "front") {
    place(result, eyes, bob)
    place(result, grin, bob)
  } else {
    place(result, spines, bob)
  }
  return outline(result, outlineColor)
}

const facingFrames = (facing: "front" | "back") => ({
  idle: [frame(facing, { bob: 0, leftUp: 0, rightUp: 0, raise: 0 }), frame(facing, { bob: 1, leftUp: 0, rightUp: 0, raise: 1 })],
  run: [
    frame(facing, { bob: 1, leftUp: 1, rightUp: 0, raise: -1 }),
    frame(facing, { bob: 0, leftUp: 0, rightUp: 0, raise: 1 }),
    frame(facing, { bob: 1, leftUp: 0, rightUp: 1, raise: -1 }),
    frame(facing, { bob: 0, leftUp: 0, rightUp: 0, raise: 1 })
  ]
})

const front = facingFrames("front")
const back = facingFrames("back")

export const chaser: Sprite = {
  width: SIZE,
  height: SIZE,
  anchor: { x: 16, y: 28 },
  fps: { idle: 3, run: 12 },
  frames: {
    idle: { front: front.idle, back: back.idle },
    run: { front: front.run, back: back.run }
  }
}
