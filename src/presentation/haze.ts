/**
 * Heat haze: the air over something hot shimmering, the scene behind it
 * bent in waves running up. Looks add sources each frame (`add`, a ring or
 * a disc on the floor and how high its heat rises); the host bends the
 * frame it just drew over them (`apply`), before the overlay goes on top.
 * Nothing is drawn (or copied) on a frame with no source.
 */
import { BufferAttribute, BufferGeometry, FramebufferTexture, Mesh, OrthographicCamera, Scene, ShaderMaterial, Vector2, Vector4 } from "three"
import type { WebGLRenderer } from "three"

import type { Vec2 } from "../math/vec.ts"

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
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragment = /* glsl */ `
uniform sampler2D frame;
uniform vec2 size;
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
  vec4 color = texture2D(frame, (p + bend) / size);
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
  private readonly start = performance.now()
  /** Whether the last frame was bent (for `?perf`'s samples). */
  applied = false

  constructor() {
    const geometry = new BufferGeometry()
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        frame: { value: null },
        size: { value: new Vector2(1, 1) },
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

  /** Compiles its shader and makes its copy of the frame at the screen's size, before a fight needs them. */
  async warm(renderer: WebGLRenderer): Promise<void> {
    renderer.initTexture(this.frameTexture(renderer))
    this.material.uniforms.frame!.value = this.texture
    await renderer.compileAsync(this.scene, this.camera)
  }

  /** The copy of the frame, made again when the drawing buffer's size changes. */
  private frameTexture(renderer: WebGLRenderer): FramebufferTexture {
    const buffer = renderer.getDrawingBufferSize(this.buffer)
    if (this.texture === null || this.texture.image.width !== buffer.x || this.texture.image.height !== buffer.y) {
      this.texture?.dispose()
      this.texture = new FramebufferTexture(buffer.x, buffer.y)
    }
    return this.texture
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
    this.applied = this.sources.length > 0
    if (this.sources.length === 0) return
    const sources = this.sources.sort((a, b) => b.strength - a.strength).slice(0, most)
    this.sources.length = 0
    const dpr = renderer.getPixelRatio()
    const texture = this.frameTexture(renderer)
    const buffer = this.buffer
    renderer.copyFramebufferToTexture(texture)
    const uniforms = this.material.uniforms
    const shapes = uniforms.shapes!.value as Array<Vector4>
    const looks = uniforms.looks!.value as Array<Vector4>
    sources.forEach((source, index) => {
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
      shapes[index]!.set(center.x * dpr, buffer.y - center.y * dpr, Math.max(1, across * dpr), Math.max(1, tall * dpr))
      looks[index]!.set(source.inner, rise * dpr, source.strength, 1)
    })
    uniforms.frame!.value = texture
    uniforms.size!.value.set(buffer.x, buffer.y)
    uniforms.dpr!.value = dpr
    uniforms.time!.value = (performance.now() - this.start) / 1000
    uniforms.count!.value = sources.length
    renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.texture?.dispose()
    this.material.dispose()
    for (const child of this.scene.children) if (child instanceof Mesh) child.geometry.dispose()
  }
}
