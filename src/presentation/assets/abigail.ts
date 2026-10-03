/**
 * Abigail, the anime character study (a fan study of Eternal Return's
 * character), and her two swords: the crow's, scaled to her hand. Exported
 * from Blender by `art/characters/abigail/export.py` (see its README),
 * which also generates abigail-timing.ts; do not edit its numbers.
 */
import type { ModelSpec } from "../models.ts"
import abigailUrl from "../../../art/characters/abigail/abigail.glb?url"
import crescendoUrl from "../../../art/characters/abigail/crescendo.glb?url"
import trainingBladeUrl from "../../../art/characters/abigail/training-blade.glb?url"
import { abigailTiming } from "./abigail-timing.ts"
export { abigailCombo } from "./abigail-timing.ts"

export const abigailModel = { url: abigailUrl, shading: "toon", ...abigailTiming } as const satisfies ModelSpec

/** Swords: held in her `weapon_grip` bone as they are (their size and axes are hers). */
export const abigailTrainingBladeModel = { url: trainingBladeUrl, height: null, clips: {}, shading: "toon" } as const satisfies ModelSpec
export const abigailCrescendoModel = { url: crescendoUrl, height: null, clips: {}, shading: "toon" } as const satisfies ModelSpec
