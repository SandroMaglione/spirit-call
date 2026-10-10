import { readFileSync } from "node:fs"
import path from "node:path"

import { AnimationMixer, Box3, LoopOnce, MeshBasicMaterial, Vector3 } from "three"
import type { Mesh } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { describe, expect, it } from "vitest"

import { closeLoop, models } from "../src/presentation/models.ts"
import type { ModelId } from "../src/presentation/models.ts"
import { characterLooks } from "../src/presentation/looks.ts"
import { Puppet } from "../src/presentation/puppet.ts"
import { addGlow } from "../src/presentation/glow.ts"

const loadSpirit = async (id: "waterSpirit" | "fireSpirit" | "thunderSpirit" | "rockSpirit" | "hearthSpirit" | "quarrySpirit") => {
  const bytes = readFileSync(path.join(import.meta.dirname, "..", models[id].url))
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")
}

describe("Hearth spirit export", () => {
  it("uses the measured ground-origin height alongside Water and Fire, excluding glow", async () => {
    const ids = ["hearthSpirit", "waterSpirit", "fireSpirit"] as const
    const loaded = await Promise.all(ids.map(loadSpirit))
    const boxes = loaded.map((gltf, index) => {
      const id = ids[index]!
      const puppet = new Puppet({ id, spec: models[id], scene: gltf.scene, clips: new Map() }, 1, null)
      const box = new Box3().setFromObject(puppet.object, true)
      puppet.dispose()
      return box
    })
    expect(boxes[0]!.max.y).toBeCloseTo(boxes[1]!.max.y, 3)
    // Fire's existing flame exceeds its registered rest height; do not inherit that extra scale.
    expect(boxes[0]!.max.y).toBeLessThan(boxes[2]!.max.y)
    expect(boxes[0]!.max.y / boxes[2]!.max.y).toBeGreaterThan(.8)
    expect(boxes[0]!.min.y).toBeGreaterThan(.08)
    expect(boxes[0]!.getSize(new Vector3()).x).toBeLessThan(boxes[1]!.getSize(new Vector3()).x * 1.3)
  })

  it("keeps the eye glows attached during clips and preserves the unlit flame", async () => {
    const gltf = await loadSpirit("hearthSpirit")
    const spec = models.hearthSpirit
    addGlow(gltf.scene, spec.glow, spec.height)
    const look = characterLooks.hearth
    if (look.kind !== "model") throw new Error("Hearth must use her spirit")
    const clips = new Map(gltf.animations.map(clip => [clip.name, closeLoop(clip, spec.clips[clip.name as keyof typeof spec.clips])]))
    const puppet = new Puppet({ id: "hearthSpirit", spec, scene: gltf.scene, clips }, 1, look.moments!)
    const body = puppet.object.getObjectByName("HearthBody")!
    const eye = puppet.object.getObjectByName("EyeL")!
    const restEye = eye.position.clone()
    expect(eye.parent).toBe(body)
    expect(eye.children.some(child => child.userData["glow"] === true)).toBe(true)
    const flame = puppet.object.getObjectByName("FlameCore")! as Mesh
    expect(flame.material).toBeInstanceOf(MeshBasicMaterial)
    const mixer = new AnimationMixer(puppet.object)
    for (const clip of clips.values()) {
      mixer.stopAllAction()
      mixer.clipAction(clip).setLoop(LoopOnce, 1).play()
      for (const fraction of [0, .25, .5, .75, 1]) {
        mixer.setTime(clip.duration * fraction)
        expect(body.position.x, clip.name).toBeCloseTo(0, 6)
        expect(body.position.z, clip.name).toBeCloseTo(0, 6)
        expect(body.scale.toArray(), clip.name).toEqual([1, 1, 1])
        expect(eye.position.distanceTo(restEye), clip.name).toBeLessThan(1e-6)
      }
    }
    mixer.stopAllAction()
    puppet.dispose()
  })

  it("reaches the exported heavy contact through Puppet after moving", async () => {
    const [actual, expected] = await Promise.all([loadSpirit("hearthSpirit"), loadSpirit("hearthSpirit")])
    const spec = models.hearthSpirit
    const look = characterLooks.hearth
    if (look.kind !== "model") throw new Error("Hearth must use her spirit")
    const clips = new Map(actual.animations.map(clip => [clip.name, closeLoop(clip, spec.clips[clip.name as keyof typeof spec.clips])]))
    const puppet = new Puppet({ id: "hearthSpirit", spec, scene: actual.scene, clips }, 1, look.moments!)
    puppet.animate({ x: 0, y: 0 }, { x: 1, y: 0 }, .1, false)
    puppet.animate({ x: 60, y: 0 }, { x: 1, y: 0 }, .2, false)
    puppet.play(look.moments!.attack![2]!, .75, .2)
    puppet.animate({ x: 60, y: 0 }, { x: 1, y: 0 }, .2, false)
    const mixer = new AnimationMixer(expected.scene)
    mixer.clipAction(expected.animations.find(clip => clip.name === "AttackC")!).play()
    mixer.setTime(6 / 30)
    for (const name of ["HearthBody", "FlameCore", "SupportL", "SupportR"]) {
      const posed = puppet.object.getObjectByName(name)!
      const target = expected.scene.getObjectByName(name)!
      expect(posed.quaternion.angleTo(target.quaternion), name).toBeLessThan(.001)
      expect(posed.position.distanceTo(target.position), name).toBeLessThan(1e-6)
      expect(posed.scale.distanceTo(target.scale), name).toBeLessThan(1e-6)
    }
    mixer.stopAllAction()
    puppet.dispose()
  })
})

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

