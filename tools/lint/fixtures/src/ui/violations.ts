// Lint fixture: the UI may not use Effect or reach into the account store.
import * as Schema from "effect/Schema"
import { AccountStore } from "../account/store.ts"
export const probe = [Schema, AccountStore]
