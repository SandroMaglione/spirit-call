/**
 * The crow and its two swords, exported from Blender by
 * `art/characters/crow/combat/export.py` (see its README). These numbers are
 * copied from that export's `model-info.json`: update them with it, never
 * by hand.
 */
import type { ModelSpec } from "../models.ts"
import crescendoUrl from "../../../art/characters/crow/combat/crescendo.glb?url"
import crowUrl from "../../../art/characters/crow/combat/crow-combat.glb?url"
import trainingBladeUrl from "../../../art/characters/crow/combat/training-blade.glb?url"

const fps = 30

export const crowModel = {
  url: crowUrl,
  height: 2.196488138753921,
  clips: {
    Idle: { lastKeySeconds: 59 / fps, loopSeconds: 2 },
    Run: { lastKeySeconds: 15 / fps, loopSeconds: 16 / fps },
    /** The whole sword combo in one clip; `combo` below splits it into its four moves. */
    AttackCombo: { lastKeySeconds: 66 / fps, loopSeconds: null },
    RunStart: { lastKeySeconds: 8 / fps, loopSeconds: null },
    RunStop: { lastKeySeconds: 9 / fps, loopSeconds: null },
    Recover1: { lastKeySeconds: 9 / fps, loopSeconds: null },
    Recover2: { lastKeySeconds: 9 / fps, loopSeconds: null },
    Recover3: { lastKeySeconds: 9 / fps, loopSeconds: null }
  }
} as const satisfies ModelSpec

/**
 * The combo's moves within `AttackCombo` (clip seconds): where each starts
 * and ends, where its blow lands (the middle of the art's active window),
 * and the clip back to the guard when the combo stops there.
 */
export const crowCombo = [
  { from: 0, to: 13 / fps, contact: 10 / fps, next: "Recover1" },
  { from: 13 / fps, to: 24 / fps, contact: 21 / fps, next: "Recover2" },
  { from: 24 / fps, to: 37 / fps, contact: 33 / fps, next: "Recover3" },
  { from: 37 / fps, to: 66 / fps, contact: 52 / fps }
] as const

/** Swords: held in the crow's `weapon_grip` bone as they are (their size and axes are the crow's). */
export const trainingBladeModel = { url: trainingBladeUrl, height: null, clips: {} } as const satisfies ModelSpec
export const crescendoModel = { url: crescendoUrl, height: null, clips: {} } as const satisfies ModelSpec
