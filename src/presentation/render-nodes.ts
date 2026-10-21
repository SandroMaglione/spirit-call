/**
 * The registry of render nodes, declared with the render code: the
 * simulation never names a renderer's types (see `ritmo/keep-simulation-headless`).
 */
import { Descriptor } from "@typeonce/ritmo"
import type { NodeRegistry } from "@typeonce/ritmo-render"

import type { RenderNode } from "./host-types.ts"

export const RenderNodes = Descriptor.Service<NodeRegistry.NodeRegistry<RenderNode>>()("Shooter/RenderNodes")
