/**
 * A uniform spatial hash for broad-phase queries over circles.
 *
 * Rebuilt every step: `clear`, then `insert` each circle. Queries return
 * candidate indices (the caller's own numbering) whose cells overlap the
 * query box; callers run the exact test. Cell arrays are reused between
 * rebuilds, so a steady state allocates nothing per step.
 */
export class SpatialGrid {
  private readonly cells = new Map<number, Array<number>>()
  private readonly used: Array<Array<number>> = []
  private stamp: Int32Array = new Int32Array(64)
  private query = 0

  readonly cellSize: number

  constructor(cellSize: number) {
    this.cellSize = cellSize
  }

  private key(cx: number, cy: number): number {
    // Cells from -32768 to 32767 on each axis.
    return ((cx + 32768) << 16) | ((cy + 32768) & 0xffff)
  }

  clear(): void {
    for (const cell of this.used) cell.length = 0
    this.used.length = 0
  }

  /** Adds circle `index` covering `[x ± r] × [y ± r]`. */
  insert(index: number, x: number, y: number, r: number): void {
    const size = this.cellSize
    const minX = Math.floor((x - r) / size)
    const maxX = Math.floor((x + r) / size)
    const minY = Math.floor((y - r) / size)
    const maxY = Math.floor((y + r) / size)
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = this.key(cx, cy)
        let cell = this.cells.get(key)
        if (cell === undefined) {
          cell = []
          this.cells.set(key, cell)
        }
        if (cell.length === 0) this.used.push(cell)
        cell.push(index)
      }
    }
    if (index >= this.stamp.length) {
      const grown = new Int32Array(Math.max(index + 1, this.stamp.length * 2))
      grown.set(this.stamp)
      this.stamp = grown
    }
  }

  /**
   * Calls `visit` once for every circle whose cells overlap the box.
   */
  forEachIn(minX: number, minY: number, maxX: number, maxY: number, visit: (index: number) => void): void {
    const size = this.cellSize
    this.query += 1
    const query = this.query
    const x0 = Math.floor(minX / size)
    const x1 = Math.floor(maxX / size)
    const y0 = Math.floor(minY / size)
    const y1 = Math.floor(maxY / size)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(this.key(cx, cy))
        if (cell === undefined) continue
        for (let offset = 0; offset < cell.length; offset++) {
          const index = cell[offset]!
          if (this.stamp[index] === query) continue
          this.stamp[index] = query
          visit(index)
        }
      }
    }
  }
}
