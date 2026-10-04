/**
 * Glow for models that should look lit from within (the spirits), without
 * a bloom pass (too costly on phones):
 *
 * - a rim: each lit material glows toward its silhouette's edges (a Fresnel
 *   term added to its emission), as the spirit's sheet draws its cyan edges;
 *   and, optionally, a core: a glow where it faces the camera (a flame's
 *   yellow heart);
 * - a halo: a soft additive disc behind the body, facing the camera;
 * - eye glows: smaller discs on its eye nodes, children of them so they
 *   follow a blink or a glance (none at opacity 0: dark eyes). The eyes get
 *   no rim or core.
 *
 * `addGlow` dresses a loaded model's scene once; copies (`copyModel`)
 * share its halos, and their own materials keep the rim through
 * `keepRim`, since cloning a material drops its shader changes.
 */
import { AdditiveBlending, Color, DataTexture, MeshStandardMaterial, PropertyBinding, RGBAFormat, Sprite, SpriteMaterial } from "three"
import type { Material, Object3D } from "three"

export interface GlowSpec {
  /** The rim's color, strength at the very edge, and how tightly it hugs the edge (higher: thinner). */
  readonly rim: { readonly color: number; readonly strength: number; readonly power: number }
  /** A glow where it faces the camera: its color, strength there, and how tightly it stays in the middle (higher: smaller). */
  readonly core?: { readonly color: number; readonly strength: number; readonly power: number }
  /** The halo behind the body: its color, opacity, and size (times the model's height). */
  readonly halo: { readonly color: number; readonly opacity: number; readonly size: number }
  /** Glows on these nodes (its eyes): color, opacity, size (times the model's height). */
  readonly eyes: { readonly nodes: ReadonlyArray<string>; readonly color: number; readonly opacity: number; readonly size: number }
}

interface RimData {
  readonly color: number
  readonly strength: number
  readonly power: number
  readonly core?: { readonly color: number; readonly strength: number; readonly power: number }
}

/** A soft round spot, white in the middle fading to nothing at the edge (made once). */
let spot: DataTexture | null = null
const softSpot = (): DataTexture => {
  if (spot !== null) return spot
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2)
      const a = Math.max(0, 1 - d) ** 2
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      data[i + 3] = Math.round(a * 255)
    }
  }
  spot = new DataTexture(data, size, size, RGBAFormat)
  spot.needsUpdate = true
  return spot
}

const disc = (color: number, opacity: number, size: number): Sprite => {
  const material = new SpriteMaterial({ map: softSpot(), color: new Color(color), opacity, blending: AdditiveBlending, depthWrite: false, transparent: true })
  const sprite = new Sprite(material)
  sprite.scale.setScalar(size)
  sprite.userData["glow"] = true
  return sprite
}

/** Adds the rim's emission to `material`'s shader (once). */
const applyRim = (material: MeshStandardMaterial, rim: RimData): void => {
  const color = new Color(rim.color)
  const core = rim.core ?? { color: 0, strength: 0, power: 1 }
  const coreColor = new Color(core.color)
  material.onBeforeCompile = (shader) => {
    shader.uniforms["rimColor"] = { value: color }
    shader.uniforms["rimStrength"] = { value: rim.strength }
    shader.uniforms["rimPower"] = { value: rim.power }
    shader.uniforms["coreColor"] = { value: coreColor }
    shader.uniforms["coreStrength"] = { value: core.strength }
    shader.uniforms["corePower"] = { value: core.power }
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;\nuniform vec3 coreColor;\nuniform float coreStrength;\nuniform float corePower;\nvoid main() {")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
	vec3 rimView = isOrthographic ? vec3( 0.0, 0.0, 1.0 ) : normalize( vViewPosition );
	float rimFacing = clamp( abs( dot( normal, rimView ) ), 0.0, 1.0 );
	totalEmissiveRadiance += rimColor * rimStrength * pow( 1.0 - rimFacing, rimPower );
	totalEmissiveRadiance += coreColor * coreStrength * pow( rimFacing, corePower );`)
  }
  material.customProgramCacheKey = () => `rim:${rim.color}:${rim.strength}:${rim.power}:${core.color}:${core.strength}:${core.power}`
  material.needsUpdate = true
}

/** Re-applies the rim on a copy of a material that had one (cloning drops shader changes, keeps `userData`). */
export const keepRim = (material: Material): void => {
  const rim = material.userData["rim"] as RimData | undefined
  if (rim !== undefined && material instanceof MeshStandardMaterial) applyRim(material, rim)
}

/** Dresses a loaded model's `scene` (`height` meters tall) with `glow`. */
export const addGlow = (scene: Object3D, glow: GlowSpec, height: number): void => {
  // The loader names nodes as animation bindings need them ("Eye.L" becomes "EyeL").
  const glowing = new Set(glow.eyes.nodes.map((name) => PropertyBinding.sanitizeNodeName(name)))
  const rim: RimData = glow.core === undefined ? glow.rim : { ...glow.rim, core: glow.core }
  const eyeParts = new Set<Object3D>()
  for (const name of glowing) scene.getObjectByName(name)?.traverse((part) => eyeParts.add(part))
  scene.traverse((part) => {
    // The eyes keep their own look (glowing or dark).
    if (eyeParts.has(part)) return
    const materials = "material" in part ? ([] as Array<Material>).concat(part.material as Material | Array<Material>) : []
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial) || material.userData["rim"] !== undefined) continue
      material.userData["rim"] = rim
      applyRim(material, rim)
    }
  })
  const halo = disc(glow.halo.color, glow.halo.opacity, glow.halo.size * height)
  // Told apart from the eyes' glows: a body's own copy changes with its state (see `Puppet.aura`).
  halo.userData["halo"] = true
  halo.position.y = height * 0.42
  scene.add(halo)
  for (const name of glow.eyes.opacity > 0 ? glowing : []) {
    const node = scene.getObjectByName(name)
    if (node === undefined) continue
    const eye = disc(glow.eyes.color, glow.eyes.opacity, glow.eyes.size * height)
    node.add(eye)
  }
}