describe("Quarry's approved spirit", () => {
  it("loads its own untinted model at the existing spirits' requested height", async () => {
    const look = characterLooks.quarry
    if (look.kind !== "model") throw new Error("Quarry needs her approved model")
    expect(look.model).toBe("quarrySpirit")
    expect(look.tint).toBeUndefined()
    expect(look.grounded).toBe(true)
    const ids = ["quarrySpirit", "waterSpirit", "fireSpirit"] as const
    const gltfs = await Promise.all(ids.map(loadSpirit))
    const sizes = gltfs.map((gltf, index) => {
      const id = ids[index]!
      const puppet = new Puppet({ id, spec: models[id], scene: gltf.scene, clips: new Map() }, 1, null)
      const box = new Box3().setFromObject(puppet.object, true)
      puppet.dispose()
      return box
    })
    expect(sizes[0]!.getSize(new Vector3()).y).toBeCloseTo(1, 5)
    // Water floats above the pivot; compare their tops from the common ground line.
    expect(sizes[0]!.max.y).toBeCloseTo(sizes[1]!.max.y, 3)
    // Her four legs widen the silhouette; the central boulder stays near Water's body width.
    const core = new Box3().setFromObject(gltfs[0]!.scene.getObjectByName("BodyCore")!, true).getSize(new Vector3()).x / models.quarrySpirit.height
    const water = new Box3().setFromObject(gltfs[1]!.scene.getObjectByName("WaterSpirit")!, true).getSize(new Vector3()).x / models.waterSpirit.height
    expect(core).toBeLessThan(water * 1.5)
    expect(sizes[0]!.max.y).toBeLessThan(sizes[2]!.max.y)
  })

  it("keeps two supports through the run seam and launches the head-first heavy blow", async () => {
    const spec = models.quarrySpirit
    const gltf = await loadSpirit("quarrySpirit")
    const mixer = new AnimationMixer(gltf.scene)
    const feet = ["StoneFrontL", "StoneFrontR", "StoneRearL", "StoneRearR"].map(name => gltf.scene.getObjectByName(name)!)
    for (const name of ["JointFrontL", "JointFrontR", "JointRearL", "JointRearR"]) expect(gltf.scene.getObjectByName(name), name).toBeDefined()
    for (const clip of gltf.animations) expect(clip.tracks.some(track => track.name.startsWith("Quarry.")), `${clip.name}: root motion`).toBe(false)
    const run = closeLoop(gltf.animations.find(clip => clip.name === "Run")!, spec.clips.Run)
    mixer.clipAction(run).play()
    for (let frame = 0; frame <= 192; frame++) {
      mixer.setTime(frame / 240)
      const soles = feet.map(foot => new Box3().setFromObject(foot, true).min.y)
      expect(soles.filter(y => Math.abs(y) < .001).length, `supports at ${frame}/240`).toBeGreaterThanOrEqual(2)
      expect(Math.min(...soles)).toBeGreaterThan(-.001)
    }
    mixer.stopAllAction()
    mixer.clipAction(gltf.animations.find(clip => clip.name === "Power")!).setLoop(LoopOnce, 1).play()
    mixer.setTime(6 / 30)
    expect(Math.min(...feet.map(foot => new Box3().setFromObject(foot, true).min.y))).toBeGreaterThan(.1)
    expect(gltf.scene.getObjectByName("Torso")!.position.z).toBeGreaterThan(.2)
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
