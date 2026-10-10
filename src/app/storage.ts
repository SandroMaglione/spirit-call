/**
 * Where this device keeps what it saves (the settings, the account, and a
 * playtest build's unsent runs): one `KeyValueStore`, provided to every
 * store from here. On the web it is the browser's local storage; a build for
 * another target (a phone app) points this module at its own store, and
 * nothing else in the game changes.
 */
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"

export const storageLayer = BrowserKeyValueStore.layerLocalStorage
