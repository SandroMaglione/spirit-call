// Lint fixture: none of this breaks a rule (types cross parts freely; storing the account uses Effect by module).
import * as Schema from "effect/Schema"
import type { UiStore } from "../ui/store.ts"
import { defaultBuild } from "../features/build.ts"
export const probe = [Schema, defaultBuild]
export type Probe = UiStore
