/**
 * Finding the way around walls: a flow field over a grid of cells. Every
 * open cell knows its distance to the goal along the shortest path over
 * its eight neighbors (never cutting a wall's corner), so each body asks
 * only which neighbor is closer. Cells are blocked where a body of
 * `clearance` would touch a wall.
 *
 * The walls are taken again only when they change, and distances are
 * worked out again only when the goal moves to another cell: one search
 * serves every body that follows the same goal.
 */
import type { Vec2 } from "../math/vec.ts"
import { circleOverlapsBox } from "./collide.ts"
import type { Box } from "./shapes.ts"

const diagonal = Math.SQRT2
/** A cell's eight neighbors, in this order: each one's step across (`dx`), down (`dy`), and its cost. Flat, so a search over thousands of cells allocates nothing. */
const dx = [1, -1, 0, 0, 1, 1, -1, -1] as const
const dy = [0, 0, 1, -1, 1, -1, 1, -1] as const
const cost = [1, 1, 1, 1, diagonal, diagonal, diagonal, diagonal] as const

/** A number that changes whenever the walls do (their count or any edge). */
const wallsKey = (boxes: ReadonlyArray<Box>, clearance: number): number => {
  let key = boxes.length * 7919 + clearance
  for (const box of boxes) key = (key * 31 + box.minX * 3 + box.minY * 5 + box.maxX * 7 + box.maxY * 11) % 1e9
  return key
}

export class FlowField {
  readonly cellSize: number
  private columns = 0
  private rows = 0
  private originX = 0
  private originY = 0
  private blocked = new Uint8Array(0)
  private distance = new Float64Array(0)
  private key = Number.NaN
  private goal = -1
  // The search's queue: a binary heap of cells (`heap`) by their distance when queued (`keys`), and the distance of the cell last popped.
  private heap: Array<number> = []
  private keys: Array<number> = []
  private popped = 0

  constructor(cellSize: number) {
    this.cellSize = cellSize
  }

  /** Takes `boxes` as the walls (cells a body of `clearance` would touch them are blocked), over the area they span. */
  setWalls(boxes: ReadonlyArray<Box>, clearance: number): void {
    const key = wallsKey(boxes, clearance)
    if (key === this.key) return
    this.key = key
    this.goal = -1
    if (boxes.length === 0) {
      this.columns = 0
      this.rows = 0
      return
    }
    const size = this.cellSize
    const minX = Math.min(...boxes.map((box) => box.minX))
    const minY = Math.min(...boxes.map((box) => box.minY))
    const maxX = Math.max(...boxes.map((box) => box.maxX))
    const maxY = Math.max(...boxes.map((box) => box.maxY))
    this.originX = minX
    this.originY = minY
    this.columns = Math.max(1, Math.ceil((maxX - minX) / size))
    this.rows = Math.max(1, Math.ceil((maxY - minY) / size))
    this.blocked = new Uint8Array(this.columns * this.rows)
    this.distance = new Float64Array(this.columns * this.rows)
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const center = { x: minX + (column + 0.5) * size, y: minY + (row + 0.5) * size }
        if (boxes.some((box) => circleOverlapsBox(center, clearance, box))) this.blocked[row * this.columns + column] = 1
      }
    }
  }

  /** The cell holding `at`, or -1 outside the grid. */
  private cellOf(at: Vec2): number {
    const column = Math.floor((at.x - this.originX) / this.cellSize)
    const row = Math.floor((at.y - this.originY) / this.cellSize)
    return column < 0 || row < 0 || column >= this.columns || row >= this.rows ? -1 : row * this.columns + column
  }

  /** Whether the step from `cell` by (dx, dy) stays in the grid on open cells, without cutting a corner. */
  private open(column: number, row: number, dx: number, dy: number): boolean {
    const x = column + dx
    const y = row + dy
    if (x < 0 || y < 0 || x >= this.columns || y >= this.rows || this.blocked[y * this.columns + x] === 1) return false
    return dx === 0 || dy === 0 || (this.blocked[row * this.columns + x] === 0 && this.blocked[y * this.columns + column] === 0)
  }

  /** Makes `goal` the place every way leads to (searching again only when it moved to another cell). */
  setGoal(goal: Vec2): void {
    const start = this.cellOf(goal)
    if (start === this.goal) return
    this.goal = start
    this.distance.fill(Infinity)
    if (start < 0) return
    // Dijkstra from the goal over open cells (the goal's own cell may be blocked: a player against a wall).
    this.heap.length = 0
    this.keys.length = 0
    this.distance[start] = 0
    this.push(start, 0)
    while (this.heap.length > 0) {
      const cell = this.pop()
      const queued = this.popped
      const here = this.distance[cell]!
      if (queued > here) continue
      const column = cell % this.columns
      const row = (cell - column) / this.columns
      for (let index = 0; index < 8; index++) {
        if (!this.open(column, row, dx[index]!, dy[index]!)) continue
        const next = (row + dy[index]!) * this.columns + column + dx[index]!
        const through = here + cost[index]!
        if (through >= this.distance[next]!) continue
        this.distance[next] = through
        this.push(next, through)
      }
    }
  }

  /** The way toward the goal from `at` (unit length), or `undefined` when there is none (outside the grid, or walled off). */
  way(at: Vec2): Vec2 | undefined {
    const cell = this.cellOf(at)
    if (cell < 0) return undefined
    const column = cell % this.columns
    const row = (cell - column) / this.columns
    let best = this.distance[cell]!
    let nearest = -1
    for (let index = 0; index < 8; index++) {
      if (!this.open(column, row, dx[index]!, dy[index]!)) continue
      const next = (row + dy[index]!) * this.columns + column + dx[index]!
      if (this.distance[next]! >= best) continue
      best = this.distance[next]!
      nearest = index
    }
    if (nearest === -1) return undefined
    const target = { x: this.originX + (column + dx[nearest]! + 0.5) * this.cellSize, y: this.originY + (row + dy[nearest]! + 0.5) * this.cellSize }
    const length = Math.hypot(target.x - at.x, target.y - at.y)
    return length > 1e-6 ? { x: (target.x - at.x) / length, y: (target.y - at.y) / length } : undefined
  }

  /** Queues `cell` at `key` (a cell queued again with a shorter distance leaves its old entry behind, skipped when popped). */
  private push(cell: number, key: number): void {
    const cells = this.heap
    const keys = this.keys
    let index = cells.length
    cells.push(cell)
    keys.push(key)
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (keys[parent]! <= key) break
      cells[index] = cells[parent]!
      keys[index] = keys[parent]!
      index = parent
    }
    cells[index] = cell
    keys[index] = key
  }

  /** The queued cell with the shortest distance (that distance left in `popped`). */
  private pop(): number {
    const cells = this.heap
    const keys = this.keys
    const top = cells[0]!
    this.popped = keys[0]!
    const cell = cells.pop()!
    const key = keys.pop()!
    if (cells.length === 0) return top
    let index = 0
    for (;;) {
      const left = index * 2 + 1
      if (left >= cells.length) break
      const right = left + 1
      const child = right < cells.length && keys[right]! < keys[left]! ? right : left
      if (keys[child]! >= key) break
      cells[index] = cells[child]!
      keys[index] = keys[child]!
      index = child
    }
    cells[index] = cell
    keys[index] = key
    return top
  }
}
