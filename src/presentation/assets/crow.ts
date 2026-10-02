/**
 * The crow and its two swords, exported from Blender by
 * `art/characters/crow/combat/export.py` (see its README). The exporter also
 * generates crow-timing.ts from model-info.json; do not edit its numbers.
 */
import type { ModelSpec } from "../models.ts"
import crescendoUrl from "../../../art/characters/crow/combat/crescendo.glb?url"
import crowUrl from "../../../art/characters/crow/combat/crow-combat.glb?url"
import trainingBladeUrl from "../../../art/characters/crow/combat/training-blade.glb?url"
import { crowTiming } from "./crow-timing.ts"
export { crowCombo } from "./crow-timing.ts"

export const crowModel = {
  url: crowUrl,
  ...crowTiming
} as const satisfies ModelSpec

/** Swords: held in the crow's `weapon_grip` bone as they are (their size and axes are the crow's). */
export const trainingBladeModel = { url: trainingBladeUrl, height: null, clips: {} } as const satisfies ModelSpec
export const crescendoModel = { url: crescendoUrl, height: null, clips: {} } as const satisfies ModelSpec
