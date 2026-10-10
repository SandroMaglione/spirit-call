import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

import { devPlaytestKey, devServer } from "./src/server/dev.ts"

// The bevy-ts packages are linked from the sibling repository and consumed as
// TypeScript source, so Vite must be allowed to serve files from there.
const bevyTs = fileURLToPath(new URL("../../bevy-ts", import.meta.url))

/** The commit a build is made from (the build every playtest run names). */
const commit = (): string => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
  } catch {
    return "unknown"
  }
}

export default defineConfig(({ command, mode }) => {
  // A playtest build (see docs/playtest.md) is one built with `PLAYTEST_KEY`
  // (and `PLAYTEST_URL` when the server is not the game's own address, as
  // for a phone app; `PLAYTEST_TESTER` to name its tester) in the
  // environment. A dev build sends to the laptop's own
  // server. Runs are named by the account played unless a tester is named
  // (see src/app/playtest-send.ts). Any other build is a release build: `SHOOTER_PLAYTEST` is `null`,
  // so the sender is left out of the bundle.
  const env = process.env
  const playtest = mode === "test"
    ? null
    : command === "serve"
    ? { url: "", key: devPlaytestKey, tester: env.PLAYTEST_TESTER ?? "" }
    : env.PLAYTEST_KEY !== undefined && env.PLAYTEST_KEY !== ""
    ? { url: env.PLAYTEST_URL ?? "", key: env.PLAYTEST_KEY, tester: env.PLAYTEST_TESTER ?? "" }
    : null
  return {
    define: {
      SHOOTER_BUILD: JSON.stringify(command === "serve" ? "dev" : commit()),
      SHOOTER_PLAYTEST: JSON.stringify(playtest)
    },
    // `/api` answered by the playtest server over a local database (see src/server/dev.ts).
    plugins: [devServer()],
    server: {
      fs: { allow: [".", bevyTs] },
      // The local database and Effect's source (see AGENTS.md) are not part of the game.
      watch: { ignored: ["**/.data/**", "**/.repos/**"] }
    },
    test: {
      include: ["test/**/*.test.ts"]
    }
  }
})
