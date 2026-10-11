/**
 * Where this device keeps what it saves (the settings, the account, and a
 * playtest build's unsent runs): one `KeyValueStore`, provided to every
 * store from here. In a browser it is the browser's local storage; in the
 * phone apps (Capacitor, see docs/mobile.md) it is the app's own storage
 * (the Preferences plugin), which the phone keeps with the app, where a web
 * view's local storage may be cleared when the phone runs low on space.
 * Nothing else in the game changes.
 */
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import { Capacitor } from "@capacitor/core"
import { Preferences } from "@capacitor/preferences"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

/** A failed call to the app's storage, as the store reports it. */
const failed = (method: string, key: string | undefined, cause: unknown) =>
  new KeyValueStore.KeyValueStoreError({ method, ...(key === undefined ? {} : { key }), message: `The app's storage failed to ${method}${key === undefined ? "" : ` ${key}`}`, cause })

/** The app's own storage, through Capacitor's Preferences plugin. */
export const appStorageLayer: Layer.Layer<KeyValueStore.KeyValueStore> = Layer.succeed(KeyValueStore.KeyValueStore)(KeyValueStore.makeStringOnly({
  get: (key) => Effect.tryPromise({ try: () => Preferences.get({ key }).then(({ value }) => value ?? undefined), catch: (cause) => failed("get", key, cause) }),
  set: (key, value) => Effect.tryPromise({ try: () => Preferences.set({ key, value }), catch: (cause) => failed("set", key, cause) }),
  remove: (key) => Effect.tryPromise({ try: () => Preferences.remove({ key }), catch: (cause) => failed("remove", key, cause) }),
  clear: Effect.tryPromise({ try: () => Preferences.clear(), catch: (cause) => failed("clear", undefined, cause) }),
  size: Effect.tryPromise({ try: () => Preferences.keys().then(({ keys }) => keys.length), catch: (cause) => failed("size", undefined, cause) })
}))

export const storageLayer = Capacitor.isNativePlatform() ? appStorageLayer : BrowserKeyValueStore.layerLocalStorage
