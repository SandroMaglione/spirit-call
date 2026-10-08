/**
 * Game sounds synthesized live with Web Audio (no audio files).
 *
 * Each sound is a few layers built from small instruments:
 *
 * - `tone`: an oscillator gliding between two pitches (thuds, notes);
 * - `noise`: a filtered noise burst (air, debris);
 * - `swish`: noise through a band that follows the speed of a swing, rising
 *   to a peak and falling away, so a sword swing sounds like air cut by a
 *   blade rather than a static hiss;
 * - `crunch`: distorted band-passed noise (the crack of a blow landing);
 * - `metal`: inharmonic partials ringing out (a blade meeting a shield).
 *
 * Blows are layered like recorded impacts: a click for the contact, a thud
 * for the weight, a crunch for the texture. Heavy blows go deeper and longer.
 *
 * Everything plays into a small mixer: each sound is panned (by where it
 * happened on screen) and sends some of itself to a reverb generated at
 * startup (a decaying, darkening noise impulse), so sounds sit in a room.
 * Heavy sounds duck the others for a moment so they cut through; a
 * compressor keeps overlapping sounds from clipping. Repeated sounds are
 * rate-limited and vary their pitch slightly.
 *
 * Browsers start audio suspended: the board unlocks on the first pointer or
 * key press. Mute starts from `options.muted`; remembering it is the
 * profile's job (see `profile/store.ts`).
 */
export type SoundName =
  | "uiTap"
  | "uiSuccess"
  | "uiError"
  | "uiReward"
  | "victory"
  | "defeat"
  | "star"
  | "ultimateCall"
  | "ultimateRelease"
  | "sealCrack"
  | "sealBurst"
  | "sealRise"
  | "sealGold"
  | "sealCrumble"
  | "revealAspect"
  | "revealCharacter"
  | "slash"
  | "thrust"
  | "spin"
  | "wave"
  | "hit"
  | "heavyHit"
  | "kill"
  | "hurt"
  | "death"
  | "dash"
  | "switch"
  | "nova"
  | "boom"
  | "throw"
  | "shot"
  | "charging"
  | "charged"
  | "power"
  | "block"
  | "waveStart"
  | "ignite"
  | "splash"
  | "sizzle"
  | "slam"
  | "disc"
  | "zap"
  | "mend"
  | "crack"
  | "shatter"
  | "quake"

export interface PlayOptions {
  /** Loudness factor, 1 by default. */
  readonly volume?: number
  /** Pitch factor, 1 by default (a combo climbs through its moves). */
  readonly pitch?: number
  /** Stereo position, -1 (left) to 1 (right). */
  readonly pan?: number
}

export interface SoundBoard {
  /** Plays a sound now; a no-op while muted, locked, or without Web Audio. */
  play(name: SoundName, options?: PlayOptions): void
  readonly muted: () => boolean
  setMuted(muted: boolean): void
  /** The player's volume, 0..1 (1 by default), over every sound. */
  readonly volume: () => number
  setVolume(volume: number): void
}

/** The loudest a single sound plays, before the master volume. */
const masterVolume = 0.6
/** How loud the reverb returns. */
const reverbLevel = 0.9
/** Heavy sounds turn the others down to this, recovering over `duckRecovery` seconds. */
const duckDepth = 0.45
const duckRecovery = 0.18

interface Voice {
  readonly context: AudioContext
  /** Where this play's layers connect. */
  readonly out: AudioNode
  readonly noise: AudioBuffer
  readonly distortion: Float32Array<ArrayBuffer>
  /** Start time and pitch factor for this play. */
  readonly at: number
  readonly pitch: number
  readonly volume: number
}

/**
 * How each sound is mixed: `reverb` is how much it sends to the room,
 * `heavy` sounds duck the others, and `interval` rate-limits repeats.
 */
interface Mix {
  readonly reverb: number
  readonly heavy?: boolean
  readonly interval?: number
}

