/**
 * What this device remembers of the email sign-up (see `signup.ts`), kept
 * under `shooter.signup`: device-wide, as the settings are. Loaded once,
 * saved on every change. When the storage fails to read it, nothing is known
 * (the player may have signed up already): the sign-up is never offered, and
 * nothing is written over what could not be seen.
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Ref from "effect/Ref"

import { read, write } from "./persisted.ts"
import { noSignup } from "./signup.ts"
import type { Signup } from "./signup.ts"
import { StoredSignupJson } from "./stored.ts"

export const signupKey = "shooter.signup"

export class SignupSaveError extends Data.TaggedError("SignupSaveError")<{ readonly cause: unknown }> {}

export interface SignupStoreShape {
  /** What the device remembers, or `null` when its storage could not read it. */
  readonly get: Effect.Effect<Signup | null>
  /** Changes and saves it: what it is after (`null`, and nothing saved, when it could not be read). */
  readonly update: (change: (signup: Signup) => Signup) => Effect.Effect<Signup | null, SignupSaveError>
}

export class SignupStore extends Context.Service<SignupStore, SignupStoreShape>()("Shooter/SignupStore") {}

/** The sign-up store over whatever `KeyValueStore` is provided. */
export const layer = Layer.effect(
  SignupStore,
  Effect.gen(function*() {
    const store = yield* KeyValueStore.KeyValueStore
    const saved = yield* read(store, signupKey, StoredSignupJson)
    const current = yield* Ref.make<Signup | null>(
      saved._tag === "Read" ? { signedUp: saved.value.signedUp, closedAt: saved.value.closedAt, clears: saved.value.clears } : saved._tag === "Failed" ? null : noSignup
    )
    const save = (signup: Signup) =>
      write(store, signupKey, StoredSignupJson, { version: 1, ...signup }).pipe(Effect.mapError((cause) => new SignupSaveError({ cause })), Effect.as(signup))
    return SignupStore.of({
      get: Ref.get(current),
      update: (change) => Ref.updateAndGet(current, (signup) => (signup === null ? null : change(signup))).pipe(
        Effect.flatMap((signup) => (signup === null ? Effect.succeed(null) : save(signup)))
      )
    })
  })
)
