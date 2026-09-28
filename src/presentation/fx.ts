/**
 * Cosmetic effects driven by gameplay events: damage numbers, sparks, and
 * bursts. They live only in the renderer, advance in real time, and reuse
 * their display objects.
 */
import { Container, Graphics, Sprite, Text } from "pixi.js"

import type { Vec2 } from "../math/vec.ts"
import type { RenderAssets } from "./host-types.ts"

interface Particle {
  readonly sprite: Sprite
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

interface Ring {
  readonly graphic: Graphics
  x: number
  y: number
  radius: number
  color: number
  life: number
  maxLife: number
}

interface FloatingNumber {
  readonly text: Text
  x: number
  y: number
  life: number
  maxLife: number
}

export class Fx {
  private readonly layer: Container
  private readonly assets: RenderAssets
  private readonly particles: Array<Particle> = []
  private readonly freeParticles: Array<Particle> = []
  private readonly numbers: Array<FloatingNumber> = []
  private readonly freeNumbers: Array<FloatingNumber> = []
  private readonly rings: Array<Ring> = []
  private readonly freeRings: Array<Ring> = []
  private readonly squash: number

  constructor(layer: Container, assets: RenderAssets, squash: number) {
    this.layer = layer
    this.assets = assets
    this.squash = squash
  }

  /** A shockwave on the floor expanding to `radius` (screen pixels, squashed like the floor). */
  ring(at: Vec2, radius: number, color: number, life = 0.4): void {
    const ring = this.freeRings.pop() ?? (() => {
      const graphic = new Graphics()
      this.layer.addChild(graphic)
      return { graphic, x: 0, y: 0, radius: 0, color: 0, life: 0, maxLife: 1 }
    })()
    ring.x = at.x
    ring.y = at.y
    ring.radius = radius
    ring.color = color
    ring.life = life
    ring.maxLife = life
    ring.graphic.visible = true
    this.rings.push(ring)
  }

  /** Particles thrown out from `at` (projected coordinates). */
  burst(at: Vec2, options: { readonly color: number; readonly count: number; readonly speed: number; readonly size: number; readonly life: number }): void {
    for (let index = 0; index < options.count; index++) {
      const angle = (index / options.count) * Math.PI * 2 + Math.random() * 0.6
      const speed = options.speed * (0.5 + Math.random() * 0.7)
      const particle = this.freeParticles.pop() ?? this.newParticle()
      particle.x = at.x
      particle.y = at.y
      // Squashed vertically, like the floor they fly over.
      particle.vx = Math.cos(angle) * speed
      particle.vy = Math.sin(angle) * speed * 0.5 - options.speed * 0.25
      particle.life = options.life * (0.7 + Math.random() * 0.5)
      particle.maxLife = particle.life
      particle.size = options.size
      particle.sprite.tint = options.color
      particle.sprite.visible = true
      this.particles.push(particle)
    }
  }

  /** A number rising from `at` (projected coordinates). */
  number(at: Vec2, value: number, color: number): void {
    const entry = this.freeNumbers.pop() ?? this.newNumber()
    entry.text.text = String(Math.round(value))
    entry.text.tint = color
    entry.text.visible = true
    entry.x = at.x + (Math.random() - 0.5) * 12
    entry.y = at.y
    entry.life = 0.6
    entry.maxLife = 0.6
    this.numbers.push(entry)
  }

  update(dt: number): void {
    for (let index = this.rings.length - 1; index >= 0; index--) {
      const ring = this.rings[index]!
      ring.life -= dt
      ring.graphic.clear()
      if (ring.life <= 0) {
        ring.graphic.visible = false
        this.rings[index] = this.rings[this.rings.length - 1]!
        this.rings.pop()
        this.freeRings.push(ring)
        continue
      }
      const t = 1 - ring.life / ring.maxLife
      const radius = ring.radius * (0.25 + 0.75 * Math.sqrt(t))
      ring.graphic.ellipse(ring.x, ring.y, radius, radius * this.squash).stroke({ width: 10 * (1 - t) + 2, color: ring.color, alpha: 1 - t })
      ring.graphic.ellipse(ring.x, ring.y, radius, radius * this.squash).fill({ color: ring.color, alpha: 0.15 * (1 - t) })
    }
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index]!
      particle.life -= dt
      if (particle.life <= 0) {
        particle.sprite.visible = false
        this.particles[index] = this.particles[this.particles.length - 1]!
        this.particles.pop()
        this.freeParticles.push(particle)
        continue
      }
      const drag = Math.exp(-6 * dt)
      particle.vx *= drag
      particle.vy = particle.vy * drag + 260 * dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      const t = particle.life / particle.maxLife
      particle.sprite.position.set(particle.x, particle.y)
      particle.sprite.scale.set((particle.size * (0.4 + 0.6 * t)) / this.assets.discRadius)
      particle.sprite.alpha = t
    }
    for (let index = this.numbers.length - 1; index >= 0; index--) {
      const entry = this.numbers[index]!
      entry.life -= dt
      if (entry.life <= 0) {
        entry.text.visible = false
        this.numbers[index] = this.numbers[this.numbers.length - 1]!
        this.numbers.pop()
        this.freeNumbers.push(entry)
        continue
      }
      const t = 1 - entry.life / entry.maxLife
      entry.text.position.set(entry.x, entry.y - 40 - t * 34)
      entry.text.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
      entry.text.scale.set(t < 0.12 ? 1.3 - t * 2.5 : 1)
    }
  }

  get active(): number {
    return this.particles.length + this.numbers.length + this.rings.length
  }

  private newParticle(): Particle {
    const sprite = new Sprite(this.assets.disc)
    sprite.anchor.set(0.5)
    this.layer.addChild(sprite)
    return { sprite, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1 }
  }

  private newNumber(): FloatingNumber {
    const text = new Text({
      text: "",
      style: { fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 15, fontWeight: "700", fill: 0xffffff, stroke: { color: 0x0d1117, width: 4 } }
    })
    text.anchor.set(0.5)
    this.layer.addChild(text)
    return { text, x: 0, y: 0, life: 0, maxLife: 1 }
  }
}
