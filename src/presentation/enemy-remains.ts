/** Keep only the drawing after a kill. The entity and its collision are already gone. */
import type { Group } from "three"
import { Flow, Game, Hit, HitStop, RenderClock, RenderHost, RenderNodes, Run } from "../schema.ts"
import type { ActorNode } from "./host-types.ts"
import { disposeNode, instancesOf } from "./nodes.ts"

export class EnemyRemains {
  private readonly nodes = new Map<ActorNode, number>()
  private readonly parent: Group
  private runTime = 0

  constructor(parent: Group) { this.parent = parent }

  get size(): number { return this.nodes.size }
  has(node: ActorNode): boolean { return this.nodes.has(node) }

  followRun(time: number): void {
    if (time < this.runTime) this.clear()
    this.runTime = time
  }

  take(node: ActorNode): void {
    if (node.body.sample === undefined || this.nodes.has(node)) return
    this.nodes.set(node, 0)
    node.body.paint(0xffffff, 0xffffff, 0, 1)
  }

  advance(seconds: number): void {
    for (const [node, elapsed] of this.nodes) {
      const age = elapsed + seconds
      if (age >= .7) { this.remove(node); continue }
      this.nodes.set(node, age)
      node.body.sample?.("Death", age / .7)
      node.shadow.object.scale.multiplyScalar(Math.max(0, 1 - seconds * 2))
    }
  }

  clear(): void { for (const node of this.nodes.keys()) this.remove(node) }

  private remove(node: ActorNode): void {
    this.parent.remove(node.root)
    for (const instance of instancesOf(node)) instance.batch.remove(instance)
    disposeNode(node)
    this.nodes.delete(node)
  }
}

/** Runs before SyncNodes disposes despawned enemies, using the existing killed-hit event. */
export const KeepEnemyDeaths = Game.System("Shooter/KeepEnemyDeaths", {
  events: { hit: Game.System.readEvent(Hit) },
  resources: { hitStop: Game.System.readResource(HitStop), run: Game.System.readResource(Run) },
  machines: { flow: Game.System.machine(Flow) },
  services: { nodes: Game.System.service(RenderNodes), host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ events, resources, machines, services }) => {
  const remains = services.host.remains
  remains.followRun(resources.run.get().time)
  if (machines.flow.get() === "Menu") { remains.clear(); return }
  for (const hit of events.hit.all()) {
    if (!hit.killed || hit.faction !== "enemy") continue
    const node = services.nodes.get({ value: hit.entity })
    if (node?.kind !== "enemy") continue
    node.root.position.set(hit.at.x, 0, hit.at.y)
    remains.take(node)
  }
  remains.advance(resources.hitStop.get().remaining > 0 ? 0 : services.clock.frameSeconds)
})