/** An envelope: silent, up to `gain` over `attack`, then down to silence at `start + duration`. */
const envelope = (voice: Voice, start: number, duration: number, gain: number, attack: number): GainNode => {
  const node = voice.context.createGain()
  node.gain.setValueAtTime(0.0001, start)
  node.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * voice.volume), start + Math.min(attack, duration * 0.9))
  node.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  return node
}

const noiseSource = (voice: Voice, start: number, duration: number): AudioBufferSourceNode => {
  const source = voice.context.createBufferSource()
  source.buffer = voice.noise
  source.start(start, Math.random() * 0.8)
  source.stop(start + duration + 0.02)
  return source
}

/** A tone gliding from `from` to `to` Hz, with a fast attack and exponential decay. */
const tone = (voice: Voice, type: OscillatorType, from: number, to: number, duration: number, gain: number, delay = 0, attack = 0.006): void => {
  const start = voice.at + delay
  const oscillator = voice.context.createOscillator()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(from * voice.pitch, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to * voice.pitch), start + duration)
  oscillator.connect(envelope(voice, start, duration, gain, attack)).connect(voice.out)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

/** A noise burst through a filter gliding from `from` to `to` Hz. */
const noise = (voice: Voice, filter: BiquadFilterType, from: number, to: number, duration: number, gain: number, q = 1, delay = 0, attack = 0.004): void => {
  const start = voice.at + delay
  const shape = voice.context.createBiquadFilter()
  shape.type = filter
  shape.Q.value = q
  shape.frequency.setValueAtTime(from * voice.pitch, start)
  shape.frequency.exponentialRampToValueAtTime(Math.max(1, to * voice.pitch), start + duration)
  noiseSource(voice, start, duration).connect(shape).connect(envelope(voice, start, duration, gain, attack)).connect(voice.out)
}

/**
 * A swing through the air. The blade speeds up, peaks at `peakAt` (a
 * fraction of the duration), and slows down: the band of noise it makes
 * rises from `low` to `peak` Hz and falls back, loudest at the peak.
 */
const swish = (voice: Voice, spec: { readonly low: number; readonly peak: number; readonly duration: number; readonly peakAt: number; readonly q: number; readonly gain: number; readonly delay?: number }): void => {
  const start = voice.at + (spec.delay ?? 0)
  const top = start + spec.duration * spec.peakAt
  const end = start + spec.duration
  const band = voice.context.createBiquadFilter()
  band.type = "bandpass"
  band.Q.value = spec.q
  band.frequency.setValueAtTime(spec.low * voice.pitch, start)
  band.frequency.exponentialRampToValueAtTime(spec.peak * voice.pitch, top)
  band.frequency.exponentialRampToValueAtTime(spec.low * 0.8 * voice.pitch, end)
  const level = voice.context.createGain()
  level.gain.setValueAtTime(0.0001, start)
  level.gain.exponentialRampToValueAtTime(spec.gain * voice.volume, top)
  level.gain.exponentialRampToValueAtTime(0.0001, end)
  noiseSource(voice, start, spec.duration).connect(band).connect(level).connect(voice.out)
}

/** Distorted band-passed noise: the crack of a blow. */
const crunch = (voice: Voice, from: number, to: number, duration: number, gain: number, delay = 0): void => {
  const start = voice.at + delay
  const band = voice.context.createBiquadFilter()
  band.type = "bandpass"
  band.Q.value = 1.4
  band.frequency.setValueAtTime(from * voice.pitch, start)
  band.frequency.exponentialRampToValueAtTime(Math.max(1, to * voice.pitch), start + duration)
  const drive = voice.context.createGain()
  drive.gain.value = 6
  const shaper = voice.context.createWaveShaper()
  shaper.curve = voice.distortion
  noiseSource(voice, start, duration).connect(band).connect(drive).connect(shaper).connect(envelope(voice, start, duration, gain, 0.002)).connect(voice.out)
}

