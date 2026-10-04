import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { elevation } from "../src/math/iso.ts"
import { arenaLooks, characterLooks, enemyLooks, modelsInLooks } from "../src/presentation/looks.ts"
import { enemies } from "../src/content/enemies.ts"
import type { EnemyKind } from "../src/content/enemies.ts"
import type { Moments, Shot } from "../src/presentation/looks.ts"
import { models } from "../src/presentation/models.ts"
import type { ClipTiming, ModelId } from "../src/presentation/models.ts"

/** The clip names inside a GLB file (its JSON chunk), read without a renderer. */
const clipsInFile = (id: ModelId): ReadonlyArray<string> => {
  const file = readFileSync(path.join(import.meta.dirname, "..", models[id].url))
  expect(file.toString("latin1", 0, 4)).toBe("glTF")
  const length = file.readUInt32LE(12)
  expect(file.toString("latin1", 16, 20)).toBe("JSON")
  const json = JSON.parse(file.toString("utf8", 20, 20 + length)) as { animations?: ReadonlyArray<{ name: string }> }
  return (json.animations ?? []).map((animation) => animation.name)
}

/** The clips a look's moments play, with the parts of them they play (clip seconds). */
const shotsOf = (moments: Moments): ReadonlyArray<{ readonly clip: string; readonly from?: number; readonly to?: number }> => {
  const shots: Array<Shot> = [
    moments.idle,
    moments.run.clip,
    ...(moments.attack ?? []),
    ...[moments.power, moments.dash, moments.windup, moments.hurt].filter((shot) => shot !== undefined),
    ...Object.values(moments.skills ?? {})
  ]
  return shots.flatMap((shot) => typeof shot === "string" ? [{ clip: shot }] : [shot, ...(shot.next === undefined ? [] : [{ clip: shot.next }])])
}

/** The node names inside a GLB file. */
const nodesInFile = (id: ModelId): ReadonlyArray<string> => {
  const file = readFileSync(path.join(import.meta.dirname, "..", models[id].url))
  const json = JSON.parse(file.toString("utf8", 20, 20 + file.readUInt32LE(12))) as { nodes?: ReadonlyArray<{ name?: string }> }
  return (json.nodes ?? []).flatMap((node) => node.name === undefined ? [] : [node.name])
}

describe("looks and models", () => {
  it("each model file has exactly the clips its spec lists", () => {
    for (const id of Object.keys(models) as Array<ModelId>) {
      expect([...clipsInFile(id)].sort(), id).toEqual(Object.keys(models[id].clips).sort())
    }
  })

  it("each look's moments play clips its model has, within their length", () => {
    for (const look of [...Object.values(characterLooks), ...Object.values(enemyLooks)]) {
      if (look.kind !== "model" || look.moments === undefined) continue
      const clips: Readonly<Record<string, ClipTiming>> = models[look.model].clips
      for (const shot of shotsOf(look.moments)) {
        const timing = clips[shot.clip]
        expect(timing, `${look.model}: ${shot.clip}`).toBeDefined()
        const length = timing!.loopSeconds ?? timing!.lastKeySeconds
        expect(shot.from ?? 0).toBeGreaterThanOrEqual(0)
        expect(shot.to ?? length).toBeLessThanOrEqual(length + 1e-9)
      }
      expect(look.moments.run.distance).toBeGreaterThan(0)
    }
  })

  it("held weapons are models without a body height, and the holder has the grip", () => {
    for (const look of Object.values(characterLooks)) {
      if (look.kind !== "model" || look.held === undefined) continue
      expect(nodesInFile(look.model)).toContain(look.held.grip)
      for (const weapon of Object.values(look.held.weapons)) expect(models[weapon].height).toBeNull()
    }
  })

  it("use only registered models", () => {
    expect([...modelsInLooks()].every((id) => id in models)).toBe(true)
  })

  it("enemy attack variants name real moves and exported phase clips", () => {
    for (const kind of Object.keys(enemyLooks) as Array<EnemyKind>) {
      const look = enemyLooks[kind]
      if (look.kind !== "model") continue
      for (const [attack, phases] of Object.entries(look.attackClips ?? {})) {
        expect(enemies[kind].attacks.some((spec) => spec.id === attack), `${kind}/${attack}`).toBe(true)
        const clips: Readonly<Record<string, ClipTiming>> = models[look.model].clips
        for (const clip of Object.values(phases)) expect(clips[clip], `${kind}/${attack}/${clip}`).toBeDefined()
      }
    }
  })

  it("what stands around an arena is outside its walls and never covers its floor", () => {
    const { width, height, wallThickness, cells } = defaultTuning.arena
    // The camera looks from the south-east, down by its elevation: a thing `tall` hides the floor up to this far to its north-west.
    const hidden = (tall: number) => tall / Math.tan(elevation(projection))
    for (const [id, look] of Object.entries(arenaLooks)) {
      for (const piece of look.surround?.backdrop ?? []) {
        const { x, y } = piece.at
        const at = `${id}: ${piece.model} at ${x}, ${y}`
        expect(x < -wallThickness || y < -wallThickness || x > width + wallThickness || y > height + wallThickness, at).toBe(true)
        const reach = hidden((models[piece.model].height ?? 0) * look.unitsPerMeter * (piece.scale ?? 1)) * Math.SQRT1_2
        for (let step = 0; step <= 20; step++) {
          const covered = { x: x - (reach * step) / 20, y: y - (reach * step) / 20 }
          expect(covered.x > 0 && covered.x < width && covered.y > 0 && covered.y < height, at).toBe(false)
        }
      }
      if (look.floor.kind !== "tiles") continue
      for (const inlay of look.floor.inlays ?? []) {
        expect(inlay.column >= 0 && inlay.column < cells && inlay.row >= 0 && inlay.row < cells, `${id}: ${inlay.model}`).toBe(true)
      }
    }
  })
})
