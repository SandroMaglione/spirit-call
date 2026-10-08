/** Turning a spirit's colors for a look worn (see `cosmeticLooks` in `looks.ts`). */

/**
 * A spirit recolored (a tint, see `content/cosmetics.ts`): every color of
 * her model turned `hue` degrees round the color wheel, its saturation and
 * lightness times `saturation` and `lightness`. Her drops turn with it,
 * unless a trail of her own replaces them.
 */
export interface Tint {
  readonly hue: number
  readonly saturation: number
  readonly lightness: number
}

/** A color's channels (each 0..1) turned by `tint`. */
export const tintedRgb = (r: number, g: number, b: number, tint: Tint): readonly [number, number, number] => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  let h = 0
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  const hue = (((h * 60 + tint.hue) % 360) + 360) % 360
  const sat = Math.min(1, s * tint.saturation), light = Math.min(1, l * tint.lightness)
  const c = (1 - Math.abs(2 * light - 1)) * sat, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = light - c / 2
  const [rr, gg, bb] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  const clamp = (value: number) => Math.max(0, Math.min(1, value + m))
  return [clamp(rr), clamp(gg), clamp(bb)]
}

/** `color` (a hex number) turned by `tint`. */
export const tintedHex = (color: number, tint: Tint): number => {
  const [r, g, b] = tintedRgb(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, tint)
  const to = (value: number) => Math.round(value * 255)
  return (to(r) << 16) | (to(g) << 8) | to(b)
}
