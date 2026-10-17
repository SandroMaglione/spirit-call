/**
 * Heat haze: the air over something hot shimmering, the scene behind it
 * bent in waves running up. Looks add sources each frame (`add`, a ring or
 * a disc on the floor and how high its heat rises); the host bends the
 * frame it just drew over them (`apply`), before the overlay goes on top.
 * Only the part of the frame the heat covers is copied and bent (the rest
 * the shader would leave as it is); nothing is drawn (or copied) on a frame
 * with no source.
 */
import { BufferAttribute, BufferGeometry, FramebufferTexture, Mesh, OrthographicCamera, Scene, ShaderMaterial, Vector2, Vector4 } from "three"
import type { WebGLRenderer } from "three"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"


/** The most sources bent at once (more are dropped, the faintest first). */
const most = 8

/** Heat over the floor: a disc (`inner` 0) or a ring around `at` (world), its heat rising `rise` world units. */
export interface HazeSource {
  readonly at: Vec2
  readonly radius: number
  /** Where the ring starts, as a share of `radius` (0: a disc). */
  readonly inner: number
  readonly rise: number
  /** How far the scene is bent, in pixels; fades the source out at 0. */
  readonly strength: number
}

const vertex = /* glsl */ `
// The rectangle bent (min x, min y, max x, max y), in the drawing buffer's pixels from the bottom left.
uniform vec4 area;
uniform vec2 size;
void main() {
  vec2 at = mix(area.xy, area.zw, position.xy);
  gl_Position = vec4(at / size * 2.0 - 1.0, 0.0, 1.0);
}
`

const fragment = /* glsl */ `
uniform sampler2D frame;
// Where the copy of the frame starts in the drawing buffer, and its size (pixels).
uniform vec4 copied;
uniform float dpr;
uniform float time;
uniform int count;
uniform vec4 shapes[${most}];
uniform vec4 looks[${most}];

// How much of a ring (inner to 1, as a share of the radius) is at q (radius 1).
float band(vec2 q, float inner) {
  float d = length(q);
  float inside = inner <= 0.0 ? 1.0 : smoothstep(inner - 0.18, inner + 0.04, d);
  return inside * (1.0 - smoothstep(0.82, 1.06, d));
}

void main() {
  vec2 p = gl_FragCoord.xy;
  vec2 bend = vec2(0.0);
  float heat = 0.0;
  for (int i = 0; i < ${most}; i++) {
    if (i >= count) break;
    vec4 shape = shapes[i];
    vec4 look = looks[i];
    vec2 radii = shape.zw;
    float weight = 0.0;
    // The floor itself, then the air over it: the same ring lifted, fainter as it rises.
    for (int k = 0; k < 6; k++) {
      float up = float(k) / 5.0;
      vec2 q = (p - shape.xy - vec2(0.0, up * look.y)) / radii;
      weight = max(weight, band(q, look.x) * (1.0 - up * 0.85));
    }
    if (weight <= 0.0) continue;
    float s = look.z * dpr * weight;
    // Waves running up the screen, two of them crossing.
    float y = p.y / dpr;
    float x = p.x / dpr;
    bend += s * vec2(
      sin(y * 0.11 - time * 11.0 + float(i) * 1.7) * 0.7 + sin(y * 0.047 + x * 0.02 - time * 6.0) * 0.5,
      sin(x * 0.07 + y * 0.05 - time * 9.0 + float(i)) * 0.6
    );
    heat += weight * look.w;
  }
  vec4 color = texture2D(frame, (p + bend - copied.xy) / copied.zw);
  // A little warmth where it is hottest.
  color.rgb += vec3(1.0, 0.42, 0.12) * min(heat, 1.0) * 0.07;
  gl_FragColor = color;
}
`

export class Haze {
  private readonly sources: Array<HazeSource> = []
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material: ShaderMaterial
  private texture: FramebufferTexture | null = null
  private readonly buffer = new Vector2()
  private readonly copiedAt = new Vector2()
  private readonly start = performance.now()
  /** Whether the last frame was bent (for `?perf`'s samples). */
  applied = false

