import { readFileSync } from "node:fs"
import path from "node:path"
import { AnimationMixer, LoopOnce, Matrix4, SkinnedMesh, Vector3 } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { describe, expect, it } from "vitest"
import { enemyModels } from "../src/presentation/assets/enemies.ts"
import { bakeAnimation } from "../src/presentation/animation-atlas.ts"
import { closeLoop } from "../src/presentation/models.ts"
import type { ModelId, ModelSpec } from "../src/presentation/models.ts"

describe("exported enemy animation atlases", () => {
  const readableIdles = ["enemySniper", "enemyGuardian", "enemyCharger", "enemyStalker", "enemyJuggernaut"] as const
  it.each(readableIdles)("%s Idle visibly moves at a 40 px model height", async (id) => {
    const spec = enemyModels[id]
    const bytes = readFileSync(path.join(import.meta.dirname, "..", spec.url))
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")
    const clip = closeLoop(gltf.animations.find((clip) => clip.name === "Idle")!, spec.clips.Idle)
    let mesh: SkinnedMesh | undefined
    gltf.scene.traverse((node) => { if (node instanceof SkinnedMesh) mesh = node })
    if (mesh === undefined) throw new Error("Missing skinned mesh")
    const mixer = new AnimationMixer(gltf.scene)
    mixer.clipAction(clip).setLoop(LoopOnce, 1).play()
    const positions = mesh.geometry.getAttribute("position")
    const sample = (seconds: number) => {
      mixer.setTime(seconds)
      gltf.scene.updateMatrixWorld(true)
      mesh!.skeleton.update()
      return Array.from({ length: positions.count }, (_, vertex) =>
        mesh!.applyBoneTransform(vertex, new Vector3().fromBufferAttribute(positions, vertex)).applyMatrix4(mesh!.matrixWorld))
    }
    const start = sample(0)
    const poses = Array.from({ length: 8 }, (_, frame) => sample((frame + 1) / 9 * clip.duration))
    // Project from the game's 30-degree camera, in two perpendicular facings.
    // Check a broad part of the model, so a moving decorative tip cannot hide
    // a frozen body. The previous clips moved less than one pixel even enlarged.
    for (const yaw of [0, Math.PI / 2]) {
      const movement = start.map((point, vertex) => Math.max(...poses.map((pose) => {
        const delta = pose[vertex]!.clone().sub(point).applyAxisAngle(new Vector3(0, 1, 0), yaw)
        const x = (delta.x - delta.z) * Math.SQRT1_2
        const y = delta.y * Math.sqrt(.75) - (delta.x + delta.z) * Math.SQRT1_2 * .5
        return Math.hypot(x, y) * 40 / spec.height
      }))).sort((a, b) => a - b)
      expect(movement[Math.floor(movement.length * .9)], `${id} silhouette motion`).toBeGreaterThan(1.2)
      expect(movement.reduce((sum, value) => sum + value, 0) / movement.length, `${id} body motion`).toBeGreaterThan(.4)
    }
  })
  it.each(Object.entries(enemyModels))("%s matches Three.js skinning at baked frames", async (id, spec: ModelSpec) => {
    const bytes = readFileSync(path.join(import.meta.dirname, "..", spec.url))
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")
    const clips = new Map(gltf.animations.map((clip) => [clip.name, closeLoop(clip, spec.clips[clip.name]!)]))
    const atlas = bakeAnimation({ id: id as ModelId, spec, clips, scene: gltf.scene })
    let mesh: SkinnedMesh | undefined
    gltf.scene.traverse((node) => { if (node instanceof SkinnedMesh) mesh = node })
    if (mesh === undefined) throw new Error("Missing skinned mesh")
    const positions = mesh.geometry.getAttribute("position")
    expect(mesh.geometry.index!.count / 3).toBeLessThan(2000)
    expect(mesh.skeleton.bones.length).toBeLessThanOrEqual(12)
    const glow = mesh.geometry.getAttribute("_glow")
    expect(glow.count).toBe(positions.count)
    const mask = Array.from({ length: glow.count }, (_, i) => glow.getX(i))
    expect(mask.every((amount) => Number.isFinite(amount) && amount >= 0 && amount <= 1)).toBe(true)
    expect(mask.some((amount) => amount === 0)).toBe(true)
    if (["enemyDummy", "enemySparringDummy", "enemyHeavyDummy", "enemySwarmer"].includes(id)) expect(mask.every((amount) => amount === 0)).toBe(true)
    else expect(mask.some((amount) => amount === 1)).toBe(true)
    const indices = mesh.geometry.getAttribute("skinIndex")
    const weights = mesh.geometry.getAttribute("skinWeight")
    const mixer = new AnimationMixer(gltf.scene)
    const boneCount = mesh.skeleton.bones.length
    const pixels = atlas.texture.image.data as Float32Array
    const matrix = new Matrix4()
    for (const [name, clip] of clips) {
      mixer.stopAllAction()
      const action = mixer.clipAction(clip).reset().setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
      action.play()
      const baked = atlas.clips.get(name)!
      for (const frame of [0, Math.floor((baked.frames - 1) * .53), baked.frames - 1]) {
        mixer.setTime(frame / (baked.frames - 1) * baked.seconds)
        gltf.scene.updateMatrixWorld(true)
        mesh.skeleton.update()
        for (let vertex = 0; vertex < positions.count; vertex += 17) {
          const expected = mesh.applyBoneTransform(vertex, new Vector3().fromBufferAttribute(positions, vertex)).applyMatrix4(mesh.matrixWorld)
          const actual = new Vector3()
          for (let influence = 0; influence < 4; influence++) {
            const weight = weights.getComponent(vertex, influence)
            if (weight === 0) continue
            const bone = indices.getComponent(vertex, influence)
            matrix.fromArray(pixels, ((baked.offset + frame) * boneCount + bone) * 16)
            actual.addScaledVector(new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(matrix), weight)
          }
          expect(actual.distanceTo(expected), `${id}/${name}/${frame}/${vertex}`).toBeLessThan(.00001)
        }
      }
    }
    atlas.dispose()
  })
})
