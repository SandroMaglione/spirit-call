/** What the build sets (see vite.config.ts). */

/** Which build of the game this is: the commit it was built from (`dev` in a dev build). */
declare const SHOOTER_BUILD: string

/**
 * A playtest build's way to send its runs (see docs/playtest.md): the
 * server's address (empty: the game's own), the playtest key, and the
 * tester's name when the build is made for one; `null` in a release build,
 * which then contains none of the sending code.
 */
declare const SHOOTER_PLAYTEST: { readonly url: string; readonly key: string; readonly tester: string } | null
