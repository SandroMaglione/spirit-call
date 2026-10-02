/**
 * The crow (`crow.glb`), exported from Blender by
 * `art/crow-study/export/export-glb.py` (branch `art-style-test`). Copy the
 * GLB and these numbers from that export's `model-info.json`
 * (`animated_export`) together; do not edit them by hand.
 */
import type { ModelSpec } from "../models.ts"
import crowUrl from "./crow.glb?url"

export const crowModel = {
  url: crowUrl,
  height: 2.19648814201355,
  clips: {
    Idle: { lastKeySeconds: 47 / 24, loopSeconds: 2 },
    Run: { lastKeySeconds: 11 / 24, loopSeconds: 0.5 },
    /** A pose study for an unarmed slash. */
    Attack: { lastKeySeconds: 16 / 24, loopSeconds: null }
  }
} as const satisfies ModelSpec
