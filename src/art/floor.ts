/**
 * Floor tiles: 2:1 isometric diamonds (32×16) of worn stone, drawn in screen
 * space (pixel art cannot go through the floor's rotate-and-squash transform
 * without losing its pixels). Each tile is beveled (a lit top-left edge, a
 * dark bottom-right one) and gets a few chips and cracks from a seed, so a floor
 * tiled from a handful of variants does not look repeated.
 */
import { canvas, get, set, TRANSPARENT } from "./pixel.ts"
import type { Canvas } from "./pixel.ts"
import { ink } from "./palette.ts"

export const TILE_WIDTH = 32
export const TILE_HEIGHT = 16

/** Half the width of the diamond on row `y`. */
const halfWidth = (y: number): number => (y < TILE_HEIGHT / 2 ? 2 * (y + 1) : 2 * (TILE_HEIGHT - y))

/** A small deterministic hash, for the tile's details. */
const hash = (seed: number, a: number, b: number): number => {
  let h = Math.imul(seed ^ 0x2545f491, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15) ^ a, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13) ^ b, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

const tile = (seed: number): Canvas => {
  const result = canvas(TILE_WIDTH, TILE_HEIGHT)
  const center = TILE_WIDTH / 2
  // A few stones are a shade lighter than the rest; the floor stays calm so actors stand out.
  const fill = hash(seed, 0, 0) < 0.15 ? ink["2"] : ink["3"]
  for (let y = 0; y < TILE_HEIGHT; y++) {
    const half = halfWidth(y)
    for (let x = center - half; x < center + half; x++) set(result, x, y, fill)
  }
  // Bevel: the top-left edge catches the light, the bottom-right one is in shadow.
  for (let y = 0; y < TILE_HEIGHT; y++) {
    const half = halfWidth(y)
    const left = center - half
    const right = center + half - 1
    if (y < TILE_HEIGHT / 2) {
      set(result, left, y, ink["2"])
      set(result, left + 1, y, ink["2"])
    } else {
      set(result, right, y, ink["4"])
      set(result, right - 1, y, ink["4"])
    }
  }
  // Chips: a lit pixel over a dark one, scattered on the face.
  const chips = Math.floor(hash(seed, 1, 0) * 3)
  for (let chip = 0; chip < chips; chip++) {
    const x = 8 + Math.floor(hash(seed, 2, chip) * 16)
    const y = 4 + Math.floor(hash(seed, 3, chip) * 8)
    if (get(result, x, y) === fill && get(result, x, y + 1) === fill) {
      set(result, x, y, ink["2"])
      set(result, x, y + 1, ink["4"])
    }
  }
  // A crack on some tiles: a short wandering dark line.
  if (hash(seed, 4, 0) < 0.2) {
    let x = 10 + Math.floor(hash(seed, 5, 0) * 10)
    let y = 5
    for (let step = 0; step < 6; step++) {
      if (get(result, x, y) !== TRANSPARENT) set(result, x, y, ink["4"])
      x += hash(seed, 6, step) < 0.5 ? 1 : 2
      y += hash(seed, 7, step) < 0.6 ? 1 : 0
    }
  }
  return result
}

/** Floor tile variants. */
export const floorTiles: ReadonlyArray<Canvas> = Array.from({ length: 8 }, (_, seed) => tile(seed + 1))

/** Which variant a tile at grid (`i`, `j`) uses. */
export const floorVariant = (i: number, j: number): number => Math.floor(hash(99, i, j) * floorTiles.length)
