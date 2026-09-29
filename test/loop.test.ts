import { FixedLoop } from "@typeonce/bevy-ts-browser"
import { describe, expect, it } from "vitest"

import { engine } from "../src/config/tuning.ts"
import { doubleTap, start } from "./helpers.ts"

/**
 * Drives the simulation through the same fixed-step loop the browser uses,
 * with a fake display running at `hz`, until `steps` fixed steps have run.
 */
const runAt = (hz: number, steps: number) => {
  const run = start({
    keys: [
      { frame: 0, press: ["up", "right"] },
      ...doubleTap("right", 18, { hold: true }),
      { frame: 50, release: ["up"] },
      ...doubleTap("right", 88, { hold: true }),
      { frame: 140, release: ["right"] }
    ],
    pointer: [{ frame: 70, move: { x: 300, y: 500 } }]
  })
  let done = 0
  let frames = 0
  let onTick: ((tick: FixedLoop.Tick) => void) | undefined
  const loop = FixedLoop.start({
    source: FixedLoop.source((listener) => {
      onTick = listener
      return { stop: () => (onTick = undefined) }
    }),
    stepSeconds: engine.stepSeconds,
    maxFrameSeconds: engine.maxFrameSeconds,
    maxStepsPerFrame: engine.maxStepsPerFrame,
    update: () => {
      if (done >= steps) return { ok: true, value: undefined }
      done += 1
      return run.runtime.tick(run.fixedUpdate)
    },
    render: () => {
      frames += 1
    },
    onFailure: (failure) => {
      throw new Error(failure.kind)
    }
  })
  if (!loop.ok) throw new Error("loop")
  while (done < steps) onTick!({ deltaMS: 1000 / hz })
  loop.value.stop()
  return { player: run.player(), frames }
}

describe("frame-rate independence", () => {
  it("reaches the same state at 30, 60, 144, and 240 Hz", () => {
    const reference = runAt(60, 200)
    for (const hz of [30, 144, 240]) {
      const other = runAt(hz, 200)
      expect(other.player).toEqual(reference.player)
    }
    expect(runAt(144, 200).frames).toBeGreaterThan(reference.frames)
  })
})
