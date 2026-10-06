// The game on Cloudflare: one Worker serving the Vite build as static assets
// and the game's server under `/api/` (src/server/worker.ts), over the shared
// database (deploy/stacks/database.ts).
// `pnpm alchemy deploy` (from this folder) builds and deploys a stage; CI
// deploys `prod` from main and a `pr-<n>` preview for every pull request
// (.github/workflows/deploy.yml).
//
// The deploy tooling is its own package so its dependencies stay out of the
// game's; both are on the same Effect release.
import { fileURLToPath } from "node:url"

import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as GitHub from "alchemy/GitHub"
import * as Output from "alchemy/Output"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

// The game's root: Alchemy builds it with the game's own Vite and config
const rootDir = fileURLToPath(new URL("..", import.meta.url))

export default Alchemy.Stack(
  "top-down-team-shooter",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    // Deploy state lives in the Cloudflare account, shared by laptops and CI
    state: Cloudflare.state()
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage
    // The one database every stage shares (deploy/stacks/database.ts)
    const database = yield* Cloudflare.D1.Database.ref("Accounts", { stack: "top-down-team-shooter-database", stage: "shared" })
    const game = yield* Cloudflare.Website.Vite("Game", {
      rootDir,
      // The server (src/server/worker.ts) answers `/api/`; the rest is the game's files
      main: fileURLToPath(new URL("../src/server/worker.ts", import.meta.url)),
      assets: { runWorkerFirst: ["/api/*"] },
      env: {
        DB: database,
        // The dev tools (unlock everything, open the Spirit Call) answer everywhere but prod
        DEV_TOOLS: stage === "prod" ? "off" : "on"
      },
      memo: {
        // Locally the bevy-ts packages are linked from the sibling repository,
        // so their sources decide whether a rebuild is needed too (in CI they
        // come from npm and the lockfile covers them)
        include: ["**/*", "../../bevy-ts/packages/*/src/**"],
        lockfile: true
      }
    })

    // Pull requests get a comment with their preview's address, updated on
    // every push
    const github = yield* GitHub.GitHubEnv
    if (github?.pr !== undefined) {
      yield* GitHub.Comment("PreviewComment", {
        owner: github.owner,
        repository: github.repository,
        issueNumber: github.pr,
        body: Output.interpolate`
          **Preview:** ${game.url}

          Built from ${github.sha.slice(0, 7)}.
        `
      })
    }

    return { url: game.url }
  })
)