/** A metallic ring: inharmonic partials of `base` Hz, the higher ones dying first. */
const metal = (voice: Voice, base: number, duration: number, gain: number, delay = 0): void => {
  const partials = [[1, 1, 1], [2.76, 0.6, 0.7], [5.4, 0.4, 0.45], [8.93, 0.25, 0.3]] as const
  for (const [ratio, level, length] of partials) {
    tone(voice, "sine", base * ratio, base * ratio * 0.998, duration * length, gain * level, delay, 0.002)
  }
}

/** The contact of a blow: a very short, bright tick. */
const click = (voice: Voice, gain: number): void => noise(voice, "highpass", 5000, 3000, 0.016, gain, 0.8, 0, 0.001)

const voices: Record<SoundName, readonly [Mix, (voice: Voice) => void]> = {
  uiTap: [{ reverb: 0.1, interval: 0.035 }, (v) => { tone(v, "sine", 880, 660, 0.055, 0.08) }],
  uiSuccess: [{ reverb: 0.25, interval: 0.12 }, (v) => { tone(v, "sine", 660, 990, 0.22, 0.12) }],
  uiError: [{ reverb: 0.05, interval: 0.15 }, (v) => { tone(v, "sine", 240, 180, 0.14, 0.1) }],
  uiReward: [{ reverb: 0.35, interval: 0.3 }, (v) => { tone(v, "sine", 880, 1320, 0.5, 0.16) }],
  // The Spirit Call's seal: stone cracking under the light, then bursting open with a rising shimmer.
  sealCrack: [{ reverb: 0.3, interval: 0.08 }, (v) => {
    crunch(v, 2200, 700, 0.14, 0.32)
    tone(v, "triangle", 150, 95, 0.22, 0.1)
  }],
  sealBurst: [{ reverb: 0.55, heavy: true, interval: 0.3 }, (v) => {
    noise(v, "bandpass", 300, 5200, 0.7, 0.32, 0.7, 0, 0.02)
    tone(v, "sine", 55, 40, 0.6, 0.22)
    tone(v, "sine", 440, 880, 0.8, 0.08, 0.05, 0.05)
    tone(v, "sine", 660, 1320, 0.9, 0.06, 0.1, 0.05)
  }],
  // An ultimate's moment: power drawn in (a rising, swelling hum with a whoosh pulled in), then let go (a deep blast with a bright crack on top).
  ultimateCall: [{ reverb: 0.6, interval: 0.8 }, (v) => {
    tone(v, "sawtooth", 110, 330, 0.95, 0.05, 0, 0.7)
    tone(v, "sine", 220, 660, 0.95, 0.07, 0, 0.7)
    noise(v, "bandpass", 300, 3800, 0.95, 0.14, 1.5, 0, 0.8)
  }],
  ultimateRelease: [{ reverb: 0.7, heavy: true, interval: 0.4 }, (v) => {
    tone(v, "sine", 80, 32, 0.8, 0.34, 0, 0.004)
    crunch(v, 3000, 400, 0.3, 0.3)
    noise(v, "lowpass", 2400, 200, 0.7, 0.24, 0.7, 0, 0.004)
    metal(v, 523, 1.1, 0.05, 0.02)
  }],
  // The light behind the seal turning purple: a shimmer swelling up. Turning gold: the room drops (a deep thud), then a bell rings out.
  sealRise: [{ reverb: 0.55, interval: 0.3 }, (v) => {
    noise(v, "bandpass", 900, 4200, 0.55, 0.12, 2, 0, 0.3)
    tone(v, "sine", 330, 660, 0.55, 0.07, 0, 0.3)
    tone(v, "sine", 495, 990, 0.55, 0.05, 0.04, 0.3)
  }],
  sealGold: [{ reverb: 0.7, heavy: true, interval: 0.5 }, (v) => {
    tone(v, "sine", 70, 38, 0.7, 0.3, 0, 0.005)
    noise(v, "lowpass", 400, 120, 0.4, 0.2, 0.7, 0, 0.005)
    metal(v, 784, 1.6, 0.07, 0.32)
    for (const [index, pitch] of [392, 494, 587, 784].entries()) tone(v, "sine", pitch, pitch, 1.4, 0.05, 0.32 + index * 0.05, 0.01)
  }],
  // A call that could not be made: the seal crumbling back to stone.
  sealCrumble: [{ reverb: 0.3, heavy: true, interval: 0.3 }, (v) => {
    crunch(v, 1400, 300, 0.35, 0.3)
    crunch(v, 900, 200, 0.3, 0.2, 0.12)
    tone(v, "triangle", 120, 60, 0.45, 0.12)
  }],
  // The results: a bright chord rising for a victory, two low falling notes for a defeat, a ping for each star.
  victory: [{ reverb: 0.55, interval: 0.5 }, (v) => {
    for (const [index, pitch] of [392, 523, 659, 784].entries()) tone(v, "triangle", pitch, pitch, 0.9, 0.07, index * 0.06, 0.01)
    noise(v, "highpass", 4000, 7000, 0.4, 0.05, 0.7, 0.18, 0.05)
  }],
  defeat: [{ reverb: 0.5, interval: 0.5 }, (v) => {
    tone(v, "triangle", 330, 311, 0.5, 0.08, 0, 0.02)
    tone(v, "triangle", 262, 233, 0.9, 0.08, 0.28, 0.02)
  }],
  star: [{ reverb: 0.45, interval: 0.1 }, (v) => {
    tone(v, "sine", 1047, 1047, 0.45, 0.09, 0, 0.004)
    tone(v, "sine", 1568, 1568, 0.3, 0.04, 0.02, 0.004)
    noise(v, "highpass", 6000, 8000, 0.12, 0.05, 0.7, 0, 0.002)
  }],
  // What came out: a rising third for an aspect, a full major arpeggio ringing out for a character.
  revealAspect: [{ reverb: 0.5, interval: 0.3 }, (v) => {
    for (const [index, pitch] of [440, 554, 659].entries()) tone(v, "sine", pitch, pitch, 0.7, 0.08, index * 0.07, 0.01)
  }],
  revealCharacter: [{ reverb: 0.65, interval: 0.4 }, (v) => {
    for (const [index, pitch] of [523, 659, 784, 1047, 1319].entries()) tone(v, "sine", pitch, pitch, 1.3, 0.085, index * 0.075, 0.01)
    tone(v, "triangle", 131, 131, 1.4, 0.07, 0, 0.05)
  }],
  // A side slash: the whoosh of the blade, a thin whistle riding on top, and a soft body of moving air.
  slash: [{ reverb: 0.12 }, (v) => {
    swish(v, { low: 650, peak: 3000, duration: 0.2, peakAt: 0.42, q: 1.2, gain: 0.8 })
    swish(v, { low: 1800, peak: 6800, duration: 0.16, peakAt: 0.48, q: 6, gain: 0.2, delay: 0.012 })
    noise(v, "lowpass", 900, 260, 0.2, 0.14, 0.7, 0, 0.08)
  }],
  // The thrust: shorter and sharper, peaking early.
  thrust: [{ reverb: 0.12 }, (v) => {
    swish(v, { low: 900, peak: 4200, duration: 0.13, peakAt: 0.28, q: 1.6, gain: 0.85 })
    swish(v, { low: 2400, peak: 8000, duration: 0.1, peakAt: 0.3, q: 7, gain: 0.18 })
    noise(v, "lowpass", 1400, 300, 0.12, 0.16, 0.7, 0, 0.02)
  }],
  // The finisher: a full turn, two passes of the blade over a low rush.
  spin: [{ reverb: 0.22 }, (v) => {
    swish(v, { low: 450, peak: 2300, duration: 0.3, peakAt: 0.35, q: 1, gain: 0.75 })
    swish(v, { low: 600, peak: 3400, duration: 0.26, peakAt: 0.5, q: 1.3, gain: 0.7, delay: 0.12 })
    swish(v, { low: 1600, peak: 6000, duration: 0.3, peakAt: 0.6, q: 6, gain: 0.16, delay: 0.1 })
    tone(v, "sine", 110, 60, 0.35, 0.18, 0, 0.08)
  }],
  // A cut (a cut skill): a long rising swish that rings.
  wave: [{ reverb: 0.35 }, (v) => {
    swish(v, { low: 800, peak: 5200, duration: 0.34, peakAt: 0.55, q: 1.1, gain: 0.75 })
    tone(v, "sine", 1100, 2300, 0.32, 0.045, 0.02, 0.1)
    metal(v, 1650, 0.5, 0.03, 0.12)
  }],
  // A blow landing: click, thud, crunch.
  hit: [{ reverb: 0.12, interval: 0.03 }, (v) => {
    click(v, 0.45)
    tone(v, "sine", 160, 55, 0.12, 0.65, 0, 0.002)
    crunch(v, 1500, 500, 0.07, 0.3)
    noise(v, "lowpass", 1800, 300, 0.09, 0.22)
  }],
  // A heavy blow: deeper, longer, with a sub drop and debris.
  heavyHit: [{ reverb: 0.3, heavy: true, interval: 0.06 }, (v) => {
    click(v, 0.6)
    tone(v, "sine", 120, 34, 0.34, 0.95, 0, 0.002)
    tone(v, "triangle", 75, 38, 0.3, 0.3, 0.005)
    crunch(v, 1100, 280, 0.15, 0.5)
    noise(v, "lowpass", 2600, 150, 0.36, 0.4)
  }],
  // An enemy breaking apart: a heavy thud, a crack, and a falling shatter.
  kill: [{ reverb: 0.28, heavy: true, interval: 0.05 }, (v) => {
    click(v, 0.5)
    tone(v, "sine", 140, 38, 0.28, 0.85, 0, 0.002)
    crunch(v, 1300, 350, 0.12, 0.45)
    noise(v, "bandpass", 3200, 800, 0.26, 0.22, 1.2, 0.025)
    tone(v, "triangle", 540, 140, 0.2, 0.07, 0.02)
  }],
  // The player is hit: a low buzz and a crack, meant to be unpleasant.
  hurt: [{ reverb: 0.1, heavy: true }, (v) => {
    tone(v, "square", 210, 80, 0.2, 0.12)
    tone(v, "sine", 130, 50, 0.16, 0.5, 0, 0.002)
    crunch(v, 900, 300, 0.1, 0.35)
  }],
  death: [{ reverb: 0.5, heavy: true }, (v) => {
    tone(v, "sawtooth", 330, 45, 0.9, 0.16)
    tone(v, "sine", 110, 30, 0.9, 0.6)
    noise(v, "lowpass", 1600, 120, 0.8, 0.35)
  }],
  dash: [{ reverb: 0.1 }, (v) => swish(v, { low: 380, peak: 1700, duration: 0.2, peakAt: 0.35, q: 0.8, gain: 0.35 })],
  // Another character comes onto the field: a quick airy sweep and a two-note chime.
  switch: [{ reverb: 0.3 }, (v) => {
    swish(v, { low: 900, peak: 3200, duration: 0.18, peakAt: 0.5, q: 1.1, gain: 0.18 })
    tone(v, "triangle", 660, 660, 0.12, 0.08)
    tone(v, "triangle", 990, 990, 0.18, 0.07, 0.07)
  }],
  // The ultimate: a deep boom with a long rumble and a shimmer.
  nova: [{ reverb: 0.5, heavy: true }, (v) => {
    click(v, 0.5)
    tone(v, "sine", 95, 26, 1, 0.95, 0, 0.003)
    noise(v, "lowpass", 4000, 120, 0.9, 0.55)
    crunch(v, 900, 200, 0.25, 0.35)
    metal(v, 660, 1.2, 0.05, 0.03)
    tone(v, "triangle", 440, 880, 0.35, 0.06)
  }],
  boom: [{ reverb: 0.4, heavy: true }, (v) => {
    tone(v, "sine", 115, 36, 0.5, 0.8, 0, 0.003)
    noise(v, "lowpass", 2600, 200, 0.5, 0.5)
    crunch(v, 1000, 250, 0.18, 0.35)
  }],
  throw: [{ reverb: 0.1 }, (v) => swish(v, { low: 700, peak: 1500, duration: 0.14, peakAt: 0.4, q: 1.2, gain: 0.25 })],
  shot: [{ reverb: 0.05, interval: 0.05 }, (v) => tone(v, "square", 880, 420, 0.05, 0.07)],
  // Charging a power attack: air drawn in, rising.
  charging: [{ reverb: 0.2 }, (v) => {
    swish(v, { low: 300, peak: 2400, duration: 0.6, peakAt: 0.95, q: 1.4, gain: 0.16 })
    tone(v, "sine", 180, 420, 0.6, 0.05, 0, 0.3)
  }],
  // A power attack released: a heavy whoosh over a deep punch.
  power: [{ reverb: 0.35, heavy: true }, (v) => {
    swish(v, { low: 250, peak: 2200, duration: 0.3, peakAt: 0.25, q: 0.9, gain: 0.5 })
    tone(v, "sine", 120, 40, 0.35, 0.6, 0, 0.003)
    noise(v, "lowpass", 1800, 200, 0.25, 0.3)
  }],
  // A power attack charged to full: a bright ring with a rising glint.
  charged: [{ reverb: 0.3 }, (v) => {
    metal(v, 1480, 0.35, 0.05)
    tone(v, "triangle", 740, 1480, 0.14, 0.07)
    tone(v, "sine", 1480, 1480, 0.3, 0.04, 0.08)
  }],
  // A blade meeting a shield: a clank that rings out.
  block: [{ reverb: 0.35, interval: 0.05 }, (v) => {
    click(v, 0.5)
    metal(v, 1250, 0.5, 0.16)
    noise(v, "bandpass", 3500, 2500, 0.06, 0.2, 3)
  }],
  // Catching fire: a soft rush of flame with a crackle.
  ignite: [{ reverb: 0.2, interval: 0.08 }, (v) => {
    noise(v, "bandpass", 700, 1800, 0.35, 0.3, 0.8, 0, 0.05)
    crunch(v, 2600, 1800, 0.06, 0.12, 0.05)
    crunch(v, 3200, 2000, 0.05, 0.1, 0.14)
  }],
  // Getting soaked: a splash, a low gulp and a spray.
  splash: [{ reverb: 0.2, interval: 0.08 }, (v) => {
    tone(v, "sine", 420, 160, 0.12, 0.25, 0, 0.004)
    noise(v, "bandpass", 2400, 900, 0.25, 0.3, 1.2)
  }],
  // Water meeting fire: a hiss of steam.
  sizzle: [{ reverb: 0.3, interval: 0.1 }, (v) => {
    noise(v, "highpass", 5200, 3000, 0.45, 0.32, 0.7, 0, 0.02)
    noise(v, "bandpass", 1600, 700, 0.3, 0.12, 1)
  }],
  // A body slammed into a wall: a deep thud and a crack of stone.
  slam: [{ reverb: 0.35, heavy: true, interval: 0.06 }, (v) => {
    click(v, 0.5)
    tone(v, "sine", 90, 30, 0.4, 0.9, 0, 0.002)
    crunch(v, 800, 220, 0.2, 0.5)
    noise(v, "lowpass", 1200, 100, 0.4, 0.35)
  }],
  // A disc thrown: a spinning whir rising and falling, with a faint metallic hum.
  disc: [{ reverb: 0.15, interval: 0.04 }, (v) => {
    swish(v, { low: 900, peak: 2600, duration: 0.22, peakAt: 0.3, q: 2.5, gain: 0.45 })
    swish(v, { low: 1400, peak: 3200, duration: 0.18, peakAt: 0.6, q: 4, gain: 0.2, delay: 0.06 })
    tone(v, "triangle", 620, 540, 0.2, 0.04)
  }],
  // Thunder striking: a sharp electric snap with a buzzing tail.
  zap: [{ reverb: 0.25, interval: 0.05 }, (v) => {
    click(v, 0.6)
    tone(v, "sawtooth", 1800, 320, 0.09, 0.12)
    noise(v, "bandpass", 4200, 1800, 0.14, 0.22, 2.5)
    tone(v, "square", 110, 95, 0.12, 0.05, 0.01)
  }],
  // A totem's healing zap: a soft, bright chime rising.
  mend: [{ reverb: 0.4, interval: 0.08 }, (v) => {
    tone(v, "sine", 880, 1320, 0.22, 0.12)
    tone(v, "triangle", 1320, 1760, 0.25, 0.06, 0.05)
  }],
  // Stone cracking: a dry snap and a short grind.
  crack: [{ reverb: 0.15, interval: 0.06 }, (v) => {
    click(v, 0.5)
    crunch(v, 2600, 900, 0.06, 0.35)
    noise(v, "bandpass", 1400, 600, 0.12, 0.16, 2)
  }],
  // Stone shattering: a deep crack, then gravel scattering.
  shatter: [{ reverb: 0.3, heavy: true, interval: 0.06 }, (v) => {
    click(v, 0.6)
    tone(v, "sine", 150, 40, 0.3, 0.8, 0, 0.002)
    crunch(v, 1900, 300, 0.18, 0.55)
    noise(v, "bandpass", 3600, 900, 0.32, 0.22, 1.5, 0.04)
    noise(v, "highpass", 6000, 3000, 0.22, 0.08, 0.8, 0.08)
  }],
  // The ground erupting: a deep rumble under a crack, gravel raining after.
  quake: [{ reverb: 0.45, heavy: true, interval: 0.05 }, (v) => {
    click(v, 0.5)
    tone(v, "sine", 85, 28, 0.55, 1)
    tone(v, "triangle", 60, 30, 0.45, 0.35, 0.01)
    crunch(v, 1300, 200, 0.25, 0.6)
    noise(v, "lowpass", 900, 80, 0.6, 0.45)
    noise(v, "bandpass", 3000, 1200, 0.35, 0.12, 1.4, 0.12)
  }],
  // A new wave: two rising notes.
  waveStart: [{ reverb: 0.4 }, (v) => {
    tone(v, "triangle", 523, 523, 0.25, 0.14)
    tone(v, "sine", 523, 523, 0.25, 0.08)
    tone(v, "triangle", 784, 784, 0.35, 0.14, 0.13)
    tone(v, "sine", 784, 784, 0.35, 0.08, 0.13)
  }]
}

