/**
 * Plays the live game in headless Chrome with real input (CDP mouse, keys,
 * and touch) and captures frames around the player.
 *
 *   node art/characters/abigail/tools/play.mjs <game url> <out dir> [desktop|phone]
 *
 * Desktop: aims toward the camera, clicks a four-hit combo, runs, and
 * double-taps to dash. Phone: emulates a touch phone and runs with the
 * stick. Uses Playwright's Chrome for Testing, like `pnpm shot`.
 */
import { spawn } from "node:child_process"
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

const [url, outDir, mode = "desktop"] = process.argv.slice(2)
const cache = path.join(homedir(), "Library/Caches/ms-playwright")
const newest = readdirSync(cache).filter((n) => /^chromium-\d+$/.test(n)).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1])).at(-1)
const bin = path.join(cache, newest, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
const port = 9800 + Math.floor(Math.random() * 100)
const chrome = spawn(bin, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "drive-"))}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws
for (let i = 0; i < 50; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = t.find((x) => x.type === "page"); if (p) { ws = p.webSocketDebuggerUrl; break } } catch {} await sleep(100) }
const socket = new WebSocket(ws)
await new Promise((r) => socket.addEventListener("open", r))
let id = 0
const pending = new Map()
socket.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); socket.send(JSON.stringify({ id: i, method, params })) })
const phone = mode === "phone"
const W = phone ? 844 : 1280, H = phone ? 390 : 800, dpr = phone ? 3 : 2
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dpr, mobile: phone })
if (phone) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
await send("Page.enable")
await send("Page.navigate", { url })
await sleep(4500)
const cx = W / 2, cy = H / 2
const half = phone ? 60 : 90
let n = 0
const shot = async (label) => {
  const r = await send("Page.captureScreenshot", { format: "png", clip: { x: cx - half, y: cy - half * 1.3, width: half * 2, height: half * 2, scale: 1 } })
  writeFileSync(path.join(outDir, `${String(n++).padStart(3, "0")}-${label}.png`), Buffer.from(r.result.data, "base64"))
}
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra })
const key = (type, k, code, vk) => send("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk })
if (!phone) {
  // Aim toward the bottom of the screen (toward the camera), then the combo: four clicks.
  await mouse("mouseMoved", cx + 40, cy + 220, { button: "none" })
  await sleep(300)
  await shot("guard")
  for (let hit = 0; hit < 4; hit++) {
    await mouse("mousePressed", cx + 40, cy + 220)
    await mouse("mouseReleased", cx + 40, cy + 220)
    for (let k = 0; k < 4; k++) { await sleep(45); await shot(`hit${hit + 1}`) }
  }
  for (let k = 0; k < 8; k++) { await sleep(70); await shot("finish") }
  // Run to the right (D), aiming down.
  await key("keyDown", "d", "KeyD", 68)
  for (let k = 0; k < 8; k++) { await sleep(60); await shot("run") }
  await key("keyUp", "d", "KeyD", 68)
  // Double-tap A to dash left.
  await key("keyDown", "a", "KeyA", 65); await sleep(40); await key("keyUp", "a", "KeyA", 65); await sleep(40)
  await key("keyDown", "a", "KeyA", 65)
  for (let k = 0; k < 5; k++) { await sleep(40); await shot("dash") }
  await key("keyUp", "a", "KeyA", 65)
} else {
  // Touch: drag the stick on the left to run, then tap the attack button.
  const stick = { x: 130, y: H - 110 }
  const touch = (type, points) => send("Input.dispatchTouchEvent", { type, touchPoints: points })
  await touch("touchStart", [{ x: stick.x, y: stick.y, id: 1 }])
  await touch("touchMove", [{ x: stick.x + 40, y: stick.y + 10, id: 1 }])
  for (let k = 0; k < 8; k++) { await sleep(60); await shot("touch-run") }
  await touch("touchEnd", [])
  const full = await send("Page.captureScreenshot", { format: "png" })
  writeFileSync(path.join(outDir, "phone-full.png"), Buffer.from(full.result.data, "base64"))
}
const full = await send("Page.captureScreenshot", { format: "png" })
writeFileSync(path.join(outDir, `full-${mode}.png`), Buffer.from(full.result.data, "base64"))
socket.close(); chrome.kill()
