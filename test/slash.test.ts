import { describe, expect, it } from "vitest"

import type { Touch } from "@typeonce/bevy-ts-browser"

import type { TouchButton } from "../src/config/input.ts"
import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { MeleeMove } from "../src/content/attacks.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { Camera, Enemy, Game, Health, HitStop, Player, Position, RunScope, Stats, BasicAttack } from "../src/schema.ts"
import { start, windCut, withWindCut, plainAttack, plainEnemies, hitBy } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
const sword = plainAttack(defaultTuning, "blade")
const [first, second, third, finisher] = sword.combo as [MeleeMove, MeleeMove, MeleeMove, MeleeMove]
/** The sword with its combo moves by name. */
const slash = { ...sword, first, second, third, finisher }
const firstArc = first.shape === "arc" ? first.arcDegrees : 0
const hp = defaultTuning.enemies.dummy.hp
const steps = (seconds: number) => Math.round(seconds / engine.stepSeconds)

const World = Game.Inspector("Test/Slash", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Enemy] }),
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] })
  },
  resources: { stats: Game.System.readResource(Stats), camera: Game.System.readResource(Camera) }
}, ({ queries, resources }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ position: data.position.get(), health: data.health.get().current })),
  player: queries.player.each()[0]!.data.position.get(),
  slashes: resources.stats.get().shots,
  camera: resources.camera.get()
}))

const HitStopLeft = Game.Inspector("Test/HitStopLeft", {
  resources: { hitStop: Game.System.readResource(HitStop) }
}, ({ resources }) => resources.hitStop.get().remaining)

/** The sword move done last, by name ("ready": none, the next press starts the combo). */
const ComboState = Game.Inspector("Test/Combo", {
  queries: { player: Game.Query({ selection: { basicAttack: Game.Query.read(BasicAttack) }, with: [Player] }) }
}, ({ queries }) => ["first", "second", "third", "finisher"][queries.player.each()[0]!.data.basicAttack.get().step] ?? "ready")

/** Replaces the training dummies with dummies at `offsets` from the player. Facing starts at world +x. */
const arena = (
  offsets: ReadonlyArray<{ readonly x: number; readonly y: number }>,
  frames: number,
  options: { readonly tuning?: Tuning; readonly touch?: Touch.Timeline<TouchButton> } = {}
) => {
  const run = start({
    ...(options.tuning === undefined ? {} : { tuning: options.tuning }),
    touch: options.touch ?? [{ frame: 0, press: ["attack"] }, { frame: frames, release: ["attack"] }]
  })
  const Place = Game.System("Test/PlaceDummies", {
    queries: { dummies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) }
  }, ({ queries, commands }) => {
    for (const { entity } of queries.dummies.each()) commands.despawn(entity.id)
    for (const offset of offsets) commands.spawnIn(RunScope, makeEnemy(defaultTuning, "dummy", { x: center.x + offset.x, y: center.y + offset.y }))
  })
  run.runtime.tick(Game.Schedule(Place, Game.Schedule.applyDeferred()))
  return run
}

const noAssist = tuningWith({ touch: { assist: { enabled: false } } })
/** An offset `distance` from the player, `degrees` off world +x (the starting facing). */
const at = (degrees: number, distance: number) => ({ x: Math.cos((degrees * Math.PI) / 180) * distance, y: Math.sin((degrees * Math.PI) / 180) * distance })

describe("attack assist (touch)", () => {
  it("turns a tap toward the nearest enemy in any direction, even behind", () => {
    const run = arena([at(180, 70)], 1)
    run.step(3)
    expect(run.runtime.inspect(World).enemies[0]!.health).toBe(hp - hitBy("swordsman", first.power))
    const aim = run.player().aim
    expect(Math.abs(Math.atan2(aim.y, aim.x) * 180 / Math.PI)).toBeCloseTo(180, 0)
  })

  it("prefers what is in front when distances are close", () => {
    const run = arena([at(0, 100), at(180, 80)], 1)
    run.step(3)
    expect(run.runtime.inspect(World).enemies.map((enemy) => enemy.health)).toEqual([hp - hitBy("swordsman", first.power), hp])
  })

  it("never extends reach: it turns toward an enemy just out of reach but does not hit it", () => {
    const run = arena([at(30, first.reach + defaultTuning.enemies.dummy.hurtboxRadius + 15)], 1)
    run.step(3)
    expect(run.runtime.inspect(World).enemies[0]!.health).toBe(hp)
    const aim = run.player().aim
    expect(Math.atan2(aim.y, aim.x) * 180 / Math.PI).toBeCloseTo(30, 0)
  })

  it("does not aim skills: a tapped cut goes where the player faces", () => {
    // An enemy behind would draw an attack, but not the cut.
    const run = arena([at(180, 100), at(0, 150)], 1, { tuning: withWindCut(), touch: [{ frame: 0, press: ["special"], release: ["special"] }] })
    run.step(3)
    expect(run.runtime.inspect(World).enemies.map((enemy) => enemy.health)).toEqual([hp, hp - hitBy("swordsman", windCut.power)])
    expect(run.player().aim).toEqual({ x: 1, y: 0 })
  })

  it("can be turned off: the slash keeps the facing", () => {
    const off = arena([at(40, 90)], 1, { tuning: noAssist })
    off.step(3)
    expect(off.player().aim).toEqual({ x: 1, y: 0 })
  })
})