/** A room: stereo noise decaying over `seconds`, darker as it fades (air absorbs the highs first). */
const roomImpulse = (context: AudioContext, seconds: number): AudioBuffer => {
  const length = Math.floor(context.sampleRate * seconds)
  const preDelay = Math.floor(context.sampleRate * 0.012)
  const impulse = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    let smooth = 0
    for (let index = preDelay; index < length; index++) {
      const t = (index - preDelay) / (length - preDelay)
      // A one-pole low-pass that closes over time.
      const darken = 0.15 + 0.8 * t
      smooth = smooth * darken + (Math.random() * 2 - 1) * (1 - darken)
      data[index] = smooth * Math.pow(1 - t, 3) * (1.6 + 2 * t)
    }
  }
  return impulse
}

/** A soft clipping curve for `crunch`. */
const distortionCurve = (): Float32Array<ArrayBuffer> => {
  const curve = new Float32Array(1024)
  for (let index = 0; index < curve.length; index++) {
    const x = (index / (curve.length - 1)) * 2 - 1
    curve[index] = Math.tanh(x * 3)
  }
  return curve
}

interface Mixer {
  readonly context: AudioContext
  /** Sounds that get ducked. */
  readonly bus: GainNode
  /** Heavy sounds, never ducked; its gain is the master volume. */
  readonly front: GainNode
  readonly reverb: AudioNode
  readonly noise: AudioBuffer
  readonly distortion: Float32Array<ArrayBuffer>
}

