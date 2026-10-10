# Saves

The account lives on the player's device (see [vision.md](vision.md)):
there is no login, and nothing of it is on a server. The game loads it as
it starts, runs every change through the account's rules
(`src/account/account.ts`), and saves the whole account after each one.

## Where things are

- `src/account/account-store.ts`: **the account store** (`AccountStore`):
  loads the save (or starts a new account) and saves the account whole, one
  save at a time, in order.
- `src/account/settings.ts`: **the device's settings** (sound), saved the
  same way.
- `src/account/stored.ts`: **every shape a save ever had**, as Schemas, and
  the migrations between them.
- `src/account/convert.ts`: between the account as stored (`AccountRecord`,
  every content id a plain string) and the account the game uses.
- `src/app/storage.ts`: **where the device keeps things**: the one
  `KeyValueStore` the stores (and a playtest build's outbox) are given.
- `src/app/app.ts`: the shell. It builds the runtime from these layers and
  gives the UI and the ECS plain functions; neither sees Effect.

## One store, injected

Nothing in the game names where it is kept. The stores read and write
through Effect's `KeyValueStore`, and the runtime is given one, from
`src/app/storage.ts`: the browser's local storage on the web
(`BrowserKeyValueStore.layerLocalStorage`). A build for another target (a
phone app with Capacitor's Preferences, say) points that one module at a
`KeyValueStore` of its own (an alias in its Vite config), and nothing else
changes. Tests give an in-memory one (`KeyValueStore.layerMemory`).

| Key | What |
| --- | --- |
| `shooter.account` | The account. |
| `shooter.settings` | The device's settings. |
| `shooter.playtest.outbox`, `.device`, `.tester` | A playtest build's runs waiting to be sent, and who is playing (see [playtest.md](playtest.md)). |
| `<key>.unreadable` | A save that could not be read, set aside. |

## Loading never fails

- **No save**: a new account (the starter set, `content/account.ts`), with a
  random id.
- **A save that cannot be read** (broken, or from a newer version of the
  game than this one): it is set aside under `shooter.account.unreadable`,
  never overwritten, and a new account starts, with a notice on the home
  screen.
- **An older save** is brought to the latest shape, one version at a time
  (`migrateAccount`).
- **Content that changed** since it was saved is repaired as it loads
  (`fromRecord`): content that no longer exists is dropped, what depended
  on it is set right, and what the cards it has met give is given. The
  home screen says what was done.

What loading repaired or migrated is saved at once.

## Changing the save's shape

A save on a player's device can be of any version ever shipped, and there
is no undoing an update, so:

- **Every version keeps its Schema** in `stored.ts` and its place in the
  union, and **a fixture** (`test/saves/v<n>.json`, a save as a device
  holds it) that `test/account-store.test.ts` loads.
- **A new shape** is a new version: its Schema, its step in
  `migrateAccount`, the latest pointed at it, and its fixture.
- **Content changes need no migration** of their own: `fromRecord` repairs
  them. A renamed content id is the exception (see `AGENTS.md`).

## One tab at a time

Two tabs of the game in one browser would share one save and write over
each other's progress, so the first tab holds the save (a Web Lock,
`holdSave`) and any other says the game is open elsewhere. Over a local
network's plain HTTP the browser has no Web Locks, and every tab plays.

## When a save fails

A change always shows at once. If writing it fails (storage full or not
allowed), the player is told once, and play goes on; the next change saves
the whole account again.

## Not yet

- **Moving a save** to another device (export and import) is left for
  later.
