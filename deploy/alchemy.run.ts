// The game on Cloudflare: the Vite build served as static assets by a Worker.
// `pnpm alchemy deploy` (from this folder) builds and deploys a stage; CI
// deploys `prod` from main and a `pr-<n>` preview for every pull request
// (.github/workflows/deploy.yml).
//
// The deploy tooling is its own package so its dependencies stay out of the
// game's. It pins Effect 4.0.0-rc.117: alchemy 2.0.0-beta.79 imports
// `effect/unstable/*` modules that later Effect versions moved; move both to
// the next alchemy release (which follows Effect's new layout).
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
    const game = yield* Cloudflare.Website.Vite("Game", {
      rootDir,
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
