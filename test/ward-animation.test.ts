import { NodeRegistry } from "@typeonce/ritmo-render"
import { BoxGeometry, Group, MeshLambertMaterial } from "three"
import { expect, it } from "vitest"
import { defaultTuning } from "../src/config/tuning.ts"
import { EnemyOptionalParts, makeEnemy } from "../src/features/enemies.ts"
import { AnimateActors } from "../src/presentation/animate.ts"
import { Batch, Instance } from "../src/presentation/batch.ts"
import type { RenderNode } from "../src/presentation/host-types.ts"
import { initialResources } from "../src/runtime.ts"
import { AttackPhase, Attacker, Enemy, Game, Position, RenderClock, Stunned, Ward } from "../src/schema.ts"
import { RenderNodes } from "../src/presentation/render-nodes.ts"
import type { AttackPhase as Phase } from "../src/schema.ts"

it("raises and holds Warden's staff from its ward state, with attacks and stun taking priority", () => {
  const samples: Array<{ clip: string; progress: number }> = []
  const nodes = NodeRegistry.make<RenderNode>({ attach() {}, detach() {} })
  const geometry = new BoxGeometry(), material = new MeshLambertMaterial()
  const batch = new Batch(new Group(), geometry, material)
  const made = Game.Runtime.make({
    resources: initialResources(defaultTuning, { width: 390, height: 844 }),
    services: Game.Runtime.services(
      Game.Runtime.service(RenderNodes, nodes),
      Game.Runtime.service(RenderClock, { alpha: 0, frameSeconds: 1 / 60 })
    )
  })
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  const runtime = made.value
  const Spawn = Game.System("Test/SpawnWardModels", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
    commands.spawn(makeEnemy(defaultTuning, "warden", { x: 900, y: 900 }))
    commands.spawn(makeEnemy(defaultTuning, "chaser", { x: 960, y: 900 }))
  })
  const configure = (formed: number, linked = true, phase: Phase = "ready", stunned = false) => Game.System("Test/WardPoseState", {
    queries: {
      allies: Game.Query({ selection: { enemy: Game.Query.read(Enemy), position: Game.Query.read(Position) } }),
      warders: Game.Query({ selection: {
        ward: Game.Query.write(Ward), phase: Game.Query.write(AttackPhase), attacker: Game.Query.write(Attacker), stunned: Game.Query.write(Stunned)
      } })
    }
  }, ({ queries }) => {
    const ally = queries.allies.each().find(({ data }) => data.enemy.get().kind === "chaser")!
    for (const { entity, data } of queries.warders.each()) {
      data.ward.set({ ally: linked ? { handle: Game.Entity.handle(ally.entity.id, Position), id: ally.entity.id } : null, formed, wait: 0 })
      data.phase.set({ _tag: phase })
      data.attacker.set({ ...data.attacker.get(), attack: 0, elapsed: .4 })
      data.stunned.set({ remaining: stunned ? .2 : 0 })
      nodes.ensure(entity.id, () => ({
        kind: "enemy", root: new Group(), pivot: new Group(), shadow: new Instance(batch),
        facing: { x: 0, y: 1 }, attackPhase: null, drops: null,
        body: {
          object: new Group(), height: 50, radius: 17, instances: [], moments: null,
          face() {}, animate() {}, paint() {}, play() {}, dispose() {},
          sample(clip, progress) { samples.push({ clip, progress }) }
        }
      }))
    }
  })
  expect(runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred())).ok).toBe(true)
  const draw = (formed: number, linked = true, phase: Phase = "ready", stunned = false) => {
    samples.length = 0
    expect(runtime.tick(Game.Schedule(configure(formed, linked, phase, stunned), AnimateActors)).ok).toBe(true)
    return [...samples]
  }
  expect(draw(0)).toEqual([{ clip: "Buff", progress: 0 }])
  expect(draw(.3)).toEqual([{ clip: "Buff", progress: .5 }])
  expect(draw(.6)).toEqual([{ clip: "Buff", progress: 1 }])
  expect(draw(.6)).toEqual([{ clip: "Buff", progress: 1 }])
  expect(draw(.6, true, "windup")).toEqual([{ clip: "Windup", progress: .5 }])
  expect(draw(.6, true, "ready", true)).toEqual([])
  expect(draw(0, false)).toEqual([])
  geometry.dispose()
  material.dispose()
})
