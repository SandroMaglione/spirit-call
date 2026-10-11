/**
 * How long frames take in the browser in the worst case: each performance
 * scene (`src/dev/perf-scene.ts`: a crowd hit by a whole team at once)
 * played in headless Chrome, at CPU slowdowns standing in for a phone.
 * Numbers come from the page's raw samples (`?perf`, see
 * `src/dev/perf-record.ts`), a CPU profile, and a trace, never from the
 * screen.
 *
 *   pnpm perf                          every scene at 1x, 4x, and 6x slowdown
 *   pnpm perf --label baseline         names the run (.data/perf/<label>.json)
 *   pnpm perf --compare .data/perf/baseline.json   prints the change from another run
 *   pnpm perf --scenes crowd --rates 4 --enemies 30
 *   pnpm perf --url http://localhost:5199   uses a dev server already running
 *
 * It starts `pnpm dev` on a free port (unless `--url`), and Chrome from
 * `CHROME_PATH` (or Playwright's), driven over the DevTools protocol with
 * Node's own WebSocket. Each run loads `?perf=<scene>,<enemies>` at
 * 1280×720, slows the CPU, skips 3 seconds of warm-up, then records until
 * the scene's script ends.
 *
 * Where Chrome draws WebGL in software (SwiftShader: the `gpu` line says
 * so), frame times are noisy and the GPU's work lands on the CPU: judge by
 * the main thread's JavaScript (the profile's busy time and top functions)
 * and the counters, which do not depend on the hardware.
 */
import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    label: { type: "string" },
    compare: { type: "string" },
    scenes: { type: "string", default: "crowd,crowd-fire,kills" },
    rates: { type: "string", default: "1,4,6" },
    enemies: { type: "string", default: "30" },
    url: { type: "string" },
    warmup: { type: "string", default: "3000" }
  }
})
const scenes = values.scenes.split(",")
const rates = values.rates.split(",").map(Number)
const enemies = Number(values.enemies)
const warmup = Number(values.warmup)
const label = values.label ?? new Date().toISOString().replace(/[:.]/g, "-")

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const freePort = () => new Promise<number>((resolve, reject) => {
  const server = createServer()
  server.listen(0, () => {
    const address = server.address()
    server.close(() => (typeof address === "object" && address !== null ? resolve(address.port) : reject(new Error("no port"))))
  })
})

/** Chrome: `CHROME_PATH`, or the newest that Playwright downloaded. */
const chromeBinary = (): string => {
  const given = process.env["CHROME_PATH"]
  if (given !== undefined && given !== "") return given
  for (const cache of [process.env["PLAYWRIGHT_BROWSERS_PATH"], path.join(homedir(), "Library/Caches/ms-playwright"), path.join(homedir(), ".cache/ms-playwright")]) {
    if (cache === undefined || !existsSync(cache)) continue
    const newest = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1])).at(-1)
    if (newest === undefined) continue
    for (const binary of ["chrome-linux/chrome", "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      if (existsSync(path.join(cache, newest, binary))) return path.join(cache, newest, binary)
    }
  }
  throw new Error("no Chrome found: set CHROME_PATH")
}

/** A DevTools protocol connection to the browser, with sessions for pages (flattened). */
const connect = async (url: string) => {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true })
    socket.addEventListener("error", reject, { once: true })
  })
  let nextId = 0
  const pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>()
  const listeners = new Set<(method: string, params: Record<string, unknown>, sessionId: string | undefined) => void>()
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown>; sessionId?: string }
    if (message.id !== undefined) {
      const waiting = pending.get(message.id)
      pending.delete(message.id)
      if (message.error !== undefined) waiting?.reject(new Error(message.error.message))
      else waiting?.resolve(message.result)
    } else if (message.method !== undefined) {
      for (const listener of listeners) listener(message.method, message.params ?? {}, message.sessionId)
    }
  })
  const send = <A = Record<string, unknown>>(method: string, params: object = {}, sessionId?: string): Promise<A> => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve: resolve as (result: unknown) => void, reject })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }))
  })
  return { send, listeners, close: () => socket.close() }
}

type Cdp = Awaited<ReturnType<typeof connect>>

interface TraceEvent {
  readonly name: string
  readonly ph: string
  readonly ts: number
  readonly dur?: number
  readonly pid: number
  readonly tid: number
  readonly args?: { readonly name?: string }
}

interface ProfileNode {
  readonly id: number
  readonly callFrame: { readonly functionName: string; readonly url: string; readonly lineNumber: number }
}

interface Profile {
  readonly nodes: ReadonlyArray<ProfileNode>
  readonly samples: ReadonlyArray<number>
  readonly timeDeltas: ReadonlyArray<number>
  readonly startTime: number
  readonly endTime: number
}

type Frames = Record<string, Array<number>>

