import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

/**
 * A device's storage holding `saved`, as a phone's may behave: reading a key
 * `failsRead` picks fails (`times` reads in a row, then works; always by
 * default), and so does writing a key `failsWrite` picks. It keeps every
 * write that went through, in order.
 */
export const flakyStorage = (saved: Record<string, string>, options: {
  readonly failsRead?: (key: string) => boolean
  readonly times?: number
  readonly failsWrite?: (key: string) => boolean
} = {}) => {
  const held = new Map(Object.entries(saved))
  const writes: Array<string> = []
  let failed = 0
  const error = (method: string, key: string) => new KeyValueStore.KeyValueStoreError({ method, key, message: `The storage failed to ${method} ${key}` })
  const store = KeyValueStore.makeStringOnly({
    // Each run of a read or a write tries again, as a real store's does.
    get: (key) =>
      Effect.suspend(() => {
        if (options.failsRead?.(key) === true && failed < (options.times ?? Infinity)) {
          failed++
          return Effect.fail(error("get", key))
        }
        return Effect.succeed(held.get(key))
      }),
    set: (key, value) =>
      Effect.suspend(() => {
        if (options.failsWrite?.(key) === true) return Effect.fail(error("set", key))
        held.set(key, value)
        writes.push(key)
        return Effect.void
      }),
    remove: (key) => Effect.sync(() => void held.delete(key)),
    clear: Effect.sync(() => held.clear()),
    size: Effect.sync(() => held.size)
  })
  return { store, held, writes }
}
