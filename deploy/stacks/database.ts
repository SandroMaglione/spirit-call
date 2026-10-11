// The playtest database (see docs/playtest.md): the runs testers' playtest
// builds send to the `playtest` stage, kept for tuning. That stage binds to
// it by reference (deploy/alchemy.run.ts; prod binds it too, and never
// writes); every other stage makes a database of its own.
// It is its own stack so that no stage of the game owns it: destroying a
// preview never touches it.
//
// Deploying it applies the migrations it has not had yet (src/server/migrations,
// additive only); run it locally from main before deploying prod or playtest:
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
    const playtest = yield* Cloudflare.D1.Database("Playtest", {
      name: "top-down-team-shooter-playtest",
      migrations: fileURLToPath(new URL("../../src/server/migrations", import.meta.url))
    })
    // Retired: the players' accounts from when the account lived on the
    // server (until October 2026). Nothing reads or writes it any more; it is
    // kept, with the migrations it was made with, until it is deleted by hand.
    yield* Cloudflare.D1.Database("Accounts", {
      name: "top-down-team-shooter-accounts",
      migrations: fileURLToPath(new URL("./accounts-migrations", import.meta.url))
    })
    return { databaseId: playtest.databaseId }
  })
)
