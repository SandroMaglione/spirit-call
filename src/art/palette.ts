/**
 * The shared palette: every pixel sprite is drawn in these colors only, in
 * short ramps lit from the top-left (light, mid, shade). Letters are the
 * sprites' "ink"; the comments name what each ramp is for.
 */
import type { Palette } from "./pixel.ts"

export const ink = {
  /** Outline: a deep purple rather than black, so sprites stay soft on the dark floor. */
  k: 0x1a1424,
  /** Skin. */
  s: 0xffe3c8,
  S: 0xf2b896,
  x: 0xc97f6a,
  /** Eyes, highlights, blush, mouth. */
  e: 0x2b3570,
  E: 0x4f6bd8,
  w: 0xffffff,
  p: 0xf29a9a,
  m: 0xb8565a,
  /** Silver hair. */
  h: 0xf4f1ff,
  H: 0xc6c0e8,
  j: 0x8b84b8,
  J: 0x5d5788,
  /** Teal cloth (the Swordsman's color). */
  t: 0x8ff0e0,
  T: 0x4ecdc4,
  q: 0x2a8f94,
  Q: 0x1d5a66,
  /** Cream cloth and gold trim. */
  c: 0xfff4d6,
  C: 0xe0cfa8,
  g: 0xf7c948,
  G: 0xc28a2e,
  /** Leather. */
  b: 0x8a5a3c,
  B: 0x5a3828,
  /** Dark cloth (trousers). */
  n: 0x3a3f63,
  N: 0x2a2d4a,
  /** Steel. */
  v: 0xe8f0f8,
  V: 0x9fb0c4,
  z: 0x66758c,
  /** Orange hide (the Chaser's color). */
  o: 0xffc27a,
  O: 0xff7a45,
  r: 0xd24a2e,
  R: 0x8a2a2a,
  /** Glowing eyes. */
  y: 0xfff1a0,
  Y: 0xffb347,
  /** Bone (horns, claws). */
  l: 0xf3e6c8,
  L: 0xb9a27c,
  /** Floor stone, light to dark. */
  "1": 0x3a4658,
  "2": 0x313c4c,
  "3": 0x2a3341,
  "4": 0x232a36,
  "5": 0x1c222c
} satisfies Palette

export const palette: Palette = ink
export const outlineColor = ink.k
