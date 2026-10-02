/**
 * The bevy-ts monitor, toggled with backslash (or the corner button): live
 * schedule timings, the system map, entity counts, and an entity inspector.
 * Entities are picked and marked through their render nodes.
 */
import type { Schema } from "@typeonce/bevy-ts/Schema"
import { Monitor } from "@typeonce/bevy-ts-devtools"
import type { NodeRegistry } from "@typeonce/bevy-ts-pixi"

import type { RenderHostValue, RenderNode } from "../presentation/host-types.ts"

/** Actor bodies stand on their feet; pick around their middle (world units above the floor). */
const bodyLift = 14
const pickRadius = 40

export const attachMonitor = <S extends Schema.Any, Root>(
  runtime: Monitor.Target<S, Root>,
  schedules: Monitor.Options<S, Root>["schedules"],
  host: RenderHostValue,
  nodes: NodeRegistry.NodeRegistry<RenderNode>
): Monitor.Monitor => {
  const screenOf = (node: RenderNode) => {
    const rect = host.canvas.getBoundingClientRect()
    const at = host.toCanvas({ x: node.root.position.x, y: node.root.position.z }, bodyLift)
    return { x: rect.left + at.x, y: rect.top + at.y }
  }
  return Monitor.attach(runtime, {
    schedules,
    pick: (event) => {
      let best: number | undefined
      let bestDistance = pickRadius
      for (const [id, node] of nodes.entries()) {
        if (node.kind === "wall") continue
        const at = screenOf(node)
        const distance = Math.hypot(at.x - event.clientX, at.y - event.clientY)
        if (distance < bestDistance) {
          best = id
          bestDistance = distance
        }
      }
      return best
    },
    locate: (entity) => {
      const node = nodes.get({ value: entity })
      return node === undefined || node.kind === "wall" ? undefined : screenOf(node)
    }
  })
}
