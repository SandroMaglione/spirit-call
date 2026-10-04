/**
 * Glow for models that should look lit from within (the spirits), without
 * a bloom pass (too costly on phones):
 *
 * - a rim: each lit material glows toward its silhouette's edges (a Fresnel
 *   term added to its emission), as the spirit's sheet draws its cyan edges;
 * - a halo: a soft additive disc behind the body, facing the camera;
 * - eye glows: smaller discs on the nodes that glow (its eyes), children of
 *   them so they follow a blink or a glance.
 *
 * `addGlow` dresses a loaded model's scene once; copies (`copyModel`)
 * share its halos, and their own materials keep the rim through
 * `keepRim`, since cloning a material drops its shader changes.
 */
import { AdditiveBlending, Color, DataTexture, MeshStandardMaterial, RGBAFormat, Sprite, SpriteMaterial } from "three"
import type { Material, Object3D } from "three"

export interface GlowSpec {
  /** The rim's color, strength at the very edge, and how tightly it hugs the edge (higher: thinner). */
  readonly rim: { readonly color: number; readonly strength: number; readonly power: number }
  /** The halo behind the body: its color, opacity, and size (times the model's height). */
  readonly halo: { readonly color: number; readonly opacity: number; readonly size: number }
  /** Glows on these nodes (its eyes): color, opacity, size (times the model's height). */
  readonly eyes: { readonly nodes: ReadonlyArray<string>; readonly color: number; readonly opacity: number; readonly size: number }
}

interface RimData {
  readonly color: number
  readonly strength: number
  readonly power: number
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
  material.onBeforeCompile = (shader) => {
    shader.uniforms["rimColor"] = { value: color }
    shader.uniforms["rimStrength"] = { value: rim.strength }
    shader.uniforms["rimPower"] = { value: rim.power }
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;\nvoid main() {")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
	vec3 rimView = isOrthographic ? vec3( 0.0, 0.0, 1.0 ) : normalize( vViewPosition );
	totalEmissiveRadiance += rimColor * rimStrength * pow( 1.0 - clamp( abs( dot( normal, rimView ) ), 0.0, 1.0 ), rimPower );`)
  }
  material.customProgramCacheKey = () => `rim:${rim.color}:${rim.strength}:${rim.power}`
  material.needsUpdate = true
}

/** Re-applies the rim on a copy of a material that had one (cloning drops shader changes, keeps `userData`). */
export const keepRim = (material: Material): void => {
  const rim = material.userData["rim"] as RimData | undefined
  if (rim !== undefined && material instanceof MeshStandardMaterial) applyRim(material, rim)
}

/** Dresses a loaded model's `scene` (`height` meters tall) with `glow`. */
export const addGlow = (scene: Object3D, glow: GlowSpec, height: number): void => {
  const glowing = new Set(glow.eyes.nodes)
  scene.traverse((part) => {
    const materials = "material" in part ? ([] as Array<Material>).concat(part.material as Material | Array<Material>) : []
    for (const material of materials) {
      // Already glowing materials (the eyes) get no rim.
      if (!(material instanceof MeshStandardMaterial) || material.emissiveIntensity > 1) continue
      material.userData["rim"] = glow.rim satisfies RimData
      applyRim(material, glow.rim)
    }
  })
  const halo = disc(glow.halo.color, glow.halo.opacity, glow.halo.size * height)
  halo.position.y = height * 0.42
  scene.add(halo)
  for (const name of glowing) {
    const node = scene.getObjectByName(name)
    if (node === undefined) continue
    const eye = disc(glow.eyes.color, glow.eyes.opacity, glow.eyes.size * height)
    node.add(eye)
  }
}
