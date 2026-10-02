import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { characterLooks, enemyLooks, modelsInLooks } from "../src/presentation/looks.ts"
import type { Moments } from "../src/presentation/looks.ts"
import { models } from "../src/presentation/models.ts"
import type { ModelId } from "../src/presentation/models.ts"

/** The clip names inside a GLB file (its JSON chunk), read without a renderer. */
const clipsInFile = (id: ModelId): ReadonlyArray<string> => {
  const file = readFileSync(path.join(import.meta.dirname, "..", models[id].url))
  expect(file.toString("latin1", 0, 4)).toBe("glTF")
  const length = file.readUInt32LE(12)
  expect(file.toString("latin1", 16, 20)).toBe("JSON")
  const json = JSON.parse(file.toString("utf8", 20, 20 + length)) as { animations?: ReadonlyArray<{ name: string }> }
  return (json.animations ?? []).map((animation) => animation.name)
}

const clipsOf = (moments: Moments): ReadonlyArray<string> => [
  moments.idle,
  moments.run.clip,
  ...(moments.attack ?? []),
  ...[moments.power, moments.dash, moments.windup, moments.hurt].filter((clip) => clip !== undefined),
  ...Object.values(moments.skills ?? {})
]

describe("looks and models", () => {
  it("each model file has exactly the clips its spec lists", () => {
    for (const id of Object.keys(models) as Array<ModelId>) {
      expect([...clipsInFile(id)].sort(), id).toEqual(Object.keys(models[id].clips).sort())
    }
  })

  it("each look's moments name clips its model has", () => {
    for (const look of [...Object.values(characterLooks), ...Object.values(enemyLooks)]) {
      if (look.kind !== "model" || look.moments === undefined) continue
      const clips = Object.keys(models[look.model].clips)
      for (const clip of clipsOf(look.moments)) expect(clips, `${look.model}: ${clip}`).toContain(clip)
      expect(look.moments.run.distance).toBeGreaterThan(0)
    }
  })

  it("use only registered models", () => {
    expect([...modelsInLooks()].every((id) => id in models)).toBe(true)
  })
})
