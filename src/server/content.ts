/** What the server's accounts are made of: the content and its numbers, and what a new account owns. */
import * as Context from "effect/Context"

import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"

export class Content extends Context.Service<Content, { readonly tuning: Tuning; readonly starter: StarterSet }>()("Shooter/Server/Content") {}
