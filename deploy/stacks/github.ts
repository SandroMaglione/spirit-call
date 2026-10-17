// Legacy deployment credentials: GitHub now runs only general checks and
// does not use these secrets. Keep this stack to manage the existing token;
// local deployments use a local Cloudflare profile (docs/local-workflows.md).
// The credentials were created once from a laptop and stored as
// the repository's Actions secrets (rerun to rotate the token or change its
// permissions):
//
//   pnpm alchemy deploy --config stacks/github.ts --profile admin --stage prod
//
// The `admin` profile needs a Cloudflare credential that can create API
// tokens (the Global API Key, or a token with API Tokens Write) and GitHub
// access to the repository (the gh CLI login works).
import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as GitHub from "alchemy/GitHub"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

const repository = { owner: "SandroMaglione", repository: "spirit-call" }

export default Alchemy.Stack(
  "top-down-team-shooter-github",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state()
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment

    // Only what deploying the game needs: its Worker, the state store (a
    // Worker whose keys live in the Secrets Store), and its database (D1)
    const token = yield* Cloudflare.ApiToken.AccountApiToken("CIToken", {
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: ["Workers Scripts Write", "Secrets Store Write", "Account Settings Write", "Workers Tail Read", "D1 Write"],
          resources: { [`com.cloudflare.api.account.${accountId}`]: "*" }
        }
      ]
    })

    yield* GitHub.Secret("CloudflareApiToken", { ...repository, name: "CLOUDFLARE_API_TOKEN", value: token.value })
    yield* GitHub.Secret("CloudflareAccountId", { ...repository, name: "CLOUDFLARE_ACCOUNT_ID", value: Redacted.make(accountId) })
  })
)
