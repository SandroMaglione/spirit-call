import { Descriptor } from "@typeonce/ritmo"
import type { NodeRegistry } from "@typeonce/ritmo-render"

import type { RenderNode } from "./host-types.ts"

/**
 * The render nodes, by entity. Declared here, in render code, so the
 * simulation's schema names no renderer type (services are not registered
 * in the schema).
 */
export const RenderNodes = Descriptor.Service<NodeRegistry.NodeRegistry<RenderNode>>()("Shooter/RenderNodes")
