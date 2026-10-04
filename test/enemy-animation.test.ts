import { describe, expect, it } from "vitest"
import { enemies } from "../src/content/enemies.ts"
import { atlasFrame } from "../src/presentation/animation-atlas.ts"
import { enemyPose } from "../src/presentation/enemy-pose.ts"
import { enemyLooks } from "../src/presentation/looks.ts"

describe("enemy animation sampling", () => {
  it("keeps Stalker's blink distinct from its close slash and uses each simulation phase", () => {
    const look = enemyLooks.stalker
    if (look.kind !== "model") throw new Error("Stalker needs its model")
    for (const spec of enemies.stalker.attacks) {
      const override = look.attackClips?.[spec.id]
      for (const phase of ["windup", "active", "recovery"] as const) {
        const name = phase === "windup" ? "Windup" : phase === "active" ? "Active" : "Recovery"
        expect(enemyPose(spec, phase, spec[phase] / 2, override)).toEqual({
          clip: name + (spec.id === "blink" ? "Blink" : ""), progress: .5
        })
      }
    }
  })
  it("distinguishes Firebomber's swipe and Guardian's thrust using their combat durations", () => {
    for (const [kind, id, suffix] of [["charger", "swipe", "Swipe"], ["guardian", "thrust", "Thrust"]] as const) {
      const attack = enemies[kind].attacks.find((attack) => attack.id === id)!
      const look = enemyLooks[kind]
      if (look.kind !== "model") throw new Error(`${kind} needs its model`)
      for (const phase of ["windup", "active", "recovery"] as const) {
        const base = { windup: "Windup", active: "Active", recovery: "Recovery" }[phase]
        expect(enemyPose(attack, phase, attack[phase] / 2, look.attackClips?.[id])).toEqual({ clip: base + suffix, progress: .5 })
      }
    }
  })
  it("starts the bomb and sniper recovery at release without an active interval", () => {
    for (const kind of ["charger", "sniper"] as const) {
      const attack = enemies[kind].attacks[0]!
      expect(attack.active).toBe(0)
      expect(enemyPose(attack, "recovery", 0)).toEqual({ clip: "Recovery", progress: 0 })
    }
  })
  it("samples the stomp clips over the stomp's own phase duration", () => {
    const stomp = enemies.brute.attacks.find((attack) => attack.id === "stomp")!
    const look = enemyLooks.brute
    if (look.kind !== "model") throw new Error("Brute needs its model")
    expect(enemyPose(stomp, "windup", .375, look.attackClips?.stomp)).toEqual({ clip: "WindupStomp", progress: .5 })
    expect(enemyPose(stomp, "active", .06, look.attackClips?.stomp)).toEqual({ clip: "ActiveStomp", progress: .5 })
    expect(enemyPose(stomp, "recovery", .4, look.attackClips?.stomp)).toEqual({ clip: "RecoveryStomp", progress: .5 })
  })
  it("uses the spray's release pose when its active phase has zero duration", () => {
    const spray = enemies.shooter.attacks.find((attack) => attack.id === "spray")!
    const look = enemyLooks.shooter
    if (look.kind !== "model") throw new Error("Shooter needs its model")
    expect(enemyPose(spray, "windup", spray.windup / 2, look.attackClips?.spray)).toEqual({ clip: "WindupSpray", progress: .5 })
    expect(enemyPose(spray, "recovery", 0, look.attackClips?.spray)).toEqual({ clip: "RecoverySpray", progress: 0 })
    expect(enemyPose(spray, "ready", 0, look.attackClips?.spray)).toBeNull()
  })
  it("keeps the Juggernaut's quake distinct from its sweep over the simulation phases", () => {
    const look = enemyLooks.juggernaut
    if (look.kind !== "model") throw new Error("Juggernaut needs its model")
    const quake = enemies.juggernaut.attacks.find((attack) => attack.id === "quake")!
    const sweep = enemies.juggernaut.attacks.find((attack) => attack.id === "sweep")!
    expect(enemyPose(quake, "windup", quake.windup / 2, look.attackClips?.quake)).toEqual({ clip: "WindupQuake", progress: .5 })
    expect(enemyPose(quake, "active", quake.active / 2, look.attackClips?.quake)).toEqual({ clip: "ActiveQuake", progress: .5 })
    expect(enemyPose(quake, "recovery", quake.recovery / 2, look.attackClips?.quake)).toEqual({ clip: "RecoveryQuake", progress: .5 })
    expect(enemyPose(sweep, "windup", sweep.windup / 2, look.attackClips?.sweep)).toEqual({ clip: "Windup", progress: .5 })
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
