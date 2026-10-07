/**
 * The game on Cloudflare (see deploy/alchemy.run.ts): one Worker serving the
 * game's files and its API. Requests under `/api/` reach the server over
 * the D1 database bound as `DB`; everything else is a static asset.
 */
import * as D1Client from "@effect/sql-d1/D1Client"
import * as Layer from "effect/Layer"

import { Batch } from "./batch.ts"
import { makeWebHandler } from "./http.ts"

interface Env {
  readonly DB: D1Client.D1ClientConfig["db"]
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> }
  /** "on" where the dev tools answer (never in prod). */
  readonly DEV_TOOLS?: string
}

/** The server, made on the first request and kept for the Worker's life. */
let server: ReturnType<typeof makeWebHandler> | undefined

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith("/api/")) return env.ASSETS.fetch(request)
    server ??= makeWebHandler(Batch.d1.pipe(Layer.provideMerge(D1Client.layer({ db: env.DB })), Layer.orDie), { devTools: env.DEV_TOOLS === "on", secureCookies: true })
    return server.handler(request)
  }
}
