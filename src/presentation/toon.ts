/**
 * Cel shading for the anime characters: their materials light in two flat
 * tones (lit and shaded, the sky light still softening them), and an
 * outline in screen pixels keeps their shape readable at game size, where
 * a character is only a few dozen pixels tall. A model asks for it with
 * `shading: "toon"` in its spec (see `docs/models.md`).
 *
 * The outline is the inverted hull: a copy of each mesh, drawn from
 * behind (its back faces) and pushed outward along its smoothed normals by
 * a fixed number of pixels, so it shows only around the silhouette and
 * where a part passes in front of another. It follows the same skeleton.
 */
import { BackSide, BufferAttribute, BufferGeometry, DataTexture, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, NearestFilter, RedFormat, SkinnedMesh, Vector2 } from "three"
import type { Material, Object3D, WebGLRenderer } from "three"

export const toon = {
  /** Light falling on a face, as its fraction of full light, from facing away to facing the sun. */
  steps: [0.55, 0.55, 1, 1],
  outline: { color: 0x23263a, pixels: 0.8 }
}

let gradient: DataTexture | null = null
/** The light steps as a texture: nearest filtering keeps the steps hard. */
const toonGradient = (): DataTexture => {
  if (gradient !== null) return gradient
  gradient = new DataTexture(new Uint8Array(toon.steps.map((step) => Math.round(step * 255))), toon.steps.length, 1, RedFormat)
  gradient.minFilter = NearestFilter
  gradient.magFilter = NearestFilter
  gradient.generateMipmaps = false
  gradient.needsUpdate = true
  return gradient
}

/** A cel-shaded material with `material`'s colors and texture. */
export const toonMaterial = (material: MeshStandardMaterial): MeshToonMaterial => {
  const shaded = new MeshToonMaterial({
    name: material.name,
    color: material.color,
    map: material.map,
    emissive: material.emissive,
    emissiveIntensity: material.emissiveIntensity,
    gradientMap: toonGradient(),
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side
  })
  return shaded
}

/** Turns every standard material in `scene` cel-shaded (parts sharing one keep sharing it). */
export const toonMaterials = (scene: Object3D): void => {
  const shaded = new Map<Material, Material>()
  const convert = (material: Material): Material => {
    if (!(material instanceof MeshStandardMaterial)) return material
    const known = shaded.get(material)
    if (known !== undefined) return known
    const toonish = toonMaterial(material)
    shaded.set(material, toonish)
    material.dispose()
    return toonish
  }
  scene.traverse((part) => {
    if (part instanceof Mesh) part.material = Array.isArray(part.material) ? part.material.map(convert) : convert(part.material)
  })
}

/**
 * `geometry` with smoothed normals: every copy of a position (split by UV
 * seams or hard edges) gets their average, so the pushed hull has no cracks.
 * Positions, skin, and indices are shared with the original.
 */
export const outlineGeometry = (geometry: BufferGeometry): BufferGeometry => {
  const position = geometry.getAttribute("position")
  const normal = geometry.getAttribute("normal")
  const sums = new Map<string, [number, number, number]>()
  const keyOf = (i: number) => `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`
  for (let i = 0; i < position.count; i++) {
    const key = keyOf(i)
    const sum = sums.get(key) ?? [0, 0, 0]
    sum[0] += normal.getX(i)
    sum[1] += normal.getY(i)
    sum[2] += normal.getZ(i)
    sums.set(key, sum)
  }
  const smoothed = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = sums.get(keyOf(i))!
    const length = Math.hypot(x, y, z) || 1
    smoothed.set([x / length, y / length, z / length], i * 3)
  }
  const hull = new BufferGeometry()
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (name !== "normal" && name !== "uv") hull.setAttribute(name, attribute)
  }
  hull.setAttribute("normal", new BufferAttribute(smoothed, 3))
  hull.setIndex(geometry.getIndex())
  for (const group of geometry.groups) hull.addGroup(group.start, group.count, 0)
  return hull
}

const hulls = new WeakMap<BufferGeometry, BufferGeometry>()
const drawingBuffer = new Vector2()

/** The outline's material: back faces only, pushed out by `pixels` on screen, in the outline color. */
export const outlineMaterial = (): MeshBasicMaterial => {
  const material = new MeshBasicMaterial({ color: toon.outline.color, side: BackSide })
  material.name = "outline"
  const push = { value: new Vector2() }
  material.userData["push"] = push
  material.onBeforeCompile = (shader) => {
    shader.uniforms["outlinePush"] = push
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec2 outlinePush;")
      .replace(
        "#include <project_vertex>",
        [
          "#include <project_vertex>",
          "#ifdef USE_SKINNING",
          "  vec3 hullNormal = objectNormal;",
          "#else",
          "  vec3 hullNormal = normal;",
          "#endif",
          "vec2 hullDirection = (projectionMatrix * modelViewMatrix * vec4(hullNormal, 0.0)).xy;",
          "gl_Position.xy += hullDirection / max(length(hullDirection), 1e-4) * outlinePush * gl_Position.w;"
        ].join("\n")
      )
  }
  material.customProgramCacheKey = () => "toon-outline"
  return material
}

/**
 * Adds an outline beside each mesh under `object` (sharing its skeleton),
 * and returns their materials (its own, to fade or free with the copy).
 */
export const addOutlines = (object: Object3D): ReadonlyArray<MeshBasicMaterial> => {
  const meshes: Array<Mesh> = []
  object.traverse((part) => {
    if (part instanceof Mesh && !part.name.endsWith(" outline")) meshes.push(part)
  })
  const materials: Array<MeshBasicMaterial> = []
  for (const mesh of meshes) {
    const parent = mesh.parent
    if (parent === null) continue
    let hull = hulls.get(mesh.geometry)
    if (hull === undefined) {
      hull = outlineGeometry(mesh.geometry)
      hulls.set(mesh.geometry, hull)
    }
    const material = outlineMaterial()
    const outline = mesh instanceof SkinnedMesh ? new SkinnedMesh(hull, material) : new Mesh(hull, material)
    if (mesh instanceof SkinnedMesh && outline instanceof SkinnedMesh) outline.bind(mesh.skeleton, mesh.bindMatrix)
    outline.name = `${mesh.name} outline`
    outline.position.copy(mesh.position)
    outline.quaternion.copy(mesh.quaternion)
    outline.scale.copy(mesh.scale)
    outline.frustumCulled = mesh.frustumCulled
    outline.renderOrder = mesh.renderOrder
    const push = material.userData["push"] as { value: Vector2 }
    // Pixels on screen to clip space, for whichever canvas draws it.
    outline.onBeforeRender = (renderer: WebGLRenderer) => {
      renderer.getDrawingBufferSize(drawingBuffer)
      const pixels = toon.outline.pixels * renderer.getPixelRatio()
      push.value.set((2 * pixels) / drawingBuffer.x, (2 * pixels) / drawingBuffer.y)
    }
    parent.add(outline)
    materials.push(material)
  }
  return materials
}