/** What one scene at one slowdown measured. */
interface RunReport {
  readonly scene: string
  readonly rate: number
  readonly gpu: string
  readonly frames: number
  readonly seconds: number
  readonly frameMs: { readonly mean: number; readonly p50: number; readonly p95: number; readonly p99: number; readonly max: number }
  readonly over20: number
  readonly over33: number
  readonly simMs: number
  readonly drawMs: number
  readonly steps: number
  /** The main thread's busy time per frame (the profile's samples that were not idle). */
  readonly mainMs: number
  /** Of that, JavaScript (with garbage collection): all but the browser's native work, `(program)`. */
  readonly jsMs: number
  /**
   * JavaScript per fixed step: the same per frame depends on how many steps
   * a frame runs (with a software GPU frames are slow and every one catches
   * up the most steps it may), this does not.
   */
  readonly jsMsPerStep: number
  readonly maxCalls: number
  readonly meanCalls: number
  readonly maxTriangles: number
  readonly meanTriangles: number
  readonly programs: { readonly warm: number; readonly end: number }
  readonly maxParticles: number
  readonly maxNumbers: number
  readonly maxVoices: number
  readonly maxStarted: number
  readonly maxNodes: number
  readonly hazeShare: number
  readonly hits: number
  /** Hits over the whole script (warm-up included): the same as the Node benchmark's when the browser plays the same fight. */
  readonly allHits: number
  readonly gcShare: number
  /** The page's paints per frame (the HUD's layers and the canvas): what the compositor cannot do alone. */
  readonly paints: number
  readonly longTasks: number
  readonly longestTaskMs: number
  readonly top: ReadonlyArray<{ readonly name: string; readonly selfMs: number; readonly share: number }>
}

const quantile = (sorted: ReadonlyArray<number>, q: number) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0
const mean = (list: ReadonlyArray<number>) => (list.length === 0 ? 0 : list.reduce((sum, value) => sum + value, 0) / list.length)
const max = (list: ReadonlyArray<number>) => list.reduce((best, value) => Math.max(best, value), 0)

/**
 * Self time by function, from a CPU profile. `(program)` is the browser's
 * own native work (with a software GPU, mostly waiting on it): the shares
 * are of the rest, the JavaScript (garbage collection included).
 */
const topFunctions = (profile: Profile, frames: number) => {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const self = new Map<string, number>()
  let busy = 0
  let native = 0
  profile.samples.forEach((id, index) => {
    const node = byId.get(id)
    if (node === undefined) return
    const ms = (profile.timeDeltas[index + 1] ?? profile.timeDeltas[index] ?? 0) / 1000
    const { functionName, url, lineNumber } = node.callFrame
    if (functionName === "(idle)") return
    busy += ms
    if (functionName === "(program)") {
      native += ms
      return
    }
    const name = `${functionName || "(anonymous)"} ${url === "" ? "" : `${url.split("/").at(-1)?.split("?")[0]}:${lineNumber + 1}`}`.trim()
    self.set(name, (self.get(name) ?? 0) + ms)
  })
  const script = busy - native
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, ms]) => ({ name, selfMs: ms / Math.max(1, frames), share: ms / Math.max(1e-9, script) }))
  return { top, busyMsPerFrame: busy / Math.max(1, frames), scriptMsPerFrame: script / Math.max(1, frames) }
}

