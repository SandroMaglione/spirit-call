import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import type { ArenaId } from "../src/content/arena.ts"
import { propBoxes } from "../src/features/arena.ts"
import { arenaLooks, characterLooks, enemyLooks, modelsInLooks } from "../src/presentation/looks.ts"
import { enemies } from "../src/content/enemies.ts"
import type { EnemyKind } from "../src/content/enemies.ts"
import type { Moments, Shot } from "../src/presentation/looks.ts"
import { models } from "../src/presentation/models.ts"
import type { ClipTiming, ModelId, ModelSpec } from "../src/presentation/models.ts"

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
      if (look.wardClip !== undefined) {
        expect(enemies[kind].ward, `${kind}: needs a simulated ward`).not.toBeNull()
        const clips: Readonly<Record<string, ClipTiming>> = models[look.model].clips
        expect(clips[look.wardClip], `${kind}: ward clip`).toBeDefined()
      }
      for (const [attack, phases] of Object.entries(look.attackClips ?? {})) {
        expect(enemies[kind].attacks.some((spec) => spec.id === attack), `${kind}/${attack}`).toBe(true)
        const clips: Readonly<Record<string, ClipTiming>> = models[look.model].clips
        for (const clip of Object.values(phases)) expect(clips[clip], `${kind}/${attack}/${clip}`).toBeDefined()
      }
    }
  })

  it("every arena prop has its look, a model about the size of what blocks", () => {
    for (const id of Object.keys(arenaLooks) as Array<ArenaId>) {
      const look = arenaLooks[id]
      const boxes = propBoxes(defaultTuning, id)
      expect(look.props?.length ?? 0, id).toBe(boxes.length)
      boxes.forEach((box, index) => {
        const prop = look.props![index]!
        // The model's footprint, turned, as the box around it.
        const spec: ModelSpec = models[prop.model]
        const [sizeX, sizeZ] = spec.footprint!
        const cos = Math.abs(Math.cos(prop.turn))
        const sin = Math.abs(Math.sin(prop.turn))
        const across = (sizeX * cos + sizeZ * sin) * look.unitsPerMeter
        const down = (sizeX * sin + sizeZ * cos) * look.unitsPerMeter
        const at = `${id}: prop ${index + 1} (${prop.model})`
        for (const [blocked, shown] of [[box.maxX - box.minX, across], [box.maxY - box.minY, down]] as const) {
          expect(blocked / shown, at).toBeGreaterThan(0.65)
          expect(blocked / shown, at).toBeLessThan(1.15)
        }
      })
    }
  })

  it("floor inlays lie on the floor's tiles", () => {
    for (const [id, look] of Object.entries(arenaLooks)) {
      if (look.floor.kind !== "tiles") continue
      for (const inlay of look.floor.inlays ?? []) {
        expect(inlay.column >= 0 && inlay.column < defaultTuning.arena.cells && inlay.row >= 0 && inlay.row < defaultTuning.arena.cells, `${id}: ${inlay.model}`).toBe(true)
      }
    }
  })

  it("only small study details are nonblocking indoors, and exterior structures stand on the apron", () => {
    for (const [id, look] of Object.entries(arenaLooks)) {
      for (const piece of look.scenery) {
        if (!piece.model.includes("Study")) continue
        const spec: ModelSpec = models[piece.model]
        const [x, z] = spec.footprint!
        const across = (Math.abs(Math.cos(piece.turn)) * x + Math.abs(Math.sin(piece.turn)) * z) * look.unitsPerMeter
        const down = (Math.abs(Math.sin(piece.turn)) * x + Math.abs(Math.cos(piece.turn)) * z) * look.unitsPerMeter
        const { width, height, cells, wallThickness } = defaultTuning.arena
        const indoors = piece.at.x > 0 && piece.at.x < width && piece.at.y > 0 && piece.at.y < height
        const at = `${id}: ${piece.model}`
        if (indoors) {
          expect(spec.height, at).toBeLessThan(0.4)
        } else {
          expect(look.floor.kind, at).toBe("tiles")
          if (look.floor.kind !== "tiles") continue
          const apron = look.floor.apronTiles ?? 0
          expect(piece.at.x - across / 2, at).toBeGreaterThanOrEqual(-apron * width / cells)
          expect(piece.at.y - down / 2, at).toBeGreaterThanOrEqual(-apron * height / cells)
          expect(piece.at.x + across / 2, at).toBeLessThanOrEqual(width + apron * width / cells)
          expect(piece.at.y + down / 2, at).toBeLessThanOrEqual(height + apron * height / cells)
          expect(piece.at.x + across / 2 < -wallThickness || piece.at.y + down / 2 < -wallThickness || piece.at.x - across / 2 > width + wallThickness || piece.at.y - down / 2 > height + wallThickness, at).toBe(true)
        }
      }
    }
  })
})
