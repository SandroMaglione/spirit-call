/**
 * Deterministic random numbers (mulberry32). State lives in the `Rng`
 * resource; systems draw through `Random`, then store `random.state` back.
 */
export class Random {
  state: number

  constructor(state: number) {
    this.state = state >>> 0
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  pick<T>(items: ReadonlyArray<T>): T {
    return items[Math.floor(this.next() * items.length)]!
  }
}