/** Plays `scene` at `rate`x slowdown in a new tab and reports it. */
const measure = async (cdp: Cdp, base: string, scene: string, rate: number): Promise<RunReport> => {
  const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true })
  const send = <A = Record<string, unknown>>(method: string, params: object = {}) => cdp.send<A>(method, params, sessionId)
  const evaluate = async <A>(expression: string): Promise<A> => {
    const result = await send<{ result: { value: A }; exceptionDetails?: { text: string } }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails !== undefined) throw new Error(`${expression}: ${result.exceptionDetails.text}`)
    return result.result.value
  }
  const until = async (expression: string, timeout: number) => {
    const started = Date.now()
    while (!(await evaluate<boolean>(expression).catch(() => false))) {
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${expression}`)
      await sleep(250)
    }
  }
  try {
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
    await send("Page.enable")
    await send("Runtime.enable")
    await send("Page.navigate", { url: `${base}/?perf=${scene},${enemies}` })
    // A key press unlocks the sound, as a player's first touch in the menus does (the scene's input is scripted, so it is not read);
    // the sounds are recorded then, so the fight is measured once they are (as a player's fights come after the menus).
    await until("window.__game !== undefined", 240_000)
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Control", code: "ControlLeft" })
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Control", code: "ControlLeft" })
    await until("window.__perf?.started === true", 240_000)
    await until("(window.__game.sounds.stats().toRecord ?? 0) === 0", 120_000).catch(() => console.error("  (the sounds were not all recorded in time)"))
    await send("Emulation.setCPUThrottlingRate", { rate })
    await sleep(warmup)
    // Recording: the page's samples from now, a CPU profile, and a trace for long tasks and garbage collection.
    const from = await evaluate<number>("performance.now()")
    const events: Array<TraceEvent> = []
    let traced: () => void = () => undefined
    const tracingDone = new Promise<void>((resolve) => (traced = resolve))
    const onEvent = (method: string, params: Record<string, unknown>, session: string | undefined) => {
      if (session !== sessionId) return
      if (method === "Tracing.dataCollected") events.push(...(params["value"] as Array<TraceEvent>))
      if (method === "Tracing.tracingComplete") traced()
    }
    cdp.listeners.add(onEvent)
    await send("Profiler.enable")
    await send("Profiler.setSamplingInterval", { interval: 500 })
    await send("Profiler.start")
    await send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8", "disabled-by-default-v8.gc"] }, transferMode: "ReportEvents" })
    await until("window.__perf?.done === true", 900_000)
    const to = await evaluate<number>("performance.now()")
    const { profile } = await send<{ profile: Profile }>("Profiler.stop")
    await send("Tracing.end")
    await tracingDone
    cdp.listeners.delete(onEvent)
    await send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const all = await evaluate<Frames>("window.__perf.frames()")
    const gpu = await evaluate<string>("window.__perf.gpu")
    const index = all["t"]!.map((t, at) => [t, at] as const).filter(([t]) => t >= from && t <= to).map(([, at]) => at)
    const column = (name: string) => index.map((at) => all[name]![at]!)
    const intervals = column("interval")
    const sorted = [...intervals].sort((a, b) => a - b)
    const frames = intervals.length
    // The renderer's main thread: the one named so in the trace's metadata.
    const main = events.find((event) => event.ph === "M" && event.name === "thread_name" && event.args?.name === "CrRendererMain")
    const onMain = events.filter((event) => main !== undefined && event.pid === main.pid && event.tid === main.tid && event.ph === "X" && event.dur !== undefined)
    const tasks = onMain.filter((event) => event.name === "RunTask")
    const gcMs = onMain.filter((event) => event.name === "MinorGC" || event.name === "MajorGC").reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000
    const { top, busyMsPerFrame, scriptMsPerFrame } = topFunctions(profile, frames)
    const programs = column("programs")
    return {
      scene,
      rate,
      gpu,
      frames,
      seconds: (to - from) / 1000,
      frameMs: { mean: mean(intervals), p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), p99: quantile(sorted, 0.99), max: max(intervals) },
      over20: intervals.filter((ms) => ms > 20).length,
      over33: intervals.filter((ms) => ms > 33).length,
      simMs: mean(column("simMs")),
      drawMs: mean(column("drawMs")),
      steps: mean(column("steps")),
      mainMs: busyMsPerFrame,
      jsMs: scriptMsPerFrame,
      jsMsPerStep: (scriptMsPerFrame * frames) / Math.max(1, column("steps").reduce((sum, value) => sum + value, 0)),
      maxCalls: max(column("calls")),
      meanCalls: mean(column("calls")),
      maxTriangles: max(column("triangles")),
      meanTriangles: mean(column("triangles")),
      programs: { warm: programs[0] ?? 0, end: programs.at(-1) ?? 0 },
      maxParticles: max(column("particles")),
      maxNumbers: max(column("numbers")),
      maxVoices: max(column("voices")),
      maxStarted: max(column("started")),
      maxNodes: max(column("nodes")),
      hazeShare: mean(column("haze")),
      hits: column("hits").reduce((sum, value) => sum + value, 0),
      allHits: all["hits"]!.reduce((sum, value) => sum + value, 0),
      gcShare: gcMs / Math.max(1e-9, to - from),
      paints: onMain.filter((event) => event.name === "Paint").length / Math.max(1, frames),
      longTasks: tasks.filter((event) => (event.dur ?? 0) > 50_000).length,
      longestTaskMs: max(tasks.map((event) => (event.dur ?? 0) / 1000)),
      top
    }
  } finally {
    await cdp.send("Target.closeTarget", { targetId }).catch(() => undefined)
  }
}

const fixed = (value: number, digits = 1) => value.toFixed(digits)

const row = (report: RunReport) => ({
  scene: report.scene,
  rate: `${report.rate}x`,
  frames: report.frames,
  "p50 ms": fixed(report.frameMs.p50),
  "p95 ms": fixed(report.frameMs.p95),
  "p99 ms": fixed(report.frameMs.p99),
  ">20": report.over20,
  ">33": report.over33,
  "main ms": fixed(report.mainMs, 2),
  "js ms": fixed(report.jsMs, 2),
  "js/step": fixed(report.jsMsPerStep, 2),
  "sim ms": fixed(report.simMs, 2),
  "draw ms": fixed(report.drawMs, 2),
  calls: report.maxCalls,
  tris: Math.round(report.meanTriangles),
  programs: `${report.programs.warm}→${report.programs.end}`,
  particles: report.maxParticles,
  voices: report.maxVoices,
  "nodes/f": report.maxNodes,
  "gc %": fixed(report.gcShare * 100),
  "paint/f": fixed(report.paints ?? 0, 2),
  long: report.longTasks
})

let server: ChildProcess | undefined
let chrome: ChildProcess | undefined
try {
  let base = values.url
  if (base === undefined) {
    const port = await freePort()
    server = spawn("pnpm", ["dev", "--port", String(port), "--strictPort"], { stdio: "ignore", detached: true })
    base = `http://localhost:${port}`
    const started = Date.now()
    while (!(await fetch(base).then((response) => response.ok, () => false))) {
      if (Date.now() - started > 60_000) throw new Error("the dev server did not start")
      await sleep(250)
    }
  }
  const debugPort = await freePort()
  chrome = spawn(chromeBinary(), [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "perf-"))}`,
    "--window-size=1280,720",
    "--hide-scrollbars",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    // Lets WebGL fall back to software where there is no GPU (the `gpu` line says which).
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    // Chrome's sandbox refuses to run as root (a container).
    ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
    "about:blank"
  ], { stdio: "ignore" })
  let browserSocket: string | undefined
  for (let attempt = 0; attempt < 200 && browserSocket === undefined; attempt++) {
    browserSocket = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(async (response) => ((await response.json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl, () => undefined)
    if (browserSocket === undefined) await sleep(100)
  }
  if (browserSocket === undefined) throw new Error("Chrome did not start")
  const cdp = await connect(browserSocket)
  const reports: Array<RunReport> = []
  for (const scene of scenes) {
    for (const rate of rates) {
      console.error(`${scene} at ${rate}x…`)
      reports.push(await measure(cdp, base, scene, rate))
    }
  }
  cdp.close()
  console.log(`gpu: ${reports[0]?.gpu ?? "?"}`)
  console.table(reports.map(row))
  for (const report of reports) {
    console.log(`\n${report.scene} ${report.rate}x: top functions by self time (ms per frame, share of JavaScript time)`)
    for (const entry of report.top.slice(0, 12)) console.log(`  ${fixed(entry.selfMs, 3).padStart(7)}  ${fixed(entry.share * 100).padStart(5)}%  ${entry.name}`)
  }
  mkdirSync(".data/perf", { recursive: true })
  const out = path.join(".data/perf", `${label}.json`)
  writeFileSync(out, `${JSON.stringify({ label, at: new Date().toISOString(), enemies, reports }, null, 1)}\n`)
  console.log(`\nwrote ${out}`)
  if (values.compare !== undefined) {
    const before = JSON.parse(readFileSync(values.compare, "utf8")) as { label: string; reports: ReadonlyArray<RunReport> }
    const change = (now: number, then: number, digits = 1) => `${fixed(then, digits)} → ${fixed(now, digits)}${then === 0 ? "" : ` (${now >= then ? "+" : ""}${fixed(((now - then) / then) * 100, 0)}%)`}`
    console.log(`\nchange from ${before.label}:`)
    console.table(reports.flatMap((report) => {
      const then = before.reports.find((other) => other.scene === report.scene && other.rate === report.rate)
      if (then === undefined) return []
      return [{
        scene: report.scene,
        rate: `${report.rate}x`,
        "p50 ms": change(report.frameMs.p50, then.frameMs.p50),
        "p95 ms": change(report.frameMs.p95, then.frameMs.p95),
        ">33": `${then.over33} → ${report.over33}`,
        "main ms": change(report.mainMs, then.mainMs, 2),
        "js ms": change(report.jsMs, then.jsMs, 2),
        "js/step": change(report.jsMsPerStep, then.jsMsPerStep, 2),
        "sim ms": change(report.simMs, then.simMs, 2),
        "draw ms": change(report.drawMs, then.drawMs, 2),
        calls: `${then.maxCalls} → ${report.maxCalls}`,
        tris: change(report.meanTriangles, then.meanTriangles, 0),
        particles: `${then.maxParticles} → ${report.maxParticles}`,
        "nodes/f": `${then.maxNodes} → ${report.maxNodes}`,
        "paint/f": `${fixed(then.paints ?? 0, 2)} → ${fixed(report.paints ?? 0, 2)}`,
        long: `${then.longTasks} → ${report.longTasks}`
      }]
    }))
  }
} finally {
  chrome?.kill()
  if (server?.pid !== undefined) {
    try {
      process.kill(-server.pid)
    } catch {
      server.kill()
    }
  }
}
