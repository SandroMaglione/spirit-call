/**
 * Particles drawn as one instanced batch: every particle is a quad the
 * GPU cuts to an ellipse (a disc, or a streak along its motion), so a frame
 * writes a few numbers per particle instead of triangulating each on the
 * CPU. At most `capacity` are drawn; the buffers are made once.
 *
 * Coordinates are the overlay's (projected, y down), as `Fx` uses them.
 */
import { DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, BufferAttribute, Mesh, NormalBlending, ShaderMaterial } from "three"

import { linearRgb } from "./shapes.ts"

const vertexShader = /* glsl */ `
attribute vec4 shape;
attribute vec4 tint;
attribute float turn;
varying vec2 vLocal;
varying vec4 vTint;
void main() {
  vTint = tint;
  // Its length along its turn, its width across it, and a pixel more all round for its soft edge
  // (vLocal is 1 on the ellipse itself).
  vec2 local = position.xy * (shape.zw + 1.0);
  vLocal = local / shape.zw;
  float c = cos(turn);
  float s = sin(turn);
  vec2 at = shape.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(at, 0.0, 1.0);
}
`

const fragmentShader = /* glsl */ `
varying vec2 vLocal;
varying vec4 vTint;
void main() {
  // Inside the ellipse, with an edge a pixel soft centered on it (covering what a triangulated one covers).
  float r = length(vLocal);
  float edge = max(fwidth(r), 1e-4);
  float inside = 1.0 - smoothstep(1.0 - edge * 0.5, 1.0 + edge * 0.5, r);
  if (inside <= 0.0) discard;
  gl_FragColor = vec4(vTint.rgb, vTint.a * inside);
  #include <colorspace_fragment>
}
`

export class Particles {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>
  readonly capacity: number
  private readonly shapes: Float32Array
  private readonly tints: Float32Array
  private readonly turns: Float32Array
  private count = 0

  constructor(capacity: number, order: number) {
    this.capacity = capacity
    const geometry = new InstancedBufferGeometry()
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    this.shapes = new Float32Array(capacity * 4)
    this.tints = new Float32Array(capacity * 4)
    this.turns = new Float32Array(capacity)
    geometry.setAttribute("shape", new InstancedBufferAttribute(this.shapes, 4).setUsage(DynamicDrawUsage))
    geometry.setAttribute("tint", new InstancedBufferAttribute(this.tints, 4).setUsage(DynamicDrawUsage))
    geometry.setAttribute("turn", new InstancedBufferAttribute(this.turns, 1).setUsage(DynamicDrawUsage))
    geometry.instanceCount = 0
    const material = new ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false, blending: NormalBlending })
    this.mesh = new Mesh(geometry, material)
    // Its bounds change every frame.
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = order
  }

  clear(): void {
    this.count = 0
  }

  /** How many are drawn this frame. */
  get drawn(): number {
    return this.count
  }

  /** A disc of `radius` at (`x`, `y`). */
  disc(x: number, y: number, radius: number, color: number, alpha: number): void {
    this.ellipse(x, y, radius, radius, color, alpha, 0)
  }

  /** An ellipse `length` along `rotation` (radians) and `width` across it (both radii); none past `capacity`. */
  ellipse(x: number, y: number, length: number, width: number, color: number, alpha: number, rotation: number): void {
    if (alpha <= 0 || length <= 0 || width <= 0 || this.count >= this.capacity) return
    const at = this.count * 4
    const [r, g, b] = linearRgb(color)
    this.shapes[at] = x
    this.shapes[at + 1] = y
    this.shapes[at + 2] = length
    this.shapes[at + 3] = width
    this.tints[at] = r
    this.tints[at + 1] = g
    this.tints[at + 2] = b
    this.tints[at + 3] = Math.min(1, alpha)
    this.turns[this.count] = rotation
    this.count += 1
  }

  /** Uploads what was drawn since `clear` (only that much); called once per frame before rendering. */
  flush(): void {
    const geometry = this.mesh.geometry
    geometry.instanceCount = this.count
    if (this.count === 0) return
    for (const [name, size] of [["shape", 4], ["tint", 4], ["turn", 1]] as const) {
      const attribute = geometry.getAttribute(name) as InstancedBufferAttribute
      attribute.clearUpdateRanges()
      attribute.addUpdateRange(0, this.count * size)
      attribute.needsUpdate = true
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
