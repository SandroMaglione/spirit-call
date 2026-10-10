// The game on Cloudflare: one Worker serving the Vite build as static assets
// and, while the game is playtested, the server that keeps the runs
// playtest builds send, under `/api/` (src/server/worker.ts; see
// docs/playtest.md). Every stage is a playtest build: prod keeps its runs in
// the playtest database (deploy/stacks/database.ts); every other stage (a
// pull request's preview, a laptop's) has a database of its own, made and
// destroyed with it, so only prod's runs are testers'.
// `pnpm alchemy deploy` (from this folder) builds and deploys a stage; CI
// deploys `prod` from main and a `pr-<n>` preview for every pull request
// (.github/workflows/deploy.yml).
//
// The deploy tooling is its own package so its dependencies stay out of the
// game's; both are on the same Effect release.
import { createHash } from "node:crypto"
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
    // Prod: the playtest database (deploy/stacks/database.ts); any other stage: its own, with the same migrations
    const database = stage === "prod"
      ? yield* Cloudflare.D1.Database.ref("Playtest", { stack: "top-down-team-shooter-database", stage: "shared" })
      : yield* Cloudflare.D1.Database("Playtest", {
        name: `top-down-team-shooter-playtest-${stage}`,
        migrations: fileURLToPath(new URL("../src/server/migrations", import.meta.url))
      })
    // The game is built as a playtest build (its runs sent to this Worker),
    // with the key the Worker checks. The build carries the key, so it is
    // not a secret: it only keeps casual traffic out. `PLAYTEST_KEY` in the
    // environment sets it; otherwise each stage has its own, always the same.
    const playtestKey = process.env.PLAYTEST_KEY || createHash("sha256").update(`top-down-team-shooter-playtest:${stage}`).digest("hex").slice(0, 32)
    process.env.PLAYTEST_KEY = playtestKey
    const game = yield* Cloudflare.Website.Vite("Game", {
      rootDir,
      // The playtest server (src/server/worker.ts) answers `/api/`; the rest is the game's files
      main: fileURLToPath(new URL("../src/server/worker.ts", import.meta.url)),
      assets: { runWorkerFirst: ["/api/*"] },
      env: {
        DB: database,
        PLAYTEST_KEY: playtestKey
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
