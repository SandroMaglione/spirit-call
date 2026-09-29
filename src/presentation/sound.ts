/**
 * Game sounds synthesized live with Web Audio (no audio files), in the spirit
 * of cuelume: one lazy `AudioContext`, a master volume and a compressor so
 * overlapping sounds do not clip, and each sound built from a few oscillator
 * tones and filtered noise bursts. Repeated sounds vary their pitch slightly
 * and are rate-limited, so a crowd of hits stays readable.
 *
 * Browsers start audio suspended: the board unlocks on the first pointer or
 * key press. Mute is remembered in localStorage.
 */
export type SoundName =
  | "slash"
  | "wave"
  | "hit"
  | "kill"
  | "hurt"
  | "death"
  | "dash"
  | "nova"
  | "boom"
  | "throw"
  | "shot"
  | "block"
  | "waveStart"

export interface SoundBoard {
  /** Plays a sound now; a no-op while muted, locked, or without Web Audio. */
  play(name: SoundName, options?: { readonly volume?: number }): void
  readonly muted: () => boolean
  setMuted(muted: boolean): void
}

/** The loudest a single sound plays, before the master volume. */
const masterVolume = 0.55
/** The same sound plays at most once per this many seconds. */
const minInterval: Partial<Record<SoundName, number>> = { hit: 0.035, kill: 0.05, shot: 0.05, block: 0.05 }
const storageKey = "shooter.muted"

interface Voice {
  readonly context: AudioContext
  readonly out: AudioNode
  readonly noise: AudioBuffer
  /** Start time and pitch factor for this play. */
  readonly at: number
  readonly pitch: number
  readonly volume: number
}

/** A tone gliding from `from` to `to` Hz, with a fast attack and exponential decay. */
const tone = (voice: Voice, type: OscillatorType, from: number, to: number, duration: number, gain: number, delay = 0): void => {
  const { context, at } = voice
  const start = at + delay
  const oscillator = context.createOscillator()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(from * voice.pitch, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to * voice.pitch), start + duration)
  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain * voice.volume, start + Math.min(0.01, duration / 4))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope).connect(voice.out)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

/** A noise burst through a filter whose frequency glides from `from` to `to` Hz. */
const noise = (voice: Voice, filter: BiquadFilterType, from: number, to: number, duration: number, gain: number, q = 1, delay = 0): void => {
  const { context, at } = voice
  const start = at + delay
  const source = context.createBufferSource()
  source.buffer = voice.noise
  const shape = context.createBiquadFilter()
  shape.type = filter
  shape.Q.value = q
  shape.frequency.setValueAtTime(from * voice.pitch, start)
  shape.frequency.exponentialRampToValueAtTime(Math.max(1, to * voice.pitch), start + duration)
  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain * voice.volume, start + Math.min(0.012, duration / 4))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(shape).connect(envelope).connect(voice.out)
  source.start(start, Math.random() * 0.5)
  source.stop(start + duration + 0.02)
}

const voices: Record<SoundName, (voice: Voice) => void> = {
  // Airy whoosh with a short metallic edge.
  slash: (v) => {
    noise(v, "bandpass", 3200, 700, 0.14, 0.55, 1.4)
    tone(v, "triangle", 1400, 500, 0.07, 0.07)
  },
  // A longer, rising cut with a ringing tail.
  wave: (v) => {
    noise(v, "bandpass", 1500, 5200, 0.3, 0.5, 1.1)
    tone(v, "sawtooth", 300, 900, 0.22, 0.06)
    tone(v, "sine", 1200, 1500, 0.35, 0.05, 0.08)
  },
  // A dull thump with a crack on top.
  hit: (v) => {
    tone(v, "sine", 190, 60, 0.12, 0.55)
    noise(v, "highpass", 2400, 1800, 0.045, 0.25)
  },
  // A heavier thump that falls away.
  kill: (v) => {
    tone(v, "sine", 150, 38, 0.28, 0.7)
    noise(v, "lowpass", 1400, 180, 0.24, 0.4)
    tone(v, "triangle", 620, 180, 0.16, 0.08, 0.02)
  },
  // The player is hit: a low buzz, meant to be unpleasant.
  hurt: (v) => {
    tone(v, "square", 210, 80, 0.2, 0.18)
    noise(v, "lowpass", 900, 250, 0.18, 0.35)
  },
  death: (v) => {
    tone(v, "sawtooth", 330, 45, 0.9, 0.2)
    noise(v, "lowpass", 1600, 120, 0.8, 0.35)
  },
  dash: (v) => noise(v, "lowpass", 700, 2600, 0.16, 0.3, 0.7),
  // The ultimate: a deep boom with a long rumble.
  nova: (v) => {
    tone(v, "sine", 95, 28, 0.9, 0.9)
    noise(v, "lowpass", 3500, 160, 0.8, 0.55)
    tone(v, "triangle", 440, 880, 0.3, 0.07)
  },
  boom: (v) => {
    tone(v, "sine", 120, 40, 0.5, 0.7)
    noise(v, "lowpass", 2200, 260, 0.45, 0.45)
  },
  throw: (v) => noise(v, "bandpass", 1300, 600, 0.12, 0.22, 1.2),
  shot: (v) => tone(v, "square", 880, 420, 0.05, 0.07),
  // A shield turning a shot: a short glassy clink.
  block: (v) => {
    tone(v, "triangle", 1900, 1700, 0.08, 0.16)
    tone(v, "sine", 2800, 2600, 0.06, 0.06)
  },
  // A new wave: two rising notes.
  waveStart: (v) => {
    tone(v, "sine", 523, 523, 0.22, 0.18)
    tone(v, "sine", 784, 784, 0.3, 0.18, 0.13)
  }
}

/**
 * The browser's sound board. `unlockHost` (usually `window`) resumes audio on
 * the first pointer or key press, as browsers require.
 */
export const createSoundBoard = (unlockHost: Window): SoundBoard => {
  let context: AudioContext | undefined
  let out: AudioNode | undefined
  let noiseBuffer: AudioBuffer | undefined
  let muted = unlockHost.localStorage.getItem(storageKey) === "1"
  const last = new Map<SoundName, number>()

  const ensure = (): AudioContext | undefined => {
    if (context !== undefined) return context
    if (typeof AudioContext === "undefined") return undefined
    const audio = new AudioContext()
    const master = audio.createGain()
    master.gain.value = masterVolume
    const compressor = audio.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.ratio.value = 6
    master.connect(compressor).connect(audio.destination)
    const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1
    context = audio
    out = master
    noiseBuffer = buffer
    return audio
  }

  const unlock = () => {
    const audio = ensure()
    if (audio !== undefined && audio.state === "suspended") void audio.resume().catch(() => {})
  }
  unlockHost.addEventListener("pointerdown", unlock)
  unlockHost.addEventListener("keydown", unlock)

  return {
    play(name, options = {}) {
      if (muted || context === undefined || out === undefined || noiseBuffer === undefined || context.state !== "running") return
      const now = context.currentTime
      const previous = last.get(name)
      if (previous !== undefined && now - previous < (minInterval[name] ?? 0.02)) return
      last.set(name, now)
      voices[name]({ context, out, noise: noiseBuffer, at: now + 0.005, pitch: 0.94 + Math.random() * 0.12, volume: options.volume ?? 1 })
    },
    muted: () => muted,
    setMuted(next) {
      muted = next
      unlockHost.localStorage.setItem(storageKey, next ? "1" : "0")
    }
  }
}