describe("sword slash", () => {
  it("hits what is in front within reach, not what is behind or too far", () => {
    const run = arena([{ x: 80, y: 0 }, { x: -80, y: 0 }, { x: first.reach + 60, y: 0 }], 1)
    run.step(3)
    expect(run.runtime.inspect(World).enemies.map((enemy) => enemy.health)).toEqual([hp - hitBy("swordsman", first.power), hp, hp])
  })

  it("hits several targets in the arc with one slash, once each", () => {
    const side = Math.sin((firstArc * Math.PI) / 360 - 0.2) * 70
    const run = arena([{ x: 70, y: side }, { x: 70, y: -side }], 1, { tuning: noAssist })
    run.step(6)
    expect(run.runtime.inspect(World).enemies.map((enemy) => enemy.health)).toEqual([hp - hitBy("swordsman", first.power), hp - hitBy("swordsman", first.power)])
  })

  it("slashes once per press: holding does not repeat, and a press during the recharge is buffered", () => {
    const held = arena([], 120)
    held.step(120)
    expect(held.runtime.inspect(World).slashes).toBe(1)

    // Pressed again 0.1 s before the recharge ends: the second slash comes right when it ends.
    const buffered = arena([], 1, { touch: [{ frame: 0, press: ["attack"], release: ["attack"] }, { frame: steps(first.recovery - 0.1), press: ["attack"], release: ["attack"] }] })
    buffered.step(steps(first.recovery) + 2)
    expect(buffered.runtime.inspect(World).slashes).toBe(2)
    // Pressed too early (before the buffer opens): dropped.
    const early = arena([], 1, { touch: [{ frame: 0, press: ["attack"], release: ["attack"] }, { frame: steps(first.recovery - slash.inputBuffer - 0.05), press: ["attack"], release: ["attack"] }] })
    early.step(steps(first.recovery) + 10)
    expect(early.runtime.inspect(World).slashes).toBe(1)
  })

  it("keeps the camera centered on the player on touch", () => {
    const run = arena([], 1)
    run.step(120)
    const { camera, player } = run.runtime.inspect(World)
    expect(camera.x).toBeCloseTo(player.x, 1)
    expect(camera.y).toBeCloseTo(player.y, 1)
  })

  it("drives enemies back: a slash pushes about knockback / decay, and a walking enemy is staggered instead of walking back in", () => {
    const pushed = arena([{ x: 80, y: 0 }], 1)
    pushed.step(40)
    const [dummy] = pushed.runtime.inspect(World).enemies
    expect(dummy!.position.x - center.x - 80).toBeCloseTo(first.knockback / defaultTuning.knockback.decay, 0)

    // A chaser right in front: after one slash it ends up out of reach for a while.
    const run = start({ touch: [{ frame: 0, press: ["attack"] }, { frame: 1, release: ["attack"] }] })
    const Place = Game.System("Test/PlaceChaser", {
      queries: { dummies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) }
    }, ({ queries, commands }) => {
      for (const { entity } of queries.dummies.each()) commands.despawn(entity.id)
      commands.spawnIn(RunScope, makeEnemy(plainEnemies(defaultTuning), "chaser", { x: center.x + 70, y: center.y }))
    })
    run.runtime.tick(Game.Schedule(Place, Game.Schedule.applyDeferred()))
    run.step(18)
    const chaser = run.runtime.inspect(World).enemies[0]!
    expect(chaser.health).toBe(defaultTuning.enemies.chaser.hp - hitBy("swordsman", first.power))
    // Staggered: it slid back with the push instead of walking back in.
    expect(chaser.position.x - center.x).toBeGreaterThan(70 + (first.knockback / defaultTuning.knockback.decay) * 0.8)
  })

  it("chains the combo on presses in rhythm: arc, arc, thrust, finisher spin, then starts over", () => {
    // Press right when each move's recovery ends (the input buffer holds an early press).
    const frames = [0]
    for (const move of [slash.first, slash.second, slash.third, slash.finisher]) frames.push(frames.at(-1)! + steps(move.recovery) + 1)
    const run = arena([], 1, { touch: frames.map((frame) => ({ frame, press: ["attack" as const], release: ["attack" as const] })) })
    const combos: Array<string> = []
    for (let frame = 0; frame <= frames.at(-1)! + 2; frame++) {
      run.step()
      const combo = run.runtime.inspect(ComboState)
      if (combos.at(-1) !== combo) combos.push(combo)
    }
    // Between the finisher and the next first move it may be ready for a step, or the buffered press goes at once.
    expect(combos.filter((combo) => combo !== "ready")).toEqual(["first", "second", "third", "finisher", "first"])
    expect(run.runtime.inspect(World).slashes).toBe(5)
  })

  it("starts over when the next press comes after the combo window", () => {
    const late = steps(first.recovery + slash.comboWindow) + 5
    const run = arena([], 1, { touch: [{ frame: 0, press: ["attack"], release: ["attack"] }, { frame: late, press: ["attack"], release: ["attack"] }] })
    run.step(late + 2)
    expect(run.runtime.inspect(ComboState)).toBe("first")
  })

  it("gives each move its shape: the thrust reaches farther in a line, the spin hits all around and launches", () => {
    const finisher = slash.finisher
    // Run the combo to the thrust, then to the finisher, with a dummy placed for each.
    const presses = (count: number) => {
      const frames = [0]
      for (const move of [slash.first, slash.second, slash.third].slice(0, count - 1)) frames.push(frames.at(-1)! + steps(move.recovery) + 1)
      return frames.map((frame) => ({ frame, press: ["attack" as const], release: ["attack" as const] }))
    }
    // The thrust: a dummy at 160 (beyond the arcs' 120) is only hit by the third move.
    const thrust = arena([at(0, slash.third.reach - 15)], 1, { touch: presses(3) })
    thrust.step(presses(3).at(-1)!.frame + 3)
    expect(thrust.runtime.inspect(World).enemies[0]!.health).toBeLessThan(hp)
    // The spin: a dummy behind the player is hit by the finisher only.
    const spin = arena([at(180, 70)], 1, { tuning: noAssist, touch: presses(4) })
    spin.step(presses(4).at(-1)!.frame + 3)
    expect(spin.runtime.inspect(World).enemies[0]!.health).toBe(hp - hitBy("swordsman", finisher.power))
  })

  it("lunges forward with each move, stopping short of an enemy straight ahead", () => {
    // Nothing ahead: a tap carries the player the first move's full lunge along the facing (+x).
    const open = arena([], 1, { tuning: noAssist })
    open.step(30)
    expect(open.runtime.inspect(World).player.x - center.x).toBeCloseTo(first.lunge, 0)
    expect(open.runtime.inspect(World).player.y).toBeCloseTo(center.y, 6)

    // A dummy just ahead: the lunge ends `lungeStop` short of it, edge to edge.
    const clearance = defaultTuning.enemies.dummy.hurtboxRadius + defaultTuning.characters.swordsman.radius
    const close = arena([at(0, clearance + slash.lungeStop + 5)], 1, { tuning: noAssist })
    close.step(30)
    const moved = close.runtime.inspect(World).player.x - center.x
    expect(moved).toBeGreaterThan(3)
    expect(moved).toBeLessThan(first.lunge - 5)
  })

  it("pauses the game for each blow's own hit-stop, longest for the finisher", () => {
    /** Steps until the dummy is first hurt, then reads the hit-stop started by that blow. */
    const hitStopOnHit = (run: ReturnType<typeof arena>) => {
      for (let frame = 0; frame < 200; frame++) {
        run.step()
        if (run.runtime.inspect(World).enemies[0]!.health < hp) return run.runtime.inspect(HitStopLeft)
      }
      throw new Error("never hit")
    }
    const opening = hitStopOnHit(arena([at(0, 70)], 1, { tuning: noAssist }))
    expect(opening).toBeGreaterThan(first.hitStop - 2 * engine.stepSeconds)
    expect(opening).toBeLessThanOrEqual(first.hitStop)

    // Only the finisher's spin reaches a dummy behind the player.
    const frames = [0]
    for (const move of [slash.first, slash.second, slash.third]) frames.push(frames.at(-1)! + steps(move.recovery) + 1)
    const finisher = hitStopOnHit(arena([at(180, 70)], 1, { tuning: noAssist, touch: frames.map((frame) => ({ frame, press: ["attack" as const], release: ["attack" as const] })) }))
    expect(finisher).toBeGreaterThan(slash.finisher.hitStop - 2 * engine.stepSeconds)
    expect(slash.finisher.hitStop).toBeGreaterThan(first.hitStop)
  })
})
