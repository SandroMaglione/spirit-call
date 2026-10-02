/**
 * Screenshots a page in headless Chrome, for reviewing art and UI without a
 * person at the screen. Uses Playwright's Chrome for Testing over the
 * DevTools protocol (Node's global WebSocket, no dependencies).
 *
 *   pnpm shot <url> <out.png> [--size 844x390] [--dpr 3] [--mobile] [--wait 1500]
 *
 * `--mobile` emulates a phone (touch, mobile viewport); the default size is a
 * landscape phone.
 */
import { spawn } from "node:child_process"
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}
const valued = new Set(["--size", "--dpr", "--wait"])
const [url, out] = args.filter((arg, index) => !arg.startsWith("--") && !valued.has(args[index - 1] ?? ""))
if (url === undefined || out === undefined) {
  console.error("usage: pnpm shot <url> <out.png> [--size 844x390] [--dpr 3] [--mobile] [--wait 1500]")
  process.exit(1)
}
const [width, height] = (flag("size") ?? "844x390").split("x").map(Number)
const dpr = Number(flag("dpr") ?? "2")
const mobile = args.includes("--mobile")
const wait = Number(flag("wait") ?? "1500")

/** The newest Chrome for Testing that Playwright downloaded. */
const chromeBinary = (): string => {
  const cache = path.join(homedir(), "Library/Caches/ms-playwright")
  const newest = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1])).at(-1)
  if (newest === undefined) throw new Error(`no Chrome for Testing in ${cache} (run: npx playwright install chromium)`)
  return path.join(cache, newest, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
}

const port = 9400 + Math.floor(Math.random() * 400)
const chrome = spawn(chromeBinary(), ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "shot-"))}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const pageSocket = async (): Promise<string> => {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as Array<{ type: string; webSocketDebuggerUrl: string }>
      const page = targets.find((target) => target.type === "page")
      if (page !== undefined) return page.webSocketDebuggerUrl
    } catch {
      // Chrome is still starting.
    }
    await sleep(100)
  }
  throw new Error("Chrome did not start")
}

try {
  const socket = new WebSocket(await pageSocket())
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }))
  let nextId = 0
  const pending = new Map<number, (result: unknown) => void>()
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: unknown }
    if (message.id === undefined) return
    if (message.error !== undefined) console.error(message.error)
    pending.get(message.id)?.(message.result)
  })
  const send = <A>(method: string, params: object = {}): Promise<A> => new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve as (result: unknown) => void)
    socket.send(JSON.stringify({ id, method, params }))
  })

  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile })
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
  await send("Page.enable")
  await send("Page.navigate", { url })
  await sleep(wait)
  const shot = await send<{ data: string }>("Page.captureScreenshot", { format: "png" })
  writeFileSync(out, Buffer.from(shot.data, "base64"))
  console.log(`${out} (${width}x${height} @${dpr}x${mobile ? ", mobile" : ""})`)
  socket.close()
} finally {
  chrome.kill()
}
