import { readFileSync } from "node:fs"
import path from "node:path"

import { AnimationMixer, Box3, LoopOnce } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { describe, expect, it } from "vitest"

import { closeLoop, models } from "../src/presentation/models.ts"
import { Puppet } from "../src/presentation/puppet.ts"

const spec = models.iceSpirit
const load = async () => {
  const bytes = readFileSync(path.join(import.meta.dirname, "..", spec.url))
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")
}

describe("Ice Spirit game animation", () => {
  it("exports the full spirit clip vocabulary at the accepted rest scale", async () => {
    const gltf = await load()
    expect(gltf.animations.map(c => c.name).sort()).toEqual(Object.keys(spec.clips).sort())
    expect(gltf.animations).toHaveLength(10)
    const bounds = new Box3().setFromObject(gltf.scene, true)
    expect(bounds.min.y).toBeCloseTo(0, 6)
    expect(bounds.max.y).toBeCloseTo(.8, 6)
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(.55, 6)
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(.35, 6)
    const body = gltf.scene.getObjectByName("IceSpirit")!
    for (const name of ["Crown", "EyeL", "EyeR", "ShardUpperL", "ShardUpperR", "ShardLowerL", "ShardLowerR"]) {
      expect(gltf.scene.getObjectByName(name)?.parent).toBe(body)
    }
    for (const clip of gltf.animations) {
      expect(clip.duration, clip.name).toBeCloseTo(spec.clips[clip.name as keyof typeof spec.clips].lastKeySeconds, 6)
    }
  })

  it("keeps the tip above the floor and closes loops without horizontal travel", async () => {
    const gltf = await load()
    const mixer = new AnimationMixer(gltf.scene)
    const body = gltf.scene.getObjectByName("IceSpirit")!
    for (const clip of gltf.animations) {
      const timing = spec.clips[clip.name as keyof typeof spec.clips]
      mixer.stopAllAction()
      const closed = closeLoop(clip, timing)
      mixer.clipAction(closed).setLoop(LoopOnce, 1).play().clampWhenFinished = true
      for (let frame = 0; frame <= Math.round(closed.duration * 30); frame++) {
        mixer.setTime(frame / 30)
        const bounds = new Box3().setFromObject(gltf.scene, true)
        expect(bounds.min.y, `${clip.name} floor at ${frame}`).toBeGreaterThan(-.0001)
        expect(body.position.x, `${clip.name} lateral drift`).toBeCloseTo(0, 6)
        if (timing.loopSeconds !== null || frame === 0 || frame === Math.round(closed.duration * 30)) {
          expect(body.position.z, `${clip.name} forward drift at ${frame}`).toBeCloseTo(0, 6)
        } else {
          expect(Math.abs(body.position.z)).toBeLessThan(.06)
        }
      }
      if (timing.loopSeconds !== null) {
        const end = { position: body.position.clone(), rotation: body.quaternion.clone(), scale: body.scale.clone() }
        mixer.setTime(0)
        expect(body.position.distanceTo(end.position)).toBeLessThan(1e-6)
        expect(body.quaternion.clone().normalize().angleTo(end.rotation.clone().normalize())).toBeLessThan(1e-6)
        expect(body.scale.distanceTo(end.scale)).toBeLessThan(1e-6)
      }
    }
  })

  it("blinks both eyes and releases skills immediately", async () => {
    const gltf = await load()
    const mixer = new AnimationMixer(gltf.scene)
    mixer.clipAction(closeLoop(gltf.animations.find(c => c.name === "Idle")!, spec.clips.Idle)).play()
    mixer.setTime(42 / 30)
    for (const name of ["EyeL", "EyeR"]) expect(gltf.scene.getObjectByName(name)!.scale.y).toBeCloseTo(.08, 5)
    const body = gltf.scene.getObjectByName("IceSpirit")!
    mixer.stopAllAction()
    mixer.clipAction(gltf.animations.find(c => c.name === "Run")!).play()
    mixer.setTime(4 / 30)
    expect(body.scale.x).toBeCloseTo(.988, 5)
    expect(body.scale.y).toBeCloseTo(1.012, 5)
    expect(body.scale.z).toBeCloseTo(1.045, 5)
    for (const name of ["EyeL", "EyeR"]) expect(gltf.scene.getObjectByName(name)!.scale.y).toBeCloseTo(1, 5)
    for (const [name, lift] of [["Cast", .08], ["Ultimate", .18]] as const) {
      mixer.stopAllAction()
      mixer.clipAction(gltf.animations.find(c => c.name === name)!).play()
      mixer.setTime(2 / 30)
      expect(body.position.y - .45, name).toBeGreaterThan(lift)
    }
  })

  it("reaches the exported attack pose at simulation contact through Puppet", async () => {
    const contacts = [["AttackA", 4 / 30], ["AttackB", 4 / 30], ["AttackC", 6 / 30], ["Power", 6 / 30]] as const
    const pairs = await Promise.all(contacts.map(() => Promise.all([load(), load()])))
    for (const [index, [name, contact]] of contacts.entries()) {
      const [target, gltf] = pairs[index]!
      const mixer = new AnimationMixer(target.scene)
      mixer.clipAction(target.animations.find(c => c.name === name)!).play()
      mixer.setTime(contact)
      const expected = target.scene.getObjectByName("IceSpirit")!
      const clips = new Map(gltf.animations.map(c => [c.name, closeLoop(c, spec.clips[c.name as keyof typeof spec.clips])]))
      const puppet = new Puppet({ id: "iceSpirit", spec, scene: gltf.scene, clips }, .8,
        { idle: "Idle", run: { clip: "Run", distance: 120 } }, ["Eye.L", "Eye.R"])
      puppet.animate({ x: 0, y: 0 }, { x: 0, y: 1 }, 0, false)
      puppet.play({ clip: name, contact }, .3, .04)
      puppet.animate({ x: 0, y: 0 }, { x: 0, y: 1 }, .04, false)
      const actual = puppet.object.getObjectByName("IceSpirit")!
      expect(actual.position.distanceTo(expected.position), name).toBeLessThan(1e-6)
      expect(actual.quaternion.clone().normalize().angleTo(expected.quaternion.clone().normalize()), name).toBeLessThan(.001)
      expect(actual.scale.distanceTo(expected.scale), name).toBeLessThan(1e-6)
      const frozen = actual.position.clone()
      puppet.animate({ x: 0, y: 0 }, { x: 0, y: 1 }, 0, false)
      expect(actual.position.distanceTo(frozen)).toBeLessThan(1e-6)
      puppet.dispose()
    }
  })
})
