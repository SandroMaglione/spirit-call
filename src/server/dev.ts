/**
 * The server inside the dev server (`pnpm dev`): `/api` is answered by the
 * same handler as on Cloudflare, over a SQLite file (`.data/playtest.sqlite`,
 * gitignored) instead of D1, so a dev build's runs are kept on the laptop
 * (read them with `pnpm db --local`). Its code is loaded through Vite, so
 * editing it takes effect on the next request.
 */
import { mkdirSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
// The Vite types the config is checked with (vitest's).
import type { Plugin } from "vitest/config"

import type * as Local from "./local.ts"

const database = ".data/playtest.sqlite"

/** The key a dev build sends (see vite.config.ts): the laptop's server is nobody else's. */
export const devPlaytestKey = "dev"

/** A web `Request` from a Node one. */
const toRequest = async (request: IncomingMessage): Promise<Request> => {
  const chunks: Array<Buffer> = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value)
  }
  const body = chunks.length === 0 ? undefined : Buffer.concat(chunks)
  return new Request(`http://${request.headers.host ?? "localhost"}${request.url ?? "/"}`, { method: request.method ?? "GET", headers, ...(body === undefined ? {} : { body }) })
}

/** Writes a web `Response` to a Node one. */
const send = async (response: Response, out: ServerResponse) => {
  out.statusCode = response.status
  response.headers.forEach((value, name) => out.setHeader(name, value))
  out.end(Buffer.from(await response.arrayBuffer()))
}

export const devServer = (): Plugin => ({
  name: "shooter-dev-server",
  configureServer(server) {
    mkdirSync(".data", { recursive: true })
    let handler: { readonly module: unknown; readonly handle: (request: Request) => Promise<Response> } | undefined
    server.middlewares.use("/api", (request, response, next) => {
      // Connect strips the mount path; the API's routes include it.
      request.url = `/api${request.url ?? ""}`
      void (async () => {
        const local = (await server.ssrLoadModule("/src/server/local.ts")) as typeof Local
        // A new handler (and database connection) when the server's code changed.
        if (handler?.module !== local) handler = { module: local, handle: local.localHandler(database, { playtestKey: devPlaytestKey }).handler }
        await send(await handler.handle(await toRequest(request)), response)
      })().catch(next)
    })
  }
})
