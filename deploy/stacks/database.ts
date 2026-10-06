// The game's one database (see docs/server.md): players, sessions, and
// accounts, shared by every stage of the game (prod, pull request previews,
// and each laptop's own), which bind to it by reference
// (deploy/alchemy.run.ts). It is its own stack so that no stage of the game
// owns it: destroying a preview never touches it.
//
// Deploying it applies the migrations it has not had yet (src/server/migrations,
// additive only); CI does that from main before deploying prod:
//
//   pnpm alchemy deploy --config stacks/database.ts --stage shared
import { fileURLToPath } from "node:url"

import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"

export default Alchemy.Stack(
  "top-down-team-shooter-database",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state()
  },
  Effect.gen(function* () {
    const database = yield* Cloudflare.D1.Database("Accounts", {
      name: "top-down-team-shooter-accounts",
      migrations: fileURLToPath(new URL("../../src/server/migrations", import.meta.url))
    })
    return { databaseId: database.databaseId }
  })
)
