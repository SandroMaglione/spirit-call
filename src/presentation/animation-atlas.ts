/** Bake GLB skeletons once at load. Crowds then sample poses on the GPU. */
import { AnimationMixer, DataTexture, FloatType, LoopOnce, Matrix4, MeshLambertMaterial, NearestFilter, RGBAFormat, SkinnedMesh } from "three"
import type { BufferGeometry } from "three"
import type { ModelSource } from "./models.ts"

export interface BakedClip {
  readonly offset: number
  readonly frames: number
  readonly seconds: number
  readonly loop: boolean
}

export interface AnimationAtlas {
  readonly geometry: BufferGeometry
  readonly material: MeshLambertMaterial
  readonly texture: DataTexture
  readonly clips: ReadonlyMap<string, BakedClip>
  dispose(): void
}

/** Clamps one-shots and wraps loops, including negative locomotion phases. */
export const atlasFrame = (clip: BakedClip, seconds: number): readonly [number, number, number] => {
  const time = clip.loop ? ((seconds % clip.seconds) + clip.seconds) % clip.seconds : Math.max(0, Math.min(clip.seconds, seconds))
  const frame = time / clip.seconds * (clip.frames - 1)
  const first = Math.floor(frame)
  return [clip.offset + first, clip.offset + Math.min(first + 1, clip.frames - 1), frame - first]
}

export const bakeAnimation = (source: ModelSource): AnimationAtlas => {
  const meshes: Array<SkinnedMesh> = []
  source.scene.traverse((node) => { if (node instanceof SkinnedMesh) meshes.push(node) })
  const mesh = meshes[0]
  if (mesh === undefined || meshes.length !== 1 || Array.isArray(mesh.material)) throw new Error(`${source.id}: animated batches need one skinned mesh and one material`)
  const clips = new Map<string, BakedClip>()
  let rows = 0
  for (const [name, clip] of source.clips) {
    const frames = Math.ceil(clip.duration * 30) + 1
    clips.set(name, { offset: rows, frames, seconds: clip.duration, loop: source.spec.clips[name]?.loopSeconds !== null })
    rows += frames
  }
  const bones = mesh.skeleton.bones.length
  const shield = mesh.skeleton.bones.findIndex((bone) => bone.name === "shield")
  const pixels = new Float32Array(rows * bones * 16)
  const mixer = new AnimationMixer(source.scene)
  const boneMatrix = new Matrix4()
  const placement = new Matrix4()
  for (const [name, clip] of source.clips) {
    mixer.stopAllAction()
    const action = mixer.clipAction(clip).reset().setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    const info = clips.get(name)!
    for (let frame = 0; frame < info.frames; frame++) {
      mixer.setTime(frame / (info.frames - 1) * info.seconds)
      source.scene.updateMatrixWorld(true)
      mesh.skeleton.update()
      placement.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
      for (let bone = 0; bone < bones; bone++) {
        boneMatrix.fromArray(mesh.skeleton.boneMatrices!, bone * 16)
        boneMatrix.premultiply(placement).multiply(mesh.bindMatrix)
        boneMatrix.toArray(pixels, ((info.offset + frame) * bones + bone) * 16)
      }
    }
  }
  mixer.stopAllAction()
  mixer.uncacheRoot(source.scene)
  const texture = new DataTexture(pixels, bones * 4, rows, RGBAFormat, FloatType)
  texture.minFilter = texture.magFilter = NearestFilter
  texture.needsUpdate = true
  const geometry = mesh.geometry.clone()
  const material = new MeshLambertMaterial({ vertexColors: true })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.enemyPoses = { value: texture }
    shader.vertexShader = `
      uniform sampler2D enemyPoses;
      attribute vec4 instancePose;
      attribute vec4 instancePoseBlend;
      attribute vec4 skinIndex;
      attribute vec4 skinWeight;
      mat4 enemyBone(float bone, float frame) {
        float y = (frame + 0.5) / ${rows.toFixed(1)};
        float x = bone * 4.0;
        return mat4(
          texture2D(enemyPoses, vec2((x + 0.5) / ${(bones * 4).toFixed(1)}, y)),
          texture2D(enemyPoses, vec2((x + 1.5) / ${(bones * 4).toFixed(1)}, y)),
          texture2D(enemyPoses, vec2((x + 2.5) / ${(bones * 4).toFixed(1)}, y)),
          texture2D(enemyPoses, vec2((x + 3.5) / ${(bones * 4).toFixed(1)}, y)));
      }
      mat4 enemySkin(float frame) {
        mat4 m = enemyBone(skinIndex.x, frame) * skinWeight.x;
        if (skinWeight.y > 0.0) m += enemyBone(skinIndex.y, frame) * skinWeight.y;
        if (skinWeight.z > 0.0) m += enemyBone(skinIndex.z, frame) * skinWeight.z;
        if (skinWeight.w > 0.0) m += enemyBone(skinIndex.w, frame) * skinWeight.w;
        return m;
      }
    ` + shader.vertexShader
    shader.vertexShader = shader.vertexShader
      .replace("#include <beginnormal_vertex>", `
        mat4 enemyTransform = enemySkin(instancePose.x) * (1.0 - instancePose.z) + enemySkin(instancePose.y) * instancePose.z;
        if (instancePoseBlend.w < 1.0) {
          mat4 outgoing = enemySkin(instancePoseBlend.x) * (1.0 - instancePoseBlend.z) + enemySkin(instancePoseBlend.y) * instancePoseBlend.z;
          enemyTransform = outgoing * (1.0 - instancePoseBlend.w) + enemyTransform * instancePoseBlend.w;
        }
        ${shield < 0 ? "" : `if (skinIndex.x == ${shield.toFixed(1)}) {
          float c = cos(instancePose.w), s = sin(instancePose.w);
          enemyTransform = mat4(c,0.0,-s,0.0, 0.0,1.0,0.0,0.0, s,0.0,c,0.0, 0.0,0.0,0.0,1.0) * enemyTransform;
        }`}
        vec3 objectNormal = mat3(enemyTransform) * normal;
      `)
      .replace("#include <begin_vertex>", "vec3 transformed = (enemyTransform * vec4(position, 1.0)).xyz;")
  }
  material.customProgramCacheKey = () => `enemy-atlas-blend-${bones}-${rows}-${shield}`
  return { geometry, material, texture, clips, dispose() { geometry.dispose(); material.dispose(); texture.dispose() } }
}
