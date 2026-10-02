import { describe, expect, it } from "vitest"
import { enemies } from "../src/content/enemies.ts"
import { atlasFrame } from "../src/presentation/animation-atlas.ts"
import { enemyPose } from "../src/presentation/enemy-pose.ts"

describe("enemy animation sampling", () => {
  it("wraps reversed locomotion and closes the last interval without skipping a pose", () => {
    const clip = { offset: 10, frames: 31, seconds: 1, loop: true }
    expect(atlasFrame(clip, -.1)[0]).toBe(37)
    expect(atlasFrame(clip, 1)).toEqual([10, 11, 0])
    const [a, b, weight] = atlasFrame(clip, .99)
    expect([a, b]).toEqual([39, 40])
    expect(weight).toBeCloseTo(.7)
  })
  it("holds the final death pose and never reads outside a clip", () => {
    const clip = { offset: 50, frames: 22, seconds: .7, loop: false }
    expect(atlasFrame(clip, 5)).toEqual([71, 71, 0])
    expect(atlasFrame(clip, -1)).toEqual([50, 51, 0])
  })
  it("samples the simulation's phase even when active lasted zero seconds", () => {
    expect(enemies.shooter.attack!.active).toBe(0)
    expect(enemyPose(enemies.shooter.attack, "recovery", 0)).toEqual({ clip: "Recovery", progress: 0 })
    expect(enemyPose(enemies.chaser.attack, "windup", .225)).toEqual({ clip: "Windup", progress: .5 })
    expect(enemyPose(enemies.charger.attack, "active", .21)).toEqual({ clip: "Active", progress: .5 })
    expect(enemyPose(enemies.charger.attack, "ready", 0)).toBeNull()
    expect(enemyPose(null, "windup", 0)).toBeNull()
  })
})
