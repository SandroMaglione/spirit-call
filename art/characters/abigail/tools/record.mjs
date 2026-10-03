/**
 * Records the inspector frame by frame at 30 fps: `renderAt(t)`, then a
 * screenshot, so the video has every frame however slow the capture is.
 *
 *   node art/characters/abigail/tools/record.mjs <inspector url> <out dir> <seconds> [WxH] [dpr]
 */
import { spawn } from "node:child_process"
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
const [url, outDir, seconds, size = "1200x600", dpr = "1"] = process.argv.slice(2)
const [W, H] = size.split("x").map(Number)
const cache = path.join(homedir(), "Library/Caches/ms-playwright")
const newest = readdirSync(cache).filter((n) => /^chromium-\d+$/.test(n)).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1])).at(-1)
const bin = path.join(cache, newest, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
const port = 9700 + Math.floor(Math.random() * 90)
const chrome = spawn(bin, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "vid-"))}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws
for (let i = 0; i < 50; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = t.find((x) => x.type === "page"); if (p) { ws = p.webSocketDebuggerUrl; break } } catch {} await sleep(100) }
const socket = new WebSocket(ws)
await new Promise((r) => socket.addEventListener("open", r))
let id = 0; const pending = new Map()
socket.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); socket.send(JSON.stringify({ id: i, method, params })) })
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: Number(dpr), mobile: false })
await send("Page.navigate", { url })
await sleep(4000)
const frames = Math.round(Number(seconds) * 30)
for (let f = 0; f < frames; f++) {
  await send("Runtime.evaluate", { expression: `window.renderAt(${f / 30})` })
  const r = await send("Page.captureScreenshot", { format: "png" })
  writeFileSync(path.join(outDir, `f${String(f).padStart(4, "0")}.png`), Buffer.from(r.result.data, "base64"))
}
socket.close(); chrome.kill()
