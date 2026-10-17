import { afterEach, describe, expect, it, vi } from "vitest"

import { createSoundBoard, limits } from "../src/presentation/sound.ts"
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
  const stopped: Array<string> = []
  const node = (kind: string, params: Record<string, ReturnType<typeof param>> = {}) => ({
    kind,
    ...params,
    connect: (target: unknown) => target,
    start: () => started.push(kind),
    stop: () => stopped.push(kind)
  })
  // Recording offline only counts the takes it makes; their starts are not plays.
  let recordings = 0
  class FakeOfflineContext {
    destination = node("destination")
    sampleRate: number
    length: number
    constructor(_channels: number, length: number, sampleRate: number) {
      this.length = length
      this.sampleRate = sampleRate
    }
    createGain = () => ({ ...node("gain", { gain: param() }), start: () => {} })
    createOscillator = () => ({ ...node("oscillator", { frequency: param() }), type: "sine", start: () => {} })
    createBiquadFilter = () => ({ ...node("filter", { frequency: param(), Q: param() }), type: "lowpass" })
    createBufferSource = () => ({ ...node("noise"), buffer: null, start: () => {} })
    createWaveShaper = () => ({ ...node("shaper"), curve: null })
    createStereoPanner = () => node("pan", { pan: param(0) })
    startRendering = () => {
      recordings += 1
      return Promise.resolve({ duration: this.length / this.sampleRate, length: this.length })
    }
  }
  const clock = { now: 1 }
  class FakeContext {
    state = "running"
    get currentTime() {
      return clock.now
    }
    sampleRate = 8000
    destination = node("destination")
    createGain = () => node("gain", { gain: param() })
    createOscillator = () => ({ ...node("oscillator", { frequency: param() }), type: "sine" })
    createBiquadFilter = () => ({ ...node("filter", { frequency: param(), Q: param() }), type: "lowpass" })
    createBufferSource = () => ({ ...node("noise"), buffer: null, playbackRate: param() })
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
  return { FakeContext, FakeOfflineContext, started, stopped, clock, recordings: () => recordings }
}

/** Every sound's takes (two), at every pitch recorded once audio unlocks: 40 sounds at one pitch, the 6 swings at 7. */
const allRecordings = 2 * (40 + 6 * 7)

/** An idle moment right away, with time to spare. */
const idleNow = (run: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void) => setTimeout(() => run({ didTimeout: false, timeRemaining: () => 50 }), 0)

/** Lets the plays asked for so far play (they play together once the moment that asked is over). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Waits, a moment at a time (at most `tries` of them), until `done`. */
const waitFor = (done: () => boolean, tries = 2000): Promise<void> => (done() || tries <= 0 ? Promise.resolve() : settle().then(() => waitFor(done, tries - 1)))

/** Plays `each` of `items` in turn, each in a moment of its own, then `after` it. */
const inTurn = <T>(items: ReadonlyArray<T>, each: (item: T) => () => void): Promise<void> =>
  items.reduce((before, item) => before.then(() => {
    const after = each(item)
    return settle().then(after)
  }), Promise.resolve())

const host = () => {
  const listeners = new Map<string, () => void>()
  return {
    window: {
      addEventListener: (type: string, listener: () => void) => {
        listeners.set(type, listener)
      }
    },
    press: () => listeners.get("pointerdown")?.()
  }
}

const names: ReadonlyArray<SoundName> = ["slash", "thrust", "spin", "wave", "hit", "heavyHit", "kill", "hurt", "death", "dash", "nova", "boom", "throw", "shot", "charging", "charged", "power", "block", "waveStart", "ignite", "splash", "sizzle", "slam", "disc", "zap", "mend"]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("sound board", () => {
  it("stays silent until a press unlocks audio", async () => {
    const audio = fakeAudio()
    vi.stubGlobal("AudioContext", audio.FakeContext)
    const { window } = host()
    createSoundBoard(window).play("hit")
    await settle()
    expect(audio.started).toEqual([])
  })

  it("builds every sound with values Web Audio accepts, at any pitch, pan, and volume", async () => {
    const audio = fakeAudio()
    vi.stubGlobal("AudioContext", audio.FakeContext)
    const { window, press } = host()
    const board = createSoundBoard(window)
    press()
    await inTurn(names, (name) => {
      const before = audio.started.length
      board.play(name, { pitch: 1.2, pan: -3, volume: 0.5 })
      return () => {
        audio.clock.now += 10
        expect(audio.started.length, name).toBeGreaterThan(before)
      }
    })
  })

  it("rate-limits repeats and stays quiet while muted", async () => {
    const audio = fakeAudio()
    vi.stubGlobal("AudioContext", audio.FakeContext)
    const { window, press } = host()
    const board = createSoundBoard(window)
    press()
    board.play("hit")
    await settle()
    const once = audio.started.length
    board.play("hit")
    await settle()
    expect(audio.started.length).toBe(once)
    board.setMuted(true)
    board.play("slash")
    await settle()
    expect(audio.started.length).toBe(once)
    expect(board.muted()).toBe(true)
  })

  it("records every sound once audio unlocks, and plays a recording through 4 nodes", async () => {
    const audio = fakeAudio()
    vi.stubGlobal("AudioContext", audio.FakeContext)
    vi.stubGlobal("OfflineAudioContext", audio.FakeOfflineContext)
    vi.stubGlobal("requestIdleCallback", idleNow)
    const { window, press } = host()
    const board = createSoundBoard(window)
    press()
    // A sound at a time, in idle moments.
    await waitFor(() => audio.recordings() >= allRecordings)
    expect(audio.recordings()).toBe(allRecordings)
    const before = board.stats()
    board.play("hit")
    await settle()
    const after = board.stats()
    expect(after.started - before.started).toBe(1)
    expect(after.nodes - before.nodes).toBe(4)
  })

  it("plays one of a sound asked for many times at once, and at most a few sounds at once", async () => {
    const audio = fakeAudio()
    vi.stubGlobal("AudioContext", audio.FakeContext)
    const { window, press } = host()
    const board = createSoundBoard(window)
    press()
    for (let index = 0; index < 12; index++) board.play("hit", { pan: index % 2 === 0 ? -1 : 1 })
    await settle()
    expect(board.stats().started).toBe(1)
    // Many different sounds in one frame: the most important first, and no more than the frame allows.
    for (const name of names) board.play(name)
    await settle()
    expect(board.stats().started).toBe(1 + limits.perFrame)
  })

  it("keeps at most so many sounding, an important one cutting the oldest other short", async () => {
    const audio = fakeAudio()
    vi.stubGlobal("AudioContext", audio.FakeContext)
    vi.stubGlobal("OfflineAudioContext", audio.FakeOfflineContext)
    vi.stubGlobal("requestIdleCallback", idleNow)
    const { window, press } = host()
    const board = createSoundBoard(window)
    press()
    await waitFor(() => audio.recordings() >= allRecordings)
    // The clock stands still: nothing ends. Ordinary sounds fill the room, then are refused.
    const ordinary = names.filter((name) => !["heavyHit", "kill", "nova", "boom", "slam", "quake", "death"].includes(name))
    await inTurn(ordinary, (name) => {
      board.play(name)
      return () => undefined
    })
    expect(board.stats().live).toBe(limits.voices)
    const started = board.stats().started
    board.play("kill")
    await settle()
    expect(board.stats().started).toBe(started + 1)
    expect(board.stats().live).toBe(limits.voices)
    expect(audio.stopped.length).toBeGreaterThan(0)
  })
})
