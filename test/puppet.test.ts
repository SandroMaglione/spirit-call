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
  const puppet = new Puppet({ id: "crow", scene, clips, spec: { url: "", height: 1, clips: {} } }, 1,
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
