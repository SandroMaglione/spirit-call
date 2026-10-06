import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

import { devServer } from "./src/server/dev.ts"

// The bevy-ts packages are linked from the sibling repository and consumed as
// TypeScript source, so Vite must be allowed to serve files from there.
const bevyTs = fileURLToPath(new URL("../../bevy-ts", import.meta.url))

export default defineConfig({
  // `/api` answered by the game's server over a local database (see src/server/dev.ts).
  plugins: [devServer()],
  server: {
    fs: { allow: [".", bevyTs] },
    // The local database and Effect's source (see AGENTS.md) are not part of the game.
    watch: { ignored: ["**/.data/**", "**/.repos/**"] }
  },
  test: {
    include: ["test/**/*.test.ts"]
  }
})
