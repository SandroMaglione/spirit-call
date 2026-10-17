/**
 * Cosmetic effects driven by gameplay events: damage numbers, sparks,
 * impact flashes, dust, and bursts. They live only in the renderer, advance
 * in real time, and reuse their display objects. They are drawn flat over
 * the scene, in projected coordinates (`toScreen`): what flies up moves up
 * the screen.
 *
 * A crowd hit by a whole team can set off hundreds of effects in one frame,
 * so they are capped (see `limits`): past a cap, more are not drawn. In
 * ordinary play nothing comes near them.
 */
import type { Group } from "three"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"

import { Digits } from "./digits.ts"
import { Particles } from "./particles.ts"
import { Shapes } from "./shapes.ts"

/**
 * How many effects there can be: particles alive, new particles in a frame
 * (past that, each throw is thinned, see `Fx.budgeted`), floating numbers
 * alive (past that, only important ones), flashes and rings alive.
 */
export const limits = { particles: 1024, particlesPerFrame: 300, numbers: 48, flashes: 64, rings: 32 }

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: number
  /** Downward pull (negative rises, like dust). */
  gravity: number
  drag: number
  /** Drawn this many times longer than wide, along its velocity (streaks). */
  stretch: number
  alpha: number
}

/** A bright disc that swells and fades at an impact. */
interface Flash {
  x: number
  y: number
  color: number
  radius: number
  life: number
  maxLife: number
}

interface Ring {
  x: number
  y: number
  radius: number
  color: number
  life: number
  maxLife: number
}

interface FloatingNumber {
  text: string
  color: number
  x: number
  y: number
  /** Sideways drift (pixels over its life), along the blow. */
  drift: number
  /** Resting scale; it pops in larger. */
  size: number
  life: number
  maxLife: number
  /** Kept over ordinary ones when there are too many (see `Fx.number`). */
  important: boolean
}

/** A bolt of lightning along `points` (projected coordinates), flickering as it fades. */
interface Bolt {
  points: ReadonlyArray<Vec2>
  color: number
  life: number
  maxLife: number
}

/**
 * Something drawn fresh every frame for `life` seconds, after `delay`: a
 * hammer swung up and down onto where it lands (see
 * `presentation/hammer.ts`), a skill's own look (see
 * `presentation/signatures.ts`). `paint` gets how far through its life it
 * is (0..1), a layer drawn over the floor's effects, and one that adds
 * light.
 */
interface Animation {
  readonly paint: Painter
  delay: number
  life: number
  readonly maxLife: number
}

/** What an animation draws each frame (see `Fx.animate`). */
export type Painter = (t: number, shapes: Shapes, glow: Shapes) => void

interface ParticleOptions {
  readonly color: number
  readonly size: number
  readonly life: number
  readonly gravity?: number
  readonly drag?: number
  readonly stretch?: number
  readonly alpha?: number
}

export class Fx {
  private readonly particles: Array<Particle> = []
  private readonly freeParticles: Array<Particle> = []
  private readonly numbers: Array<FloatingNumber> = []
  private readonly freeNumbers: Array<FloatingNumber> = []
  private readonly rings: Array<Ring> = []
  private readonly freeRings: Array<Ring> = []
  private readonly flashes: Array<Flash> = []
  private readonly freeFlashes: Array<Flash> = []
  private readonly bolts: Array<Bolt> = []
  private readonly animations: Array<Animation> = []
  private readonly pending: Array<{ delay: number; readonly run: () => void }> = []
  private readonly squash: number
  // Room up front for a crowd fight's worth, so a busy frame never re-creates their buffers mid-fight.
  private readonly ringShapes = new Shapes({ depthTest: false, order: 1, capacity: 16_384 })
  private readonly sheetShapes = new Shapes({ depthTest: false, order: 1, capacity: 16_384 })
  private readonly particleBatch = new Particles(limits.particles, 2)
  private readonly flashShapes = new Shapes({ depthTest: false, additive: true, order: 3, capacity: 16_384 })
  private readonly digits = new Digits(4)
  /** Particles thrown since the last `update`, against `limits.particlesPerFrame`. */
  private thrown = 0

  constructor(layer: Group, squash: number) {
    this.squash = squash
    layer.add(this.ringShapes.mesh, this.sheetShapes.mesh, this.particleBatch.mesh, this.flashShapes.mesh, this.digits.mesh)
  }

