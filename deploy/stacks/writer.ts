// A key that can write to the game's database, for making test accounts
// (`pnpm testers`, see docs/server.md), created from a laptop and saved to
// the repository's git-ignored `.env.database`, next to the read-only key:
//
//   pnpm alchemy deploy --config stacks/writer.ts --profile admin --stage prod
//
// The token can read and write D1 (every database in the account, nothing
// else). Destroying the stack revokes it:
//
//   pnpm alchemy destroy --config stacks/writer.ts --profile admin --stage prod
import { fileURLToPath } from "node:url"

import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Exec } from "alchemy/Command"
import * as Effect from "effect/Effect"

/** Where the key is saved: the repository's root (git-ignored). */
const envFile = fileURLToPath(new URL("../../.env.database", import.meta.url))

export default Alchemy.Stack(
  "top-down-team-shooter-writer",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state()
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment

    const token = yield* Cloudflare.ApiToken.AccountApiToken("DatabaseWriter", {
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: ["D1 Read", "D1 Write"],
          resources: { [`com.cloudflare.api.account.${accountId}`]: "*" }
        }
      ]
    })

    // Written on every deploy, so a lost file comes back by deploying again.
    yield* Exec("SaveWriterKey", {
      command: `node ${fileURLToPath(new URL("save-key.mjs", import.meta.url))}`,
      env: { ENV_FILE: envFile, ACCOUNT_ID: accountId, KEY_NAME: "D1_WRITE_TOKEN", KEY: token.value },
      memo: false
    })
  })
)
