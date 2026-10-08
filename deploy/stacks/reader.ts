// A read-only key to the game's database, for reading what players do
// (`pnpm db`, see docs/server.md), created from a laptop and saved to the
// repository's git-ignored `.env.database`:
//
//   pnpm alchemy deploy --config stacks/reader.ts --profile admin --stage prod
//
// The token can only read D1 (no writes, nothing else in the account).
// Destroying the stack revokes it:
//
//   pnpm alchemy destroy --config stacks/reader.ts --profile admin --stage prod
import { fileURLToPath } from "node:url"

import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Exec } from "alchemy/Command"
import * as Effect from "effect/Effect"

/** Where the key is saved: the repository's root (git-ignored). */
const envFile = fileURLToPath(new URL("../../.env.database", import.meta.url))

export default Alchemy.Stack(
  "top-down-team-shooter-reader",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state()
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment

    const token = yield* Cloudflare.ApiToken.AccountApiToken("DatabaseReader", {
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: ["D1 Read"],
          resources: { [`com.cloudflare.api.account.${accountId}`]: "*" }
        }
      ]
    })

    // Written on every deploy, so a lost file comes back by deploying again.
    yield* Exec("SaveReaderKey", {
      command: `node ${fileURLToPath(new URL("save-key.mjs", import.meta.url))}`,
      env: { ENV_FILE: envFile, ACCOUNT_ID: accountId, KEY_NAME: "D1_READ_TOKEN", KEY: token.value },
      memo: false
    })
  })
)
