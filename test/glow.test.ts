import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Sprite } from "three"
import { describe, expect, it } from "vitest"

import { addGlow } from "../src/presentation/glow.ts"
import type { GlowSpec } from "../src/presentation/glow.ts"
import { copyModel } from "../src/presentation/puppet.ts"

const glow: GlowSpec = {
  rim: { color: 0x8eebff, strength: 1, power: 2 },
  halo: { color: 0x2e7bff, opacity: 0.3, size: 1.5 },
  eyes: { nodes: ["Eye.L"], color: 0xffffff, opacity: 0.5, size: 0.3 }
}

describe("glow", () => {
  it("rims the body (not the glowing eyes), haloes it, and haloes the eyes on their own nodes", () => {
    const scene = new Group()
    const body = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    const eye = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 4 }))
    eye.name = "Eye.L"
    body.add(eye)
    scene.add(body)
    addGlow(scene, glow, 1)
    expect(body.material.userData["rim"]).toBeDefined()
    expect(eye.material.userData["rim"]).toBeUndefined()
    expect(scene.children.some((child) => child instanceof Sprite)).toBe(true)
    expect(eye.children.some((child) => child instanceof Sprite)).toBe(true)
  })

  it("keeps the rim on a copy's own materials (cloning drops shader changes)", () => {
    const scene = new Group()
    scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
    addGlow(scene, glow, 1)
    const copy = copyModel({ id: "waterSpirit", scene, clips: new Map(), spec: { url: "", height: 1, clips: {} } }, true)
    const material = copy.materials[0]!.material
    expect(material).not.toBe((scene.children[0] as Mesh).material)
    expect(material.customProgramCacheKey()).toContain("rim:")
  })
})