/**
 * The browser's sound board. `unlockHost` (usually `window`) resumes audio on
 * the first pointer or key press, as browsers require.
 */
export const createSoundBoard = (unlockHost: Window, options: { readonly muted?: boolean; readonly volume?: number } = {}): SoundBoard => {
  let mixer: Mixer | undefined
  let muted = options.muted ?? false
  let volume = clampVolume(options.volume ?? 1)
  const last = new Map<SoundName, number>()

  const ensure = (): Mixer | undefined => {
    if (mixer !== undefined) return mixer
    if (typeof AudioContext === "undefined") return undefined
    const context = new AudioContext()
    const master = context.createGain()
    master.gain.value = masterVolume * volume
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -16
    compressor.knee.value = 8
    compressor.ratio.value = 5
    compressor.attack.value = 0.002
    compressor.release.value = 0.12
    master.connect(compressor).connect(context.destination)
    const bus = context.createGain()
    bus.connect(master)
    const convolver = context.createConvolver()
    convolver.buffer = roomImpulse(context, 1.3)
    const reverbReturn = context.createGain()
    reverbReturn.gain.value = reverbLevel
    convolver.connect(reverbReturn).connect(master)
    const noise = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const samples = noise.getChannelData(0)
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1
    mixer = { context, bus, front: master, reverb: convolver, noise, distortion: distortionCurve() }
    return mixer
  }

  /** Turns the ducked bus down right away and lets it recover. */
  const duck = (bus: GainNode, now: number): void => {
    bus.gain.cancelScheduledValues(now)
    bus.gain.setValueAtTime(Math.min(bus.gain.value, 1), now)
    bus.gain.linearRampToValueAtTime(duckDepth, now + 0.01)
    bus.gain.setTargetAtTime(1, now + 0.05, duckRecovery / 3)
  }

  const unlock = () => {
    const audio = ensure()?.context
    if (audio !== undefined && audio.state === "suspended") void audio.resume().catch(() => {})
  }
  unlockHost.addEventListener("pointerdown", unlock)
  unlockHost.addEventListener("keydown", unlock)

  return {
    play(name, options = {}) {
      if (muted || mixer === undefined || mixer.context.state !== "running") return
      const { context } = mixer
      const [mix, build] = voices[name]
      const now = context.currentTime
      const previous = last.get(name)
      if (previous !== undefined && now - previous < (mix.interval ?? 0.02)) return
      last.set(name, now)

      // Per play: input -> pan -> dry bus, and a send to the room.
      const input = context.createGain()
      const pan = context.createStereoPanner()
      pan.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0))
      input.connect(pan).connect(mix.heavy === true ? mixer.front : mixer.bus)
      const send = context.createGain()
      send.gain.value = mix.reverb
      pan.connect(send).connect(mixer.reverb)
      if (mix.heavy === true) duck(mixer.bus, now)

      build({
        context,
        out: input,
        noise: mixer.noise,
        distortion: mixer.distortion,
        at: now + 0.005,
        pitch: (options.pitch ?? 1) * (0.96 + Math.random() * 0.08),
        volume: options.volume ?? 1
      })
    },
    muted: () => muted,
    setMuted(next) {
      muted = next
    },
    volume: () => volume,
    setVolume(next) {
      volume = clampVolume(next)
      if (mixer !== undefined) mixer.front.gain.setTargetAtTime(masterVolume * volume, mixer.context.currentTime, 0.02)
    }
  }
}

const clampVolume = (volume: number): number => (Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1)
