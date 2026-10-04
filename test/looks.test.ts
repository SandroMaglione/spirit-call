import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { characterLooks, enemyLooks, modelsInLooks } from "../src/presentation/looks.ts"
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
})
