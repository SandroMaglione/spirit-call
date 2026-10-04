import { readFileSync } from "node:fs"
import path from "node:path"

import { AnimationMixer, LoopOnce } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { describe, expect, it } from "vitest"

import { closeLoop, models } from "../src/presentation/models.ts"

describe("thunder spirit export", () => {
  it("blinks both eyes with their rims, animates its halo, and keeps locomotion off the floor axes", async () => {
    const spec = models.thunderSpirit
    const bytes = readFileSync(path.join(import.meta.dirname, "..", spec.url))
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")
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
      const root = clip.tracks.find((track) => track.name === "ThunderSpirit.position")!
      expect(root, clip.name).toBeDefined()
      for (let key = 0; key < root.times.length; key++) {
        expect(root.values[key * 3], `${clip.name}: X`).toBeCloseTo(0, 9)
        expect(root.values[key * 3 + 2], `${clip.name}: Z`).toBeCloseTo(0, 9)
      }
    }
    expect(gltf.scene.getObjectByName("LightningCrest")).toBeDefined()
    expect(gltf.scene.getObjectByName("LightningWingL")).toBeDefined()
    expect(gltf.scene.getObjectByName("LightningWingR")).toBeDefined()
  })
})
