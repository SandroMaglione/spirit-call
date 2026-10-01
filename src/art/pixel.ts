/**
 * A small kit for pixel art written as text: each sprite is drawn as rows of
 * palette letters ("grids"), stamped in layers onto a canvas, and turned into
 * RGBA pixels. Text keeps the art diffable and editable by hand, and the
 * shared palette keeps every sprite in the same colors (and makes recolors,
 * such as skins, a palette swap).
 *
 * Pure data and functions: no rendering library, so the same art can be
 * drawn in the game, in the art lab, or written to PNG files by a script.
 */

/** Palette letters to 0xRRGGBB colors. `.` is always transparent. */
export type Palette = Readonly<Record<string, number>>

/** Rows of palette letters, all the same length. */
export type Grid = ReadonlyArray<string>

/** A canvas of colors (0xRRGGBB), `-1` where transparent. */
export interface Canvas {
  readonly width: number
  readonly height: number
  readonly pixels: Int32Array
}

export const TRANSPARENT = -1

export const canvas = (width: number, height: number): Canvas => ({ width, height, pixels: new Int32Array(width * height).fill(TRANSPARENT) })

export const get = (target: Canvas, x: number, y: number): number =>
  x < 0 || y < 0 || x >= target.width || y >= target.height ? TRANSPARENT : target.pixels[y * target.width + x]!

export const set = (target: Canvas, x: number, y: number, color: number): void => {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return
  target.pixels[y * target.width + x] = color
}

/** Throws on uneven rows or letters missing from the palette, naming the sprite. */
export const checkGrid = (name: string, grid: Grid, palette: Palette): void => {
  const width = grid[0]?.length ?? 0
  grid.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${name}: row ${y} is ${row.length} wide, expected ${width}`)
    for (const letter of row) {
      if (letter !== "." && palette[letter] === undefined) throw new Error(`${name}: row ${y} uses "${letter}", which is not in the palette`)
    }
  })
}

/** Draws `grid` with its top-left corner at (`x`, `y`), mirrored left-right if `flip`. Transparent letters leave what is below. */
export const stamp = (target: Canvas, grid: Grid, palette: Palette, x: number, y: number, flip = false): void => {
  grid.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const letter = row[flip ? row.length - 1 - dx : dx]!
      if (letter === ".") continue
      set(target, x + dx, y + dy, palette[letter]!)
    }
  })
}

/** A copy of `source` mirrored left-right. */
export const mirror = (source: Canvas): Canvas => {
  const result = canvas(source.width, source.height)
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) set(result, source.width - 1 - x, y, get(source, x, y))
  }
  return result
}

/** A copy of `source` with a one-pixel outline of `color` around everything drawn (4-neighbors). */
export const outline = (source: Canvas, color: number): Canvas => {
  const result = canvas(source.width, source.height)
  result.pixels.set(source.pixels)
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (get(source, x, y) !== TRANSPARENT) continue
      if (get(source, x - 1, y) !== TRANSPARENT || get(source, x + 1, y) !== TRANSPARENT || get(source, x, y - 1) !== TRANSPARENT || get(source, x, y + 1) !== TRANSPARENT) {
        set(result, x, y, color)
      }
    }
  }
  return result
}

/** Draws `source` onto `target` at (`x`, `y`); transparent pixels leave what is below. */
export const draw = (target: Canvas, source: Canvas, x: number, y: number): void => {
  for (let sy = 0; sy < source.height; sy++) {
    for (let sx = 0; sx < source.width; sx++) {
      const color = get(source, sx, sy)
      if (color !== TRANSPARENT) set(target, x + sx, y + sy, color)
    }
  }
}

/**
 * A filled ellipse centered on (`cx`, `cy`), shaded as a ball lit from the
 * top-left: `ramp` runs from the lit color to the darkest, and each pixel
 * takes the step its brightness falls in.
 */
export const ball = (target: Canvas, cx: number, cy: number, rx: number, ry: number, ramp: ReadonlyArray<number>): void => {
  const light = { x: -0.45, y: -0.6, z: 0.66 }
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const inside = 1 - nx * nx - ny * ny
      if (inside < 0) continue
      const brightness = nx * light.x + ny * light.y + Math.sqrt(inside) * light.z
      // Brightness runs from about -0.9 (back, bottom-right) to 1 (the lit spot).
      const step = brightness > 0.82 ? 0 : brightness > 0.35 ? 1 : brightness > -0.1 ? 2 : 3
      set(target, x, y, ramp[Math.min(step, ramp.length - 1)]!)
    }
  }
}

/** A canvas from a single grid. */
export const fromGrid = (grid: Grid, palette: Palette, flip = false): Canvas => {
  const result = canvas(grid[0]?.length ?? 0, grid.length)
  stamp(result, grid, palette, 0, 0, flip)
  return result
}

/** RGBA bytes (for an ImageData or a PNG encoder). */
export const toRgba = (source: Canvas): Uint8ClampedArray<ArrayBuffer> => {
  const bytes = new Uint8ClampedArray(source.width * source.height * 4)
  source.pixels.forEach((color, index) => {
    if (color === TRANSPARENT) return
    bytes[index * 4] = (color >> 16) & 0xff
    bytes[index * 4 + 1] = (color >> 8) & 0xff
    bytes[index * 4 + 2] = color & 0xff
    bytes[index * 4 + 3] = 0xff
  })
  return bytes
}
