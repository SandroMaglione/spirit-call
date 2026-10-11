/**
 * Shapes drawn fresh every frame (telegraphs, aim marks, trails, particles,
 * health bars): circles, arcs, sectors, polygons, and lines, filled or
 * stroked, each with its own color and opacity. Everything drawn into one
 * `Shapes` is a single mesh (one draw call), triangulated on the CPU, so
 * edges stay sharp at any zoom.
 *
 * Coordinates are in the layer's plane: the floor's (x, y) for layers lying
 * on the floor (see `onFloor`), screen pixels for the overlay.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicMaterial, NormalBlending } from "three"

export interface ShapesOptions {
  /** Add light instead of covering (flashes). */
  readonly additive?: boolean
  /** Hidden behind things in front of it (on the floor), or drawn over everything. */
  readonly depthTest?: boolean
  /** Drawing order among see-through layers: higher draws later. */
  readonly order?: number
  /** Vertices it has room for from the start (it grows past them, but growing re-creates its buffers mid-frame). */
  readonly capacity?: number
}

const tau = Math.PI * 2

/** Segments for a full circle of this radius: smooth when large, cheap when small. */
const segmentsFor = (radius: number): number => Math.max(10, Math.min(96, Math.ceil(Math.sqrt(Math.abs(radius)) * 4)))

/**
 * The unit circle cut in `segments`: the cosine and sine of each cut's
 * angle, `index / segments` of a turn, for `index` 0 to `segments`. Worked
 * out once per number of segments (the very values a loop over the angles
 * would compute), instead of for every circle drawn.
 */
const circles = new Map<number, { readonly cos: Float64Array; readonly sin: Float64Array }>()
const unitCircle = (segments: number): { readonly cos: Float64Array; readonly sin: Float64Array } => {
  const known = circles.get(segments)
  if (known !== undefined) return known
  const cos = new Float64Array(segments + 1)
  const sin = new Float64Array(segments + 1)
  for (let index = 0; index <= segments; index++) {
    const angle = (index / segments) * tau
    cos[index] = Math.cos(angle)
    sin[index] = Math.sin(angle)
  }
  const circle = { cos, sin }
  circles.set(segments, circle)
  return circle
}

/** 0xRRGGBB to linear RGB (vertex colors are linear), memoized: shapes reuse a handful of colors. */
const linear = new Map<number, readonly [number, number, number]>()
const scratch = new Color()
const rgbOf = (hex: number): readonly [number, number, number] => {
  const known = linear.get(hex)
  if (known !== undefined) return known
  scratch.setHex(hex)
  const rgb = [scratch.r, scratch.g, scratch.b] as const
  linear.set(hex, rgb)
  return rgb
}

export class Shapes {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>
  private positions = new Float32Array(0)
  private colors = new Float32Array(0)
  /** Vertices written this frame. */
  private count = 0
  private r = 1
  private g = 1
  private b = 1
  private a = 1
  /** A scratch outline for strokes, and its corners' offsets, reused every frame. */
  private readonly outline: Array<number> = []
  private miters = new Float64Array(0)

