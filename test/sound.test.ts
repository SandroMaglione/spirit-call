import { afterEach, describe, expect, it, vi } from "vitest"

import { createSoundBoard } from "../src/presentation/sound.ts"
import type { SoundName } from "../src/presentation/sound.ts"

/**
 * A stand-in for Web Audio that checks what the board schedules the way
 * browsers do: exponential ramps to zero or below, and non-finite values,
 * throw.
 */
const fakeAudio = () => {
  const started: Array<string> = []
  const param = (value = 1) => {
    const check = (next: number, time: number) => {
      if (!Number.isFinite(next) || !Number.isFinite(time)) throw new RangeError(`non-finite ${next} at ${time}`)
    }
    return {
      value,
      setValueAtTime: (next: number, time: number) => check(next, time),
      linearRampToValueAtTime: (next: number, time: number) => check(next, time),
      exponentialRampToValueAtTime: (next: number, time: number) => {
        check(next, time)
        if (next <= 0) throw new RangeError(`exponential ramp to ${next}`)
      },
      setTargetAtTime: (next: number, time: number, constant: number) => check(next, time + constant),
      cancelScheduledValues: () => {}
    }
  }
  const node = (kind: string, params: Record<string, ReturnType<typeof param>> = {}) => ({
    kind,
    ...params,
    connect: (target: unknown) => target,
    start: () => started.push(kind),
    stop: () => {}
  })
  class FakeContext {
    state = "running"
    currentTime = 1
    sampleRate = 8000
    destination = node("destination")
    createGain = () => node("gain", { gain: param() })
    createOscillator = () => ({ ...node("oscillator", { frequency: param() }), type: "sine" })
    createBiquadFilter = () => ({ ...node("filter", { frequency: param(), Q: param() }), type: "lowpass" })
    createBufferSource = () => ({ ...node("noise"), buffer: null })
    createWaveShaper = () => ({ ...node("shaper"), curve: null })
    createStereoPanner = () => node("pan", { pan: param(0) })
    createConvolver = () => ({ ...node("convolver"), buffer: null })
    createDynamicsCompressor = () => node("compressor", { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() })
    createBuffer = (channels: number, length: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length))
      return { getChannelData: (channel: number) => data[channel]! }
    }
    resume = () => Promise.resolve()
  }
  return { FakeContext, started }
}

const host = () => {
  const listeners = new Map<string, () => void>()
  return {
    window: {
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener)
    } as unknown as Window,
    press: () => listeners.get("pointerdown")?.()
  }
}

const names: ReadonlyArray<SoundName> = ["slash", "thrust", "spin", "wave", "hit", "heavyHit", "kill", "hurt", "death", "dash", "nova", "boom", "throw", "shot", "charging", "charged", "power", "block", "waveStart", "ignite", "splash", "sizzle", "slam", "disc"]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("sound board", () => {
  it("stays silent until a press unlocks audio", () => {
    const audio = fakeAudio()
    vi.stubGlobal("AudioContext", audio.FakeContext)
    const { window } = host()
    createSoundBoard(window).play("hit")
    expect(audio.started).toEqual([])
  })

  it("builds every sound with values Web Audio accepts, at any pitch, pan, and volume", () => {
    const audio = fakeAudio()
    vi.stubGlobal("AudioContext", audio.FakeContext)
    const { window, press } = host()
    const board = createSoundBoard(window)
    press()
    for (const name of names) {
      const before = audio.started.length
      board.play(name, { pitch: 1.2, pan: -3, volume: 0.5 })
      expect(audio.started.length, name).toBeGreaterThan(before)
    }
  })

  it("rate-limits repeats and stays quiet while muted", () => {
    const audio = fakeAudio()
    vi.stubGlobal("AudioContext", audio.FakeContext)
    const { window, press } = host()
    const board = createSoundBoard(window)
    press()
    board.play("hit")
    const once = audio.started.length
    board.play("hit")
    expect(audio.started.length).toBe(once)
    board.setMuted(true)
    board.play("slash")
    expect(audio.started.length).toBe(once)
    expect(board.muted()).toBe(true)
  })
})
