// Lint fixture: the UI may not use Effect or reach into the profile.
import * as Schema from "effect/Schema"
import { defaultProfile } from "../profile/profile.ts"
export const probe = [Schema, defaultProfile]