  constructor(options: ShapesOptions = {}) {
    const material = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: options.depthTest ?? true,
      side: DoubleSide,
      blending: options.additive === true ? AdditiveBlending : NormalBlending
    })
    // A flat layer looks the same drawn in one pass: three.js would otherwise draw a see-through double-sided
    // material twice (its back, then its front), redoing its shader setup before each, every frame.
    material.forceSinglePass = true
    this.mesh = new Mesh(new BufferGeometry(), material)
    // Its bounds change every frame.
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = options.order ?? 0
    this.grow(options.capacity ?? 1024)
  }

  /** Lays the layer on the floor, `height` world units above it: the plane's (x, y) is the floor's (x, y). */
  onFloor(height: number): this {
    this.mesh.rotation.x = Math.PI / 2
    this.mesh.position.y = height
    return this
  }

  clear(): this {
    this.count = 0
    return this
  }

  get vertices(): number {
    return this.count
  }

  /** Uploads what was drawn since `clear`; called once per frame before rendering. */
  flush(): void {
    const geometry = this.mesh.geometry
    geometry.setDrawRange(0, this.count)
    if (this.count === 0) return
    const position = geometry.getAttribute("position") as BufferAttribute
    const color = geometry.getAttribute("color") as BufferAttribute
    position.clearUpdateRanges()
    position.addUpdateRange(0, this.count * 3)
    position.needsUpdate = true
    color.clearUpdateRanges()
    color.addUpdateRange(0, this.count * 4)
    color.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }

  fillCircle(x: number, y: number, radius: number, color: number, alpha: number): this {
    return this.fillEllipse(x, y, radius, radius, color, alpha)
  }

  strokeCircle(x: number, y: number, radius: number, width: number, color: number, alpha: number): this {
    return this.strokeEllipse(x, y, radius, radius, width, color, alpha)
  }

  /** An ellipse with radii `rx`, `ry`, turned by `rotation` radians. */
  fillEllipse(x: number, y: number, rx: number, ry: number, color: number, alpha: number, rotation = 0): this {
    if (alpha <= 0 || rx <= 0 || ry <= 0) return this
    this.paint(color, alpha)
    const segments = segmentsFor(Math.max(rx, ry))
    const circle = unitCircle(segments)
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    let px = x + cos * rx
    let py = y + sin * rx
    for (let index = 1; index <= segments; index++) {
      const ex = circle.cos[index]! * rx
      const ey = circle.sin[index]! * ry
      const nx = x + ex * cos - ey * sin
      const ny = y + ex * sin + ey * cos
      this.triangle(x, y, px, py, nx, ny)
      px = nx
      py = ny
    }
    return this
  }

  strokeEllipse(x: number, y: number, rx: number, ry: number, width: number, color: number, alpha: number): this {
    if (alpha <= 0 || rx <= 0 || ry <= 0) return this
    const points = this.outline
    points.length = 0
    const segments = segmentsFor(Math.max(rx, ry))
    const circle = unitCircle(segments)
    for (let index = 0; index < segments; index++) points.push(x + circle.cos[index]! * rx, y + circle.sin[index]! * ry)
    return this.strokePath(points, true, width, color, alpha)
  }

  /** The arc of a circle from angle `start` to `end` (radians, either way round). */
  strokeArc(x: number, y: number, radius: number, start: number, end: number, width: number, color: number, alpha: number): this {
    if (alpha <= 0 || radius <= 0 || start === end) return this
    const points = this.outline
    points.length = 0
    this.arcPoints(points, x, y, radius, start, end)
    return this.strokePath(points, false, width, color, alpha)
  }

  /** A pie slice: from the center out to the arc between `start` and `end`. */
  fillSector(x: number, y: number, radius: number, start: number, end: number, color: number, alpha: number): this {
    if (alpha <= 0 || radius <= 0) return this
    this.paint(color, alpha)
    const points = this.outline
    points.length = 0
    this.arcPoints(points, x, y, radius, start, end)
    for (let index = 2; index < points.length; index += 2) {
      this.triangle(x, y, points[index - 2]!, points[index - 1]!, points[index]!, points[index + 1]!)
    }
    return this
  }

  strokeSector(x: number, y: number, radius: number, start: number, end: number, width: number, color: number, alpha: number): this {
    if (alpha <= 0 || radius <= 0) return this
    const points = this.outline
    points.length = 0
    points.push(x, y)
    this.arcPoints(points, x, y, radius, start, end)
    return this.strokePath(points, true, width, color, alpha)
  }

  /** A convex polygon, as flat [x0, y0, x1, y1, ...]. */
  fillPoly(points: ReadonlyArray<number>, color: number, alpha: number): this {
    if (alpha <= 0 || points.length < 6) return this
    this.paint(color, alpha)
    for (let index = 4; index < points.length; index += 2) {
      this.triangle(points[0]!, points[1]!, points[index - 2]!, points[index - 1]!, points[index]!, points[index + 1]!)
    }
    return this
  }

  strokePoly(points: ReadonlyArray<number>, width: number, color: number, alpha: number): this {
    return this.strokePath(points, true, width, color, alpha)
  }

  line(x0: number, y0: number, x1: number, y1: number, width: number, color: number, alpha: number): this {
    if (alpha <= 0) return this
    const points = this.outline
    points.length = 0
    points.push(x0, y0, x1, y1)
    return this.strokePath(points, false, width, color, alpha)
  }

  fillRect(x: number, y: number, width: number, height: number, color: number, alpha: number): this {
    if (alpha <= 0 || width <= 0 || height <= 0) return this
    this.paint(color, alpha)
    this.triangle(x, y, x + width, y, x + width, y + height)
    this.triangle(x, y, x + width, y + height, x, y + height)
    return this
  }

  private arcPoints(into: Array<number>, x: number, y: number, radius: number, start: number, end: number): void {
    const segments = Math.max(2, Math.ceil((segmentsFor(radius) * Math.abs(end - start)) / tau))
    for (let index = 0; index <= segments; index++) {
      const angle = start + ((end - start) * index) / segments
      into.push(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
    }
  }

  /** A band `width` wide along the path, with mitered corners so thick rings stay solid. */
  private strokePath(points: ReadonlyArray<number>, closed: boolean, width: number, color: number, alpha: number): this {
    const n = points.length / 2
    if (alpha <= 0 || n < 2) return this
    this.paint(color, alpha)
    const half = width / 2
    if (this.miters.length < n * 2) this.miters = new Float64Array(n * 4)
    const miters = this.miters
    // The offset of the band's left edge at each point: the average of the two segments' normals meeting there.
    for (let i = 0; i < n; i++) {
      const prev = closed ? (i - 1 + n) % n : Math.max(0, i - 1)
      const next = closed ? (i + 1) % n : Math.min(n - 1, i + 1)
      const x = points[i * 2]!
      const y = points[i * 2 + 1]!
      let ax = x - points[prev * 2]!
      let ay = y - points[prev * 2 + 1]!
      let bx = points[next * 2]! - x
      let by = points[next * 2 + 1]! - y
      if (Math.hypot(ax, ay) < 1e-9) {
        ax = bx
        ay = by
      } else if (Math.hypot(bx, by) < 1e-9) {
        bx = ax
        by = ay
      }
      const na = Math.hypot(ax, ay) || 1
      const nb = Math.hypot(bx, by) || 1
      const n0x = -ay / na
      const n0y = ax / na
      let mx = n0x - by / nb
      let my = n0y + bx / nb
      const ml = Math.hypot(mx, my)
      if (ml < 1e-6) {
        miters[i * 2] = n0x * half
        miters[i * 2 + 1] = n0y * half
        continue
      }
      mx /= ml
      my /= ml
      // Longer at sharp corners, capped so spikes stay short.
      const scale = half / Math.max(0.35, mx * n0x + my * n0y)
      miters[i * 2] = mx * scale
      miters[i * 2 + 1] = my * scale
    }
    const last = closed ? n : n - 1
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n
      const x0 = points[i * 2]!
      const y0 = points[i * 2 + 1]!
      const x1 = points[j * 2]!
      const y1 = points[j * 2 + 1]!
      const ox = miters[i * 2]!
      const oy = miters[i * 2 + 1]!
      const qx = miters[j * 2]!
      const qy = miters[j * 2 + 1]!
      this.triangle(x0 + ox, y0 + oy, x0 - ox, y0 - oy, x1 + qx, y1 + qy)
      this.triangle(x0 - ox, y0 - oy, x1 - qx, y1 - qy, x1 + qx, y1 + qy)
    }
    return this
  }

  private paint(color: number, alpha: number): void {
    const [r, g, b] = rgbOf(color)
    this.r = r
    this.g = g
    this.b = b
    this.a = Math.min(1, alpha)
  }

  private triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
    if (this.count + 3 > this.positions.length / 3) this.grow(this.count * 2 + 3)
    let p = this.count * 3
    const positions = this.positions
    positions[p++] = x0
    positions[p++] = y0
    positions[p++] = 0
    positions[p++] = x1
    positions[p++] = y1
    positions[p++] = 0
    positions[p++] = x2
    positions[p++] = y2
    positions[p] = 0
    let c = this.count * 4
    const colors = this.colors
    for (let vertex = 0; vertex < 3; vertex++) {
      colors[c++] = this.r
      colors[c++] = this.g
      colors[c++] = this.b
      colors[c++] = this.a
    }
    this.count += 3
  }

  /** Room for at least `vertices`, keeping what is drawn so far. */
  private grow(vertices: number): void {
    const positions = new Float32Array(vertices * 3)
    const colors = new Float32Array(vertices * 4)
    positions.set(this.positions.subarray(0, this.count * 3))
    colors.set(this.colors.subarray(0, this.count * 4))
    this.positions = positions
    this.colors = colors
    const geometry = this.mesh.geometry
    // New buffers need a fresh upload: drop the old ones.
    geometry.dispose()
    geometry.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage))
    geometry.setAttribute("color", new BufferAttribute(colors, 4).setUsage(DynamicDrawUsage))
  }
}
