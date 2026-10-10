import { readFileSync } from "node:fs"
import path from "node:path"

import { AnimationMixer, Box3, LoopOnce } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { describe, expect, it } from "vitest"

import { closeLoop, models } from "../src/presentation/models.ts"
import { Puppet } from "../src/presentation/puppet.ts"

const spec = models.waterCrescent
const load = async () => {
  const bytes = readFileSync(path.join(import.meta.dirname, "..", spec.url))
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")
}

describe("Crescent Water Spirit animation", () => {
  it("preserves the approved rest geometry and exports the complete spirit vocabulary", async () => {
    const gltf = await load()
    expect(gltf.animations.map(c => c.name).sort()).toEqual(Object.keys(spec.clips).sort())
    expect(gltf.animations).toHaveLength(10)
    const bounds = new Box3().setFromObject(gltf.scene, true)
    expect(bounds.min.y).toBeCloseTo(0, 6)
    expect(bounds.max.y).toBeCloseTo(.6, 6)
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(.69580606, 6)
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(.29759698, 6)
    const body = gltf.scene.getObjectByName("WaterCore")!
    for (const name of ["EyeL", "EyeR", "ShellMain", "ShellRight", "FinUpper", "FinTail", "FinLower"]) {
      expect(gltf.scene.getObjectByName(name)?.parent).toBe(body)
    }
    for (const clip of gltf.animations) {
      expect(clip.duration, clip.name).toBeCloseTo(spec.clips[clip.name as keyof typeof spec.clips].lastKeySeconds, 6)
    }
  })

  it("keeps every part above the floor, closes loops, and returns strikes to their starting spot", async () => {
    const gltf = await load()
    const mixer = new AnimationMixer(gltf.scene)
    const body = gltf.scene.getObjectByName("WaterCore")!
    const rest = body.position.clone()
    for (const clip of gltf.animations) {
      mixer.stopAllAction()
      const timing = spec.clips[clip.name as keyof typeof spec.clips]
      const closed = closeLoop(clip, timing)
      mixer.clipAction(closed).setLoop(LoopOnce, 1).play().clampWhenFinished = true
      for (let frame = 0; frame <= Math.round(closed.duration * 60); frame++) {
        mixer.setTime(frame / 60)
        expect(new Box3().setFromObject(gltf.scene, true).min.y, `${clip.name} floor at ${frame}`).toBeGreaterThan(-.0002)
        expect(body.position.x, `${clip.name} lateral travel`).toBeCloseTo(rest.x, 6)
        if (timing.loopSeconds !== null || frame === 0 || frame === Math.round(closed.duration * 60)) {
          expect(body.position.z, `${clip.name} root travel`).toBeCloseTo(rest.z, 6)
        } else {
          expect(Math.abs(body.position.z - rest.z)).toBeLessThan(.065)
        }
      }
      if (timing.loopSeconds !== null) {
        const end = body.children.concat(body).map(o => ({ object: o, position: o.position.clone(), rotation: o.quaternion.clone(), scale: o.scale.clone() }))
        mixer.setTime(0)
        for (const pose of end) {
          expect(pose.object.position.distanceTo(pose.position)).toBeLessThan(1e-6)
          expect(pose.object.quaternion.clone().normalize().angleTo(pose.rotation.clone().normalize())).toBeLessThan(.001)
          expect(pose.object.scale.distanceTo(pose.scale)).toBeLessThan(1e-6)
        }
      }
    }
  })

  it("restores open eyes and held glide stretch after a blink, with immediate skill lift", async () => {
    const gltf = await load()
    const mixer = new AnimationMixer(gltf.scene)
    const body = gltf.scene.getObjectByName("WaterCore")!
    const height = body.position.y
    mixer.clipAction(closeLoop(gltf.animations.find(c => c.name === "Idle")!, spec.clips.Idle)).play()
    mixer.setTime(42 / 30)
    for (const name of ["EyeL", "EyeR"]) expect(gltf.scene.getObjectByName(name)!.scale.y).toBeCloseTo(.08, 5)
    mixer.stopAllAction()
    mixer.clipAction(gltf.animations.find(c => c.name === "Run")!).play()
    mixer.setTime(4 / 30)
    expect(body.scale.x).toBeCloseTo(.99, 5)
    expect(body.scale.y).toBeCloseTo(1.012, 5)
    expect(body.scale.z).toBeCloseTo(1.055, 5)
    for (const name of ["EyeL", "EyeR"]) expect(gltf.scene.getObjectByName(name)!.scale.y).toBeCloseTo(1, 5)
    for (const [name, lift] of [["Cast", .08], ["Ultimate", .18]] as const) {
      mixer.stopAllAction()
      mixer.clipAction(gltf.animations.find(c => c.name === name)!).play()
      mixer.setTime(2 / 30)
      expect(body.position.y - height, name).toBeGreaterThan(lift)
    }
  })

  it("reaches all exported contact transforms through Puppet and freezes during hit-stop", async () => {
    const contacts = [["AttackA", 4 / 30], ["AttackB", 4 / 30], ["AttackC", 6 / 30], ["Power", 6 / 30]] as const
    const pairs = await Promise.all(contacts.map(() => Promise.all([load(), load()])))
    for (const [index, [name, contact]] of contacts.entries()) {
      const [target, gltf] = pairs[index]!
      const mixer = new AnimationMixer(target.scene)
      mixer.clipAction(target.animations.find(c => c.name === name)!).play()
      mixer.setTime(contact)
      const clips = new Map(gltf.animations.map(c => [c.name, closeLoop(c, spec.clips[c.name as keyof typeof spec.clips])]))
      const puppet = new Puppet({ id: "waterCrescent", spec, scene: gltf.scene, clips }, .6,
        { idle: "Idle", run: { clip: "Run", distance: 120 } }, ["Eye.L", "Eye.R"])
      puppet.animate({ x: 0, y: 0 }, { x: 0, y: 1 }, 0, false)
      puppet.play({ clip: name, contact }, .3, .04)
      puppet.animate({ x: 0, y: 0 }, { x: 0, y: 1 }, .04, false)
      target.scene.traverse(expected => {
        if (expected === target.scene) return
        const actual = puppet.object.getObjectByName(expected.name)!
        expect(actual.position.distanceTo(expected.position), `${name}/${expected.name}`).toBeLessThan(1e-6)
        expect(actual.quaternion.clone().normalize().angleTo(expected.quaternion.clone().normalize()), `${name}/${expected.name}`).toBeLessThan(.001)
        expect(actual.scale.distanceTo(expected.scale), `${name}/${expected.name}`).toBeLessThan(1e-6)
      })
      const body = puppet.object.getObjectByName("WaterCore")!
      const frozen = body.position.clone()
      puppet.animate({ x: 0, y: 0 }, { x: 0, y: 1 }, 0, false)
      expect(body.position.distanceTo(frozen)).toBeLessThan(1e-6)
      puppet.dispose()
    }
  })
})
