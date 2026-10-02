/**
 * The crow model (`crow.glb`), exported from Blender by
 * `art/crow-study/export/export-glb.py` (branch `art-style-test`). Copy the
 * GLB and these numbers from that export's `model-info.json`
 * (`animated_export`) together; do not edit them by hand.
 *
 * The model is in meters, +Y up, facing +Z, standing on its origin (the
 * ground between the feet). Clips play in place: the game moves it.
 */
import crowUrl from "./crow.glb?url"

export const crowModel = {
  url: crowUrl,
  /** Rest-pose height, for scaling it to a body's height. */
  heightMeters: 2.19648814201355,
  clips: {
    /** Loops: the export leaves out the closing key (the first pose again), `loopSeconds` puts it back. */
    Idle: { lastKeySeconds: 47 / 24, loopSeconds: 2 },
    Run: { lastKeySeconds: 11 / 24, loopSeconds: 0.5 },
    /** A pose study for an unarmed slash (not wired to combat yet). */
    Attack: { lastKeySeconds: 16 / 24, loopSeconds: null }
  },
  /** World units travelled in one run cycle: the steps keep pace with the ground (an artistic choice, not measured from the feet). */
  runDistance: 110
} as const

export type CrowClip = keyof typeof crowModel.clips
