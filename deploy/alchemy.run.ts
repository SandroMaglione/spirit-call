// The game on Cloudflare: the Vite build as static assets, and for playtest
// builds the server that keeps the runs they send, under `/api/`
// (src/server/worker.ts; see docs/playtest.md).
// - `prod` is the release, at spirit-call.typeonce.dev: a release build,
//   sending nothing, served as static files alone (no Worker code, no
//   database). The game keeps everything on the player's device.
// - `playtest` is the testers' game: a playtest build whose runs go to the
//   playtest database (deploy/stacks/database.ts).
// - Every other stage (a pull request's preview, a laptop's) is a playtest
//   build with a database of its own, made and destroyed with it, so only the
//   `playtest` stage's runs are testers'.
// `pnpm alchemy deploy` (from this folder) builds and deploys a stage locally.
// Use main for `prod` or `playtest`; previews are created and removed locally
// too (docs/local-workflows.md). GitHub runs only the general checks.
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

// Where players find the release (prod); every other stage stays on workers.dev
const productionDomain = "spirit-call.typeonce.dev"

// The stacks and their Cloudflare resources keep the game's working name
// (top-down-team-shooter): renaming them would make new ones, and a new,
// empty playtest database
export default Alchemy.Stack(
  "top-down-team-shooter",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    // Deploy state lives in the Cloudflare account, shared by local checkouts
    state: Cloudflare.state()
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage
    const release = stage === "prod"
    const memo = {
      // Locally the bevy-ts packages are linked from the sibling repository,
      // so their sources decide whether a rebuild is needed too (for releases they
      // come from npm and the lockfile covers them)
      include: ["**/*", "../../bevy-ts/packages/*/src/**"],
      lockfile: true
    }
    // The release: built without `PLAYTEST_KEY` (the Vite build reads this
    // process's environment), so it is a release build, sending nothing, and
    // only its files are deployed, on the game's own address
    if (release) {
      delete process.env.PLAYTEST_KEY
      const game = yield* Cloudflare.Website.Vite("Game", { rootDir, domain: productionDomain, memo })
      return { url: game.url }
    }
    // The testers' stage: the playtest database (deploy/stacks/database.ts);
    // any other stage: its own, with the same migrations
    const database = stage === "playtest"
      ? yield* Cloudflare.D1.Database.ref("Playtest", { stack: "top-down-team-shooter-database", stage: "shared" })
      : yield* Cloudflare.D1.Database("Playtest", {
        name: `top-down-team-shooter-playtest-${stage}`,
        migrations: fileURLToPath(new URL("../src/server/migrations", import.meta.url))
      })
    // A playtest build (its runs sent to this Worker) is built with the key
    // the Worker checks. The build carries the key, so it is not a secret: it
    // only keeps casual traffic out. `PLAYTEST_KEY` in the environment sets
    // it; otherwise each stage has its own, always the same.
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
      memo
    })

    // A local deployment given GitHub's PR context can comment its address
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
