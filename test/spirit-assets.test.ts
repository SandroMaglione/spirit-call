import { readFileSync } from "node:fs"
import path from "node:path"

import { AnimationMixer, Box3, LoopOnce, Vector3 } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { describe, expect, it } from "vitest"

import { closeLoop, models } from "../src/presentation/models.ts"
import type { ModelId } from "../src/presentation/models.ts"
import { Puppet } from "../src/presentation/puppet.ts"

const loadSpirit = async (id: "waterSpirit" | "fireSpirit" | "thunderSpirit" | "rockSpirit") => {
  const bytes = readFileSync(path.join(import.meta.dirname, "..", models[id].url))
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")
}

describe("thunder spirit export", () => {
  it("fits the existing spirits' arena silhouette at the same requested height", async () => {
    const bounds = new Map<ModelId, Box3>()
    const ids = ["waterSpirit", "fireSpirit", "thunderSpirit"] as const
    const loaded = await Promise.all(ids.map(loadSpirit))
    for (const [index, id] of ids.entries()) {
      const gltf = loaded[index]!
      // Raw GLBs exclude runtime glow sprites, which must not affect size measurements.
      const puppet = new Puppet({ id, spec: models[id], scene: gltf.scene, clips: new Map() }, 1, null)
      bounds.set(id, new Box3().setFromObject(puppet.object, true))
      puppet.dispose()
    }
    const water = bounds.get("waterSpirit")!
    const fire = bounds.get("fireSpirit")!
    const thunder = bounds.get("thunderSpirit")!
    expect(thunder.max.y / water.max.y).toBeCloseTo(1, 2)
    expect(thunder.max.y).toBeLessThan(fire.max.y)
    // Thunder's wings can extend beyond Water, but cannot recreate the former oversized footprint.
    const width = (box: Box3) => box.getSize(new Vector3()).x
    expect(width(thunder)).toBeGreaterThan(width(fire))
    expect(width(thunder)).toBeLessThan(width(water) * 1.2)
  })

  it("blinks both eyes with their rims, animates its halo, and never travels on the floor", async () => {
    const spec = models.thunderSpirit
    const gltf = await loadSpirit("thunderSpirit")
    const mixer = new AnimationMixer(gltf.scene)
    const idle = gltf.animations.find((clip) => clip.name === "Idle")!
    mixer.clipAction(closeLoop(idle, spec.clips.Idle)).setLoop(LoopOnce, 1).play()
    mixer.setTime(1.3)
    for (const name of ["EyeL", "EyeR", "RimL", "RimR"]) {
      expect(gltf.scene.getObjectByName(name)?.scale.y, name).toBeCloseTo(0.1, 4)
    }
    const halo = gltf.scene.getObjectByName("Halo")!
    const turned = halo.quaternion.clone()
    mixer.setTime(0)
    expect(halo.quaternion.angleTo(turned)).toBeGreaterThan(0.2)
    for (const clip of gltf.animations) {
      const root = clip.tracks.find((track) => track.name === "ThunderSpirit.position")
      // A clip that never moves it has no track for it (the dash: stretched on the spot).
      if (root === undefined) continue
      // Its loops never leave the spot; a combat clip leans into its blow (well inside its own width) and ends back on it: travel is the simulation's.
      const loop = spec.clips[clip.name as keyof typeof spec.clips].loopSeconds !== null
      const last = root.times.length - 1
      for (let key = 0; key < root.times.length; key++) {
        const still = loop || key === 0 || key === last
        expect(root.values[key * 3], `${clip.name}: X`).toBeCloseTo(0, 9)
        if (still) expect(root.values[key * 3 + 2], `${clip.name}: Z`).toBeCloseTo(0, 9)
        else expect(Math.abs(root.values[key * 3 + 2]!), `${clip.name}: Z`).toBeLessThan(0.15)
      }
    }
    expect(gltf.scene.getObjectByName("LightningCrest")).toBeDefined()
    expect(gltf.scene.getObjectByName("LightningWingL")).toBeDefined()
    expect(gltf.scene.getObjectByName("LightningWingR")).toBeDefined()
  })
})

describe("rock spirit export", () => {
  it("matches Water's full arena height and keeps its broad boulder readable", async () => {
    const gltfs = await Promise.all([loadSpirit("rockSpirit"), loadSpirit("waterSpirit")])
    const ids = ["rockSpirit", "waterSpirit"] as const
    const bounds = gltfs.map((gltf, i) => {
      const puppet = new Puppet({ id: ids[i]!, spec: models[ids[i]!], scene: gltf.scene, clips: new Map() }, 1, null)
      const box = new Box3().setFromObject(puppet.object, true)
      puppet.dispose()
      return box
    })
    expect(bounds[0]!.max.y).toBeCloseTo(bounds[1]!.max.y, 3)
    // The accepted boulder is deliberately wider; ornaments count here too.
    expect(bounds[0]!.getSize(new Vector3()).x).toBeLessThan(bounds[1]!.getSize(new Vector3()).x * 1.5)
    const gltf = gltfs[0]!
    const body = gltf.scene.getObjectByName("RockSpirit")!
    const boulder = new Box3().setFromObject(body.children.find(o => o.name === "RockSpirit_1")!, true).getSize(new Vector3())
    expect(boulder.x / boulder.y).toBeGreaterThan(1.7)
  })

  it("keeps a sole planted while walking, floats only its ornaments, and returns combat clips to the spot", async () => {
    const spec = models.rockSpirit
    const gltf = await loadSpirit("rockSpirit")
    const mixer = new AnimationMixer(gltf.scene)
    const feet = ["FootL", "FootR"].map(name => gltf.scene.getObjectByName(name)!)
    for (const name of ["Idle", "Run"] as const) {
      mixer.stopAllAction()
      mixer.clipAction(closeLoop(gltf.animations.find(c => c.name === name)!, spec.clips[name])).play()
      const min: number[] = []
      for (let key = 0; key < (name === "Idle" ? 60 : 16); key++) {
        mixer.setTime(key / 30)
        gltf.scene.updateMatrixWorld(true)
        const ground = feet.map(foot => new Box3().setFromObject(foot, true).min.y)
        expect(Math.min(...ground), `${name} supporting sole ${key}`).toBeLessThan(.001)
        expect(Math.min(...ground)).toBeGreaterThan(-.001)
        min.push(Math.max(...ground))
      }
      if (name === "Run") expect(Math.max(...min)).toBeGreaterThan(.009)
    }
    for (const clip of gltf.animations) {
      const root = clip.tracks.find(track => track.name === "RockSpirit.position")
      if (root === undefined) continue
      for (const key of [0, root.times.length - 1]) {
        expect(root.values[key * 3]).toBeCloseTo(0, 6)
        expect(root.values[key * 3 + 2]).toBeCloseTo(0, 6)
      }
    }
    expect(gltf.scene.getObjectByName("FaceInset")).toBeUndefined()
    expect(gltf.scene.getObjectByName("RearRock")).toBeDefined()
  })
})