  constructor() {
    // A unit square, stretched over the rectangle bent.
    const geometry = new BufferGeometry()
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]), 3))
    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        frame: { value: null },
        area: { value: new Vector4() },
        size: { value: new Vector2(1, 1) },
        copied: { value: new Vector4() },
        dpr: { value: 1 },
        time: { value: 0 },
        count: { value: 0 },
        shapes: { value: Array.from({ length: most }, () => new Vector4()) },
        looks: { value: Array.from({ length: most }, () => new Vector4()) }
      }
    })
    const mesh = new Mesh(geometry, this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }

  /** Compiles its shader and makes its copy of the frame (half the screen across and up, grown if a fight needs more), before a fight needs them. */
  async warm(renderer: WebGLRenderer): Promise<void> {
    const buffer = renderer.getDrawingBufferSize(this.buffer)
    renderer.initTexture(this.frameTexture(Math.ceil(buffer.x / 2), Math.ceil(buffer.y / 2)))
    this.material.uniforms.frame!.value = this.texture
    await renderer.compileAsync(this.scene, this.camera)
  }

  /**
   * The copy of the frame: at least `width` by `height` pixels, never
   * larger than the drawing buffer (`this.buffer`). Kept from frame to frame,
   * and made again (a quarter larger than asked) only when too small.
   */
  private frameTexture(width: number, height: number): FramebufferTexture {
    const buffer = this.buffer
    const known = this.texture
    if (known !== null && known.image.width >= width && known.image.height >= height && known.image.width <= buffer.x && known.image.height <= buffer.y) return known
    const grown = (needed: number, had: number, most: number) => Math.min(most, Math.max(needed <= had ? had : Math.ceil(needed * 1.25), needed))
    const texture = new FramebufferTexture(grown(width, known?.image.width ?? 0, buffer.x), grown(height, known?.image.height ?? 0, buffer.y))
    known?.dispose()
    this.texture = texture
    return texture
  }

  /** Heat this frame (sources last one frame: add them every frame they show). */
  add(source: HazeSource): void {
    if (source.strength > 0 && source.radius > 0) this.sources.push(source)
  }

  /**
   * Bends the frame just drawn over this frame's sources (`toCanvas`: a
   * floor point, raised some pixels, in CSS pixels from the top left), then
   * forgets them.
   */
  apply(renderer: WebGLRenderer, toCanvas: (world: Vec2, height: number) => Vec2): void {
    const sources = this.sources
    this.applied = sources.length > 0
    if (sources.length === 0) return
    // The strongest first: past `most`, the faintest are dropped.
    sources.sort((a, b) => b.strength - a.strength)
    const count = Math.min(most, sources.length)
    const dpr = renderer.getPixelRatio()
    const buffer = renderer.getDrawingBufferSize(this.buffer)
    const uniforms = this.material.uniforms
    const shapes = uniforms.shapes!.value as Array<Vector4>
    const looks = uniforms.looks!.value as Array<Vector4>
    // What the heat covers (where the shader's weight is above 0: each ring to 1.06 of its radii, lifted by its rise).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    // How far a bend can reach (the waves' amplitudes add up to 1.2 across, 0.6 up): copied around it.
    let reach = 0
    for (let index = 0; index < count; index++) {
      const source = sources[index]!
      const center = toCanvas(source.at, 0)
      // The ring as the floor shows it: its widest across and its tallest.
      let across = 0
      let tall = 0
      for (let step = 0; step < 8; step++) {
        const angle = (step / 8) * Math.PI * 2
        const edge = toCanvas({ x: source.at.x + Math.cos(angle) * source.radius, y: source.at.y + Math.sin(angle) * source.radius }, 0)
        across = Math.max(across, Math.abs(edge.x - center.x))
        tall = Math.max(tall, Math.abs(edge.y - center.y))
      }
      const rise = center.y - toCanvas(source.at, source.rise).y
      // In the drawing buffer's pixels, from the bottom.
      const shape = shapes[index]!.set(center.x * dpr, buffer.y - center.y * dpr, Math.max(1, across * dpr), Math.max(1, tall * dpr))
      const look = looks[index]!.set(source.inner, rise * dpr, source.strength, 1)
      minX = Math.min(minX, shape.x - shape.z * 1.06)
      maxX = Math.max(maxX, shape.x + shape.z * 1.06)
      minY = Math.min(minY, shape.y + Math.min(0, look.y) - shape.w * 1.06)
      maxY = Math.max(maxY, shape.y + Math.max(0, look.y) + shape.w * 1.06)
      reach += source.strength * dpr * 1.2
    }
    sources.length = 0
    // In whole pixels, inside the drawing buffer.
    const left = Math.max(0, Math.floor(minX)), bottom = Math.max(0, Math.floor(minY))
    const right = Math.min(buffer.x, Math.ceil(maxX)), top = Math.min(buffer.y, Math.ceil(maxY))
    if (right <= left || top <= bottom) return
    const margin = Math.ceil(reach) + 2
    const fromX = Math.max(0, left - margin), fromY = Math.max(0, bottom - margin)
    const texture = this.frameTexture(Math.min(buffer.x, right + margin) - fromX, Math.min(buffer.y, top + margin) - fromY)
    // The copy, as large as its texture, kept inside the buffer: where it meets the screen's edge it ends there, as a full copy would.
    const copied = this.copiedAt.set(Math.min(fromX, buffer.x - texture.image.width), Math.min(fromY, buffer.y - texture.image.height))
    renderer.copyFramebufferToTexture(texture, copied)
    uniforms.frame!.value = texture
    uniforms.area!.value.set(left, bottom, right, top)
    uniforms.size!.value.set(buffer.x, buffer.y)
    uniforms.copied!.value.set(copied.x, copied.y, texture.image.width, texture.image.height)
    uniforms.dpr!.value = dpr
    uniforms.time!.value = (performance.now() - this.start) / 1000
    uniforms.count!.value = count
    renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.texture?.dispose()
    this.material.dispose()
    for (const child of this.scene.children) if (child instanceof Mesh) child.geometry.dispose()
  }
}
