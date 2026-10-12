/**
 * Numbers drawn from a digit atlas, all in one mesh (one draw call however
 * many numbers float at once): white digits with a dark outline, tinted per
 * number. Outlines are drawn first and fills over them, so neighboring
 * digits never cover each other's fill.
 *
 * Coordinates are the overlay's (projected, y down).
 */
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, DynamicDrawUsage, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, SRGBColorSpace } from "three"

/** A cell of the atlas, in CSS pixels at size 1; `advance` is how far apart digits sit. */
const cell = { width: 14, height: 22, advance: 9 }
/** Atlas pixels per CSS pixel: sharp on dense screens and while popping in larger. */
const resolution = 3
const font = "700 15px IBM Plex Mono, ui-monospace, monospace"
const outline = { width: 4, color: "#0d1117" }

/** The atlas: two rows of ten digits, outlines on top, fills below. */
const drawAtlas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas")
  canvas.width = cell.width * 10 * resolution
  canvas.height = cell.height * 2 * resolution
  const context = canvas.getContext("2d")
  if (context === null) return canvas
  context.scale(resolution, resolution)
  context.font = font
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.lineJoin = "round"
  context.lineWidth = outline.width
  context.strokeStyle = outline.color
  context.fillStyle = "#ffffff"
  for (let digit = 0; digit < 10; digit++) {
    const x = (digit + 0.5) * cell.width
    context.strokeText(String(digit), x, cell.height / 2)
    context.fillText(String(digit), x, cell.height * 1.5)
  }
  return canvas
}

export class Digits {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>
  private positions = new Float32Array(0)
  private uvs = new Float32Array(0)
  private colors = new Float32Array(0)
  private count = 0
  /** Fills are queued and written after every outline. */
  private readonly fills: Array<{ text: string; x: number; y: number; size: number; r: number; g: number; b: number; a: number }> = []
  private readonly color = new Color()

  constructor(order: number) {
    const texture = new CanvasTexture(drawAtlas())
    // Drawn in sRGB like any color; mipmapped so shrunken numbers do not shimmer.
    texture.colorSpace = SRGBColorSpace
    texture.minFilter = LinearMipmapLinearFilter
    this.mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ map: texture, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide }))
    // Flat: one pass looks the same as three.js's two for see-through double-sided materials, without redoing its shader setup each frame.
    this.mesh.material.forceSinglePass = true
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = order
    this.grow(256)
  }

  clear(): void {
    this.count = 0
    this.fills.length = 0
  }

  /** `text` (digits only) centered at (`x`, `y`), `size` times its resting size, tinted `color`, with opacity `alpha`. */
  write(text: string, x: number, y: number, size: number, color: number, alpha: number): void {
    if (alpha <= 0) return
    this.color.setHex(color)
    this.glyphs(text, x, y, size, 0, 1, 1, 1, alpha)
    this.fills.push({ text, x, y, size, r: this.color.r, g: this.color.g, b: this.color.b, a: alpha })
  }

  /** Uploads this frame's numbers; called once per frame before rendering. */
  flush(): void {
    for (const fill of this.fills) this.glyphs(fill.text, fill.x, fill.y, fill.size, 1, fill.r, fill.g, fill.b, fill.a)
    this.fills.length = 0
    const geometry = this.mesh.geometry
    geometry.setDrawRange(0, this.count)
    if (this.count === 0) return
    for (const [name, size] of [["position", 3], ["uv", 2], ["color", 4]] as const) {
      const attribute = geometry.getAttribute(name) as BufferAttribute
      attribute.clearUpdateRanges()
      attribute.addUpdateRange(0, this.count * size)
      attribute.needsUpdate = true
    }
  }

  dispose(): void {
    this.mesh.material.map?.dispose()
    this.mesh.material.dispose()
    this.mesh.geometry.dispose()
  }

  /** One quad per digit, from row `row` of the atlas (0 outlines, 1 fills). */
  private glyphs(text: string, x: number, y: number, size: number, row: number, r: number, g: number, b: number, a: number): void {
    const width = cell.width * size
    const height = cell.height * size
    const advance = cell.advance * size
    let left = x - (advance * (text.length - 1)) / 2 - width / 2
    const top = y - height / 2
    // Canvas rows run down, texture v runs up.
    const v1 = 1 - row / 2
    const v0 = v1 - 0.5
    for (const char of text) {
      const digit = char.charCodeAt(0) - 48
      if (digit >= 0 && digit <= 9) {
        const u0 = digit / 10
        const u1 = (digit + 1) / 10
        this.vertex(left, top, u0, v1, r, g, b, a)
        this.vertex(left + width, top, u1, v1, r, g, b, a)
        this.vertex(left + width, top + height, u1, v0, r, g, b, a)
        this.vertex(left, top, u0, v1, r, g, b, a)
        this.vertex(left + width, top + height, u1, v0, r, g, b, a)
        this.vertex(left, top + height, u0, v0, r, g, b, a)
      }
      left += advance
    }
  }

  private vertex(x: number, y: number, u: number, v: number, r: number, g: number, b: number, a: number): void {
    if (this.count + 1 > this.positions.length / 3) this.grow(this.count * 2)
    const i = this.count
    this.positions[i * 3] = x
    this.positions[i * 3 + 1] = y
    this.positions[i * 3 + 2] = 0
    this.uvs[i * 2] = u
    this.uvs[i * 2 + 1] = v
    this.colors[i * 4] = r
    this.colors[i * 4 + 1] = g
    this.colors[i * 4 + 2] = b
    this.colors[i * 4 + 3] = a
    this.count++
  }

  private grow(vertices: number): void {
    const positions = new Float32Array(vertices * 3)
    const uvs = new Float32Array(vertices * 2)
    const colors = new Float32Array(vertices * 4)
    positions.set(this.positions.subarray(0, this.count * 3))
    uvs.set(this.uvs.subarray(0, this.count * 2))
    colors.set(this.colors.subarray(0, this.count * 4))
    this.positions = positions
    this.uvs = uvs
    this.colors = colors
    const geometry = this.mesh.geometry
    geometry.dispose()
    geometry.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage))
    geometry.setAttribute("uv", new BufferAttribute(uvs, 2).setUsage(DynamicDrawUsage))
    geometry.setAttribute("color", new BufferAttribute(colors, 4).setUsage(DynamicDrawUsage))
  }
}
