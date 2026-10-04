import { describe, expect, it } from "vitest"
import { enemies } from "../src/content/enemies.ts"
import { atlasFrame } from "../src/presentation/animation-atlas.ts"
import { enemyPose } from "../src/presentation/enemy-pose.ts"
import { enemyLooks } from "../src/presentation/looks.ts"

describe("enemy animation sampling", () => {
  it("uses the spray's release pose when its active phase has zero duration", () => {
    const spray = enemies.shooter.attacks.find((attack) => attack.id === "spray")!
    const look = enemyLooks.shooter
    if (look.kind !== "model") throw new Error("Shooter needs its model")
    expect(enemyPose(spray, "windup", spray.windup / 2, look.attackClips?.spray)).toEqual({ clip: "WindupSpray", progress: .5 })
    expect(enemyPose(spray, "recovery", 0, look.attackClips?.spray)).toEqual({ clip: "RecoverySpray", progress: 0 })
    expect(enemyPose(spray, "ready", 0, look.attackClips?.spray)).toBeNull()
  })
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
    expect(enemies.shooter.attacks[0]!.active).toBe(0)
    expect(enemyPose(enemies.shooter.attacks[0], "recovery", 0)).toEqual({ clip: "Recovery", progress: 0 })
    expect(enemyPose(enemies.chaser.attacks.find((attack) => attack.id === "swipe"), "windup", .2)).toEqual({ clip: "Windup", progress: .5 })
    expect(enemyPose(enemies.guardian.attacks[0], "active", .05)).toEqual({ clip: "Active", progress: .5 })
    expect(enemyPose(enemies.guardian.attacks[0], "ready", 0)).toBeNull()
    expect(enemyPose(undefined, "windup", 0)).toBeNull()
  })
})