  /** A shockwave on the floor expanding to `radius` (screen pixels, squashed like the floor). */
  ring(at: Vec2, radius: number, color: number, life = 0.4): void {
    if (this.rings.length >= limits.rings) return
    const ring = this.freeRings.pop() ?? { x: 0, y: 0, radius: 0, color: 0, life: 0, maxLife: 1 }
    ring.x = at.x
    ring.y = at.y
    ring.radius = radius
    ring.color = color
    ring.life = life
    ring.maxLife = life
    this.rings.push(ring)
  }

  /** Particles thrown out from `at` (projected coordinates). */
  burst(at: Vec2, options: ParticleOptions & { readonly count: number; readonly speed: number }): void {
    const count = this.budgeted(options.count)
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.6
      const speed = options.speed * (0.5 + Math.random() * 0.7)
      // Squashed vertically, like the floor they fly over.
      this.emit(at, Math.cos(angle) * speed, Math.sin(angle) * speed * 0.5 - options.speed * 0.25, options)
    }
  }

  /**
   * Streaks thrown along `direction` (a unit vector on screen), within
   * `spread` radians of it: sparks flying off a blow.
   */
  sparks(at: Vec2, direction: Vec2, options: ParticleOptions & { readonly count: number; readonly speed: number; readonly spread: number }): void {
    const base = Math.atan2(direction.y, direction.x)
    const count = this.budgeted(options.count)
    for (let index = 0; index < count; index++) {
      const angle = base + (Math.random() * 2 - 1) * options.spread
      const speed = options.speed * (0.45 + Math.random() * 0.75)
      this.emit(at, Math.cos(angle) * speed, Math.sin(angle) * speed, { drag: 7, gravity: 380, ...options })
    }
  }

  /** A few slow, rising puffs of dust at `at`, kicked back along `direction`. */
  dust(at: Vec2, direction: Vec2, color: number): void {
    this.thrown += 1
    const speed = 30 + Math.random() * 40
    this.emit(
      { x: at.x + (Math.random() - 0.5) * 10, y: at.y + (Math.random() - 0.5) * 4 },
      -direction.x * speed,
      -direction.y * speed * 0.5 - 12,
      { color, size: 4 + Math.random() * 3, life: 0.35 + Math.random() * 0.2, gravity: -40, drag: 3, alpha: 0.45 }
    )
  }

  /** One particle drifting from `at` (projected coordinates) at (`vx`, `vy`) pixels per second: embers rising off a fire, drops falling off a soaked body. */
  mote(at: Vec2, vx: number, vy: number, options: ParticleOptions): void {
    this.thrown += 1
    this.emit(at, vx, vy, options)
  }

  /** A bright flash at `at` that swells to `radius` and fades over `life` seconds. */
  flash(at: Vec2, radius: number, color: number, life: number): void {
    if (this.flashes.length >= limits.flashes) return
    const flash = this.freeFlashes.pop() ?? { x: 0, y: 0, color: 0, radius: 0, life: 0, maxLife: 1 }
    flash.x = at.x
    flash.y = at.y
    flash.color = color
    flash.radius = radius
    flash.life = life
    flash.maxLife = life
    this.flashes.push(flash)
  }

  /** Lightning along `points` (projected coordinates), jagged and flickering, for `life` seconds. */
  bolt(points: ReadonlyArray<Vec2>, color: number, life = 0.2): void {
    if (points.length < 2) return
    this.bolts.push({ points, color, life, maxLife: life })
  }

  /** Draws `paint` every frame for `life` seconds, starting `delay` seconds from now (see `Painter`). */
  animate(life: number, paint: Painter, delay = 0): void {
    this.animations.push({ paint, delay, life, maxLife: life })
  }

  /** Runs `run` `delay` seconds from now (in real time, like every effect): the later beats of a look. */
  later(delay: number, run: () => void): void {
    if (delay <= 0) run()
    else this.pending.push({ delay, run })
  }

  /**
   * A number rising from `at` (projected coordinates) that pops in larger
   * than its resting `size` and drifts sideways by `drift` pixels.
   * While `limits.numbers` are up, an ordinary one does not show, and an
   * `important` one (a heavy blow, a kill, what the player takes) takes the
   * place of the oldest showing (an ordinary one first).
   */
  number(at: Vec2, value: number, color: number, options: { readonly size?: number; readonly drift?: number; readonly life?: number; readonly important?: boolean } = {}): void {
    const important = options.important === true
    if (this.numbers.length >= limits.numbers) {
      if (!important) return
      let oldest = 0
      const age = (entry: FloatingNumber) => (entry.important ? 1 : 2) + 1 - entry.life / entry.maxLife
      for (let index = 1; index < this.numbers.length; index++) if (age(this.numbers[index]!) > age(this.numbers[oldest]!)) oldest = index
      this.freeNumbers.push(this.numbers[oldest]!)
      this.numbers[oldest] = this.numbers[this.numbers.length - 1]!
      this.numbers.pop()
    }
    const entry = this.freeNumbers.pop() ?? { text: "", color: 0, x: 0, y: 0, drift: 0, size: 1, life: 0, maxLife: 1, important: false }
    entry.text = String(Math.max(0, Math.round(value)))
    entry.color = color
    entry.x = at.x + (Math.random() - 0.5) * 12
    entry.y = at.y
    entry.drift = options.drift ?? 0
    entry.size = options.size ?? 1
    entry.life = options.life ?? 0.6
    entry.maxLife = entry.life
    entry.important = important
    this.numbers.push(entry)
  }

  update(dt: number): void {
    this.thrown = 0
    for (let index = this.pending.length - 1; index >= 0; index--) {
      const beat = this.pending[index]!
      beat.delay -= dt
      if (beat.delay > 0) continue
      this.pending[index] = this.pending[this.pending.length - 1]!
      this.pending.pop()
      beat.run()
    }
    const flashes = this.flashShapes.clear()
    const sheets = this.sheetShapes.clear()
    for (let index = this.animations.length - 1; index >= 0; index--) {
      const animation = this.animations[index]!
      if (animation.delay > 0) {
        animation.delay -= dt
        continue
      }
      animation.life -= dt
      if (animation.life <= 0) {
        this.animations[index] = this.animations[this.animations.length - 1]!
        this.animations.pop()
        continue
      }
      animation.paint(1 - animation.life / animation.maxLife, sheets, flashes)
    }
    for (let index = this.flashes.length - 1; index >= 0; index--) {
      const flash = this.flashes[index]!
      flash.life -= dt
      if (flash.life <= 0) {
        this.flashes[index] = this.flashes[this.flashes.length - 1]!
        this.flashes.pop()
        this.freeFlashes.push(flash)
        continue
      }
      const t = 1 - flash.life / flash.maxLife
      flashes.fillCircle(flash.x, flash.y, flash.radius * (0.45 + 0.55 * Math.sqrt(t)), flash.color, (1 - t) * (1 - t))
    }
    // Bolts: each segment broken into a few kinks that jump about every frame, a colored glow around a white core.
    for (let index = this.bolts.length - 1; index >= 0; index--) {
      const bolt = this.bolts[index]!
      bolt.life -= dt
      if (bolt.life <= 0) {
        this.bolts[index] = this.bolts[this.bolts.length - 1]!
        this.bolts.pop()
        continue
      }
      const fade = bolt.life / bolt.maxLife
      for (let point = 1; point < bolt.points.length; point++) {
        const from = bolt.points[point - 1]!
        const to = bolt.points[point]!
        const length = Math.hypot(to.x - from.x, to.y - from.y)
        const kinks = Math.max(2, Math.round(length / 22))
        const normal = { x: -(to.y - from.y) / (length || 1), y: (to.x - from.x) / (length || 1) }
        let last = from
        for (let kink = 1; kink <= kinks; kink++) {
          const t = kink / kinks
          const jitter = kink === kinks ? 0 : (Math.random() * 2 - 1) * Math.min(14, length * 0.12)
          const next = { x: from.x + (to.x - from.x) * t + normal.x * jitter, y: from.y + (to.y - from.y) * t + normal.y * jitter }
          flashes.line(last.x, last.y, next.x, next.y, 9, bolt.color, 0.45 * fade)
          flashes.line(last.x, last.y, next.x, next.y, 3, 0xffffff, 0.9 * fade)
          last = next
        }
      }
    }
    const rings = this.ringShapes.clear()
    for (let index = this.rings.length - 1; index >= 0; index--) {
      const ring = this.rings[index]!
      ring.life -= dt
      if (ring.life <= 0) {
        this.rings[index] = this.rings[this.rings.length - 1]!
        this.rings.pop()
        this.freeRings.push(ring)
        continue
      }
      const t = 1 - ring.life / ring.maxLife
      const radius = ring.radius * (0.25 + 0.75 * Math.sqrt(t))
      rings.strokeEllipse(ring.x, ring.y, radius, radius * this.squash, 10 * (1 - t) + 2, ring.color, 1 - t)
      rings.fillEllipse(ring.x, ring.y, radius, radius * this.squash, ring.color, 0.15 * (1 - t))
    }
    const particles = this.particleBatch
    particles.clear()
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index]!
      particle.life -= dt
      if (particle.life <= 0) {
        this.particles[index] = this.particles[this.particles.length - 1]!
        this.particles.pop()
        this.freeParticles.push(particle)
        continue
      }
      const drag = Math.exp(-particle.drag * dt)
      particle.vx *= drag
      particle.vy = particle.vy * drag + particle.gravity * dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      const t = particle.life / particle.maxLife
      const size = particle.size * (0.4 + 0.6 * t)
      const alpha = t * particle.alpha
      if (particle.stretch > 1) {
        // Streaks point along their motion and shorten as they slow.
        const speed = Math.hypot(particle.vx, particle.vy)
        const length = size * Math.max(1, particle.stretch * Math.min(1, speed / 250))
        particles.ellipse(particle.x, particle.y, length, size * 0.6, particle.color, alpha, Math.atan2(particle.vy, particle.vx))
      } else {
        particles.disc(particle.x, particle.y, size, particle.color, alpha)
      }
    }
    const digits = this.digits
    digits.clear()
    for (let index = this.numbers.length - 1; index >= 0; index--) {
      const entry = this.numbers[index]!
      entry.life -= dt
      if (entry.life <= 0) {
        this.numbers[index] = this.numbers[this.numbers.length - 1]!
        this.numbers.pop()
        this.freeNumbers.push(entry)
        continue
      }
      const t = 1 - entry.life / entry.maxLife
      // Jumps up fast then hangs; pops in at 1.8x and settles by 15% of its life.
      const rise = 1 - (1 - t) * (1 - t)
      const alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
      const scale = entry.size * (t < 0.15 ? 1.8 - (t / 0.15) * 0.8 : 1)
      digits.write(entry.text, entry.x + entry.drift * rise, entry.y - 40 - rise * 38, scale, entry.color, alpha)
    }
  }

  /** Uploads this frame's shapes; called before rendering. */
  flush(): void {
    this.ringShapes.flush()
    this.sheetShapes.flush()
    this.particleBatch.flush()
    this.flashShapes.flush()
    this.digits.flush()
  }

  dispose(): void {
    for (const shapes of [this.ringShapes, this.sheetShapes, this.flashShapes]) shapes.dispose()
    this.particleBatch.dispose()
    this.digits.dispose()
  }

  get active(): number {
    return this.particles.length + this.numbers.length + this.rings.length + this.flashes.length + this.animations.length
  }

  /** How many particles and floating numbers are alive (for `?perf`'s samples). */
  get counts(): { readonly particles: number; readonly numbers: number } {
    return { particles: this.particles.length, numbers: this.numbers.length }
  }

  /**
   * How many of a throw of `count` particles this frame affords: all of
   * them within `limits.particlesPerFrame`; past it, what room is left, or
   * an eighth of the throw (a kill's burst still bigger than a hit's
   * sparks), and at least one, so nothing goes unseen.
   */
  private budgeted(count: number): number {
    const room = limits.particlesPerFrame - this.thrown
    const afforded = count <= room ? count : Math.max(1, room, Math.round(count / 8))
    this.thrown += afforded
    return afforded
  }

  private emit(at: Vec2, vx: number, vy: number, options: ParticleOptions): void {
    if (this.particles.length >= limits.particles) return
    const particle = this.freeParticles.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, color: 0, gravity: 0, drag: 0, stretch: 1, alpha: 1 }
    particle.x = at.x
    particle.y = at.y
    particle.vx = vx
    particle.vy = vy
    particle.life = options.life * (0.7 + Math.random() * 0.5)
    particle.maxLife = particle.life
    particle.size = options.size
    particle.color = options.color
    particle.gravity = options.gravity ?? 260
    particle.drag = options.drag ?? 6
    particle.stretch = options.stretch ?? 1
    particle.alpha = options.alpha ?? 1
    this.particles.push(particle)
  }
}
