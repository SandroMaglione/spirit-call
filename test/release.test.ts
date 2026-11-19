import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"
import { describe, expect, it } from "vitest"

import { playtestKeyHeader, runsPath } from "../src/api/api.ts"
import { outboxKey } from "../src/app/playtest-send.ts"
import { subscribeEndpoint } from "../src/app/subscribe.ts"

/** Every script a build of the game is made of, as text. */
const scripts = (dir: string): Array<string> =>
  readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".js")).map((file) => readFileSync(path.join(dir, file), "utf8"))

/** Builds the game into a new folder, with `env` as the only playtest settings. */
const built = async (env: Record<string, string>) => {
  const saved = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("PLAYTEST_")))
  for (const name of Object.keys(saved)) delete process.env[name]
  Object.assign(process.env, env)
  const outDir = mkdtempSync(path.join(tmpdir(), "build-"))
  // Built as `pnpm build` builds it: Vitest's "test" would make it a dev build (`import.meta.env.DEV`).
  const nodeEnv = process.env["NODE_ENV"]
  process.env["NODE_ENV"] = "production"
  try {
    await build({ root: fileURLToPath(new URL("..", import.meta.url)), mode: "production", logLevel: "silent", build: { outDir, emptyOutDir: true } })
  } finally {
    if (nodeEnv === undefined) delete process.env["NODE_ENV"]
    else process.env["NODE_ENV"] = nodeEnv
    for (const name of Object.keys(env)) delete process.env[name]
    Object.assign(process.env, saved)
  }
  return scripts(outDir).join("\n")
}

describe("release build", () => {
  it("carries none of the playtest sender, its address, or a key", async () => {
    const release = await built({})
    for (const trace of [playtestKeyHeader, runsPath, outboxKey]) expect(release).not.toContain(trace)
    // The email sign-up sends for real; a dev build's fake answers ("limit@" is rate limited) are left out.
    expect(release).toContain(subscribeEndpoint)
    expect(release).not.toContain("limit@")
  }, 120_000)

  it("a playtest build carries the sender and its key", async () => {
    const playtest = await built({ PLAYTEST_KEY: "release-test-key" })
    for (const trace of [playtestKeyHeader, runsPath, outboxKey, "release-test-key"]) expect(playtest).toContain(trace)
  }, 120_000)
})
