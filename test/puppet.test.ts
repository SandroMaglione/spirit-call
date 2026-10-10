import { AnimationClip, Bone, Group, NumberKeyframeTrack } from "three"
import { describe, expect, it } from "vitest"

import { Puppet } from "../src/presentation/puppet.ts"

const fixture = () => {
  const scene = new Group()
  const joint = new Bone()
  joint.name = "hand"
  scene.add(joint)
  const clip = (name: string, times: Array<number>, values: Array<number>) =>
    new AnimationClip(name, times[times.length - 1]!, [new NumberKeyframeTrack("hand.position[x]", times, values)])
  const clips = new Map([
    ["Idle", clip("Idle", [0, 1], [0, 0])],
    ["Run", clip("Run", [0, 1], [4, 4])],
    ["Cut", clip("Cut", [0, 0.2, 0.4], [0, 10, 6])],
    ["Hold", clip("Hold", [0, 0.4], [10, 10])],
    ["Recover", clip("Recover", [0, 0.2], [6, 0])]
  ])
  const puppet = new Puppet({ id: "waterSpirit", scene, clips, spec: { url: "", height: 1, clips: {} } }, 1,
    { idle: "Idle", run: { clip: "Run", distance: 100 } })
  let x = 0
  const animate = (seconds: number, travel = 0) => {
    x += travel
    puppet.animate({ x, y: 0 }, { x: 1, y: 0 }, seconds, false)
  }
  const hand = () => puppet.object.getObjectByName("hand")!.position.x
  animate(0)
  return { puppet, animate, hand }
}

describe("puppet transitions", () => {
  it("blends toward a held pose even when Three skips unchanged track writes", () => {
    const { puppet, animate, hand } = fixture()
    puppet.play({ clip: "Hold", contact: 0.2 }, 0.3, 0.04)
    for (let i = 1; i <= 4; i++) {
      animate(0.01)
      expect(hand()).toBeCloseTo(i * 2.5)
    }
    puppet.dispose()
  })
  it("starts a cut from the visible run pose and reaches full contact on time", () => {
    const { puppet, animate, hand } = fixture()
    animate(0.2, 20)
    expect(hand()).toBe(4)
    puppet.play({ clip: "Cut", contact: 0.2 }, 0.3, 0.04)
    animate(0)
    expect(hand()).toBe(4)
    animate(0.02)
    expect(hand()).toBeCloseTo(4.5)
    animate(0.02)
    expect(hand()).toBeCloseTo(10)
    // Hit-stop freezes the transition and clip together.
    animate(0)
    expect(hand()).toBeCloseTo(10)
    puppet.dispose()
  })

  it("interrupts the same clip without snapping to its first pose", () => {
    const { puppet, animate, hand } = fixture()
    puppet.play({ clip: "Cut", contact: 0.2 }, 0.3, 0.04)
    animate(0.04)
    expect(hand()).toBeCloseTo(10)
    puppet.play({ clip: "Cut", contact: 0.2 }, 0.3, 0.04)
    animate(0)
    expect(hand()).toBeCloseTo(10)
    animate(0.04)
    expect(hand()).toBeCloseTo(10)
    puppet.dispose()
  })

  it("shows immediate hits at contact and carries elapsed time into recovery", () => {
    const { puppet, animate, hand } = fixture()
    puppet.play({ clip: "Cut", contact: 0.2, next: "Recover" }, 0.3, 0)
    animate(0)
    expect(hand()).toBeCloseTo(10)
    animate(0.32)
    expect(hand()).toBeCloseTo(5.4)
    puppet.dispose()
  })
})

describe("painting a copy", () => {
  it("keeps a material's own glow under a flash, and back after it", async () => {
    const { Group, Mesh, BoxGeometry, MeshStandardMaterial } = await import("three")
    const { copyModel, paintMaterials } = await import("../src/presentation/puppet.ts")
    const scene = new Group()
    scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 4 })))
    const copy = copyModel({ id: "waterSpirit", scene, clips: new Map(), spec: { url: "", height: 1, clips: {} } }, true)
    const material = copy.materials[0]!.material
    if (!(material instanceof MeshStandardMaterial)) throw new Error("a lit material")
    paintMaterials(copy.materials, 0xffffff, 0xff0000, 0.5, 1)
    expect(material.emissive.r * material.emissiveIntensity).toBeCloseTo(4.5)
    expect(material.emissive.g * material.emissiveIntensity).toBeCloseTo(4)
    paintMaterials(copy.materials, 0xffffff, 0x000000, 0, 1)
    expect(material.emissive.g * material.emissiveIntensity).toBeCloseTo(4)
  })
  it("owns and restores an unlit palette while another copy keeps its colors and opacity", async () => {
    const { Mesh, BoxGeometry, MeshBasicMaterial } = await import("three")
    const { copyModel, paintMaterials, disposeCopy } = await import("../src/presentation/puppet.ts")
    const scene = new Group()
    const original = new MeshBasicMaterial({ color: 0x5ee6c4, vertexColors: true })
    scene.add(new Mesh(new BoxGeometry(), original))
    const source = { id: "windwallSpirit" as const, scene, clips: new Map(), spec: { url: "", height: 1, clips: {} } }
    const first = copyModel(source, true)
    const second = copyModel(source, true)
    const own = first.materials[0]!.material
    const base = original.color.clone()
    expect(own).not.toBe(original)
    paintMaterials(first.materials, 0xffffff, 0xff0000, .5, .25)
    expect(own.color.r).toBeGreaterThan(base.r)
    expect(own.opacity).toBe(.25)
    expect(own.transparent).toBe(true)
    expect(second.materials[0]!.material.color).toEqual(base)
    expect(second.materials[0]!.material.opacity).toBe(1)
    expect(original.color).toEqual(base)
    paintMaterials(first.materials, 0xffffff, 0, 0, 1)
    expect(own.color).toEqual(base)
    expect(own.transparent).toBe(false)
    disposeCopy(first.object, first.materials)
    disposeCopy(second.object, second.materials)
    original.dispose()
  })
})
