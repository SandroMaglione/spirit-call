/**
 * `?perf`'s samples: raw numbers for every displayed frame (not the
 * smoothed `host.stats`), kept on `window.__perf` for `scripts/perf.ts` to
 * read, and a small summary card when the scene's script ends, for someone
 * running it on a phone. Nothing is drawn while it measures.
 */

/** What is measured each frame, in this order. */
export const perfFields = [
  /** Milliseconds since the page started (`performance.now()`). */
  "t",
  /** Milliseconds since the previous frame. */
  "interval",
  /** Milliseconds in simulation steps this frame, and in drawing it. */
  "simMs",
  "drawMs",
  /** Fixed steps run this frame. */
  "steps",
  /** The renderer: draw calls and triangles this frame, and shader programs compiled so far. */
  "calls",
  "triangles",
  "programs",
  /** Effects alive: particles and floating numbers. */
  "particles",
  "numbers",
  /** Sounds: plays still sounding, plays started this frame, and audio nodes made this frame. */
  "voices",
  "started",
  "nodes",
  /** Whether the heat haze bent this frame (1 or 0). */
  "haze",
  /** Hits the simulation dealt this frame. */
  "hits"
] as const
export type PerfField = (typeof perfFields)[number]
export type PerfFrame = Record<PerfField, number>

export interface PerfRecord {
  readonly scene: string
  readonly enemies: number
  /** The WebGL renderer as the browser names it (a software one makes frame times noisy). */
  gpu: string
  /** Whether the scene's script is running, and whether it ended. */
  started: boolean
  done: boolean
  /** Frames recorded so far (the buffers keep the last `capacity`). */
  count: number
  readonly capacity: number
  readonly columns: Record<PerfField, Float64Array>
  push(frame: PerfFrame): void
  /** The recorded frames, oldest first, as plain arrays (for reading over the DevTools protocol). */
  frames(): Record<PerfField, Array<number>>
  finish(mount: HTMLElement): void
}

/** Starts recording on `window.__perf`. */
export const startPerfRecord = (scene: string, enemies: number, capacity = 30_000): PerfRecord => {
  const columns = Object.fromEntries(perfFields.map((field) => [field, new Float64Array(capacity)])) as Record<PerfField, Float64Array>
  const record: PerfRecord = {
    scene,
    enemies,
    gpu: "",
    started: false,
    done: false,
    count: 0,
    capacity,
    columns,
    push(frame) {
      const at = record.count % capacity
      for (const field of perfFields) columns[field][at] = frame[field]
      record.count += 1
    },
    frames() {
      const length = Math.min(record.count, capacity)
      const first = record.count - length
      return Object.fromEntries(perfFields.map((field) => [field, Array.from({ length }, (_, index) => columns[field][(first + index) % capacity]!)])) as Record<PerfField, Array<number>>
    },
    finish(mount) {
      record.done = true
      const frames = record.frames()
      // The first 3 seconds warm up (loading, first compiles), as `pnpm perf` skips them.
      const from = frames.t.findIndex((t) => t >= (frames.t[0] ?? 0) + 3000)
      const intervals = frames.interval.slice(Math.max(0, from)).sort((a, b) => a - b)
      const at = (q: number) => (intervals[Math.floor(q * (intervals.length - 1))] ?? 0).toFixed(1)
      const card = document.createElement("pre")
      card.style.cssText = "position:fixed;left:8px;top:8px;z-index:99;margin:0;padding:8px 10px;background:#000c;color:#fff;font:12px/1.4 monospace;border-radius:6px;pointer-events:none"
      card.textContent = [
        `perf ${scene}, ${enemies} enemies (${intervals.length} frames)`,
        `frame ms p50 ${at(0.5)}  p95 ${at(0.95)}  p99 ${at(0.99)}`,
        `over 20 ms: ${intervals.filter((ms) => ms > 20).length}  over 33 ms: ${intervals.filter((ms) => ms > 33).length}`,
        record.gpu
      ].join("\n")
      mount.append(card)
    }
  }
  Object.assign(window, { __perf: record })
  return record
}
