# The server

The account lives on a light server (see [vision.md](vision.md)): one
Cloudflare Worker that serves the game's files and its API, over one D1
database. A player logs in, her account comes from the API, and every change
to it is one of the account's rules run by the server. The arena still runs
on the device and only reports a run's result. Nothing of the account is
kept on the device; only its own settings (sound) are.

## Where things are

- `src/api/`: **the API, shared by the game and the server.** `api.ts`
  defines the endpoints (Effect's `HttpApi`); `schemas.ts` holds the account,
  a run's result, and what a run earned as Schemas. Every content id is
  checked against the content, and type checks keep the Schemas equal to the
  types the account's rules use.
- `src/server/`: **the server.**
  - `http.ts`: the handlers, and the server as a web handler
    (`Request` in, `Response` out) over any database.
  - `players.ts`: sign up, log in, sessions.
  - `accounts.ts`: the account's actions, each running a rule from
    `account/account.ts` or `account/calls.ts`.
  - `rows.ts`, `store.ts`: the account as table rows, read whole and
    written back by difference.
  - `migrations/`: the database's tables, as SQL files.
  - `worker.ts`: the Cloudflare entry (D1). `local.ts` and `dev.ts` run the
    same handler over SQLite for `pnpm dev` and tests.
- `src/app/app.ts`: **the game's side.** It calls the API through a client
  derived from the same definition, and gives the rest of the game plain
  functions.

`tools/lint/plugin.mjs` keeps them apart: the API holds no code of either
side, and the server never touches rendering or the UI.

## Players and sessions

A username is 3 to 20 letters, digits, `_` or `-`, unique whatever its case.
A password is at least 8 characters. Passwords are kept only as salted
PBKDF2 hashes. Signing up or logging in opens a session: a random token in
an HTTP-only cookie (`session`, path `/api`, 90 days), kept in the database
only as its SHA-256 hash. Logging out deletes it.

## The endpoints

| | |
| --- | --- |
| `POST /api/users` | Sign up (and log in). |
| `POST /api/sessions` | Log in. |
| `GET /api/sessions/current` | Who is logged in. |
| `DELETE /api/sessions/current` | Log out. |
| `GET /api/account` | The account. |
| `PUT /api/account/selection` | The team, its aspects, and what to play. |
| `POST /api/characters/{id}/training` | Level a character with gold. |
| `POST /api/characters/{id}/ascension` | Ascend a character. |
| `POST /api/banners/{id}/calls` | Make calls on a banner. |
| `PUT /api/banners/{id}/focus` | Focus a character on a banner. |
| `POST /api/runs` | Record a run that ended, with its log: the account after it, and what it earned. |
| `GET /api/runs?since=` | The player's runs, with their logs. |
| `GET /api/account/events?since=` | The changes to the player's account. |
| `POST /api/dev/unlock-everything`, `POST /api/dev/open-calls` | Dev tools: everywhere but prod. |

Every endpoint but the first two needs the session. A rule that refuses
(not owned, not enough, locked) answers `409 Refused` with its kind, and
changes nothing. The server's own clock is the time.

## The database

One D1 database, shared by every stage: prod, pull request previews, and
each laptop's deployed stage. It is its own Alchemy stack
(`deploy/stacks/database.ts`, stage `shared`) that the game's stages bind
to by reference, so destroying a preview never touches it.

- **Content ids are `TEXT`.** Content lives in code; the server checks
  every id it reads against it. Content that no longer exists is dropped as
  the account is read (`fromRecord`), and what depended on it is repaired.
  Adding content needs no migration.
- **Migrations only add** (tables, nullable columns) and never change once
  merged. Main's CI applies new ones before deploying prod. Previews and
  laptops share the database, so they run against what main has applied.
- **Writes are plain statements in sequence.** A player's two devices
  changing the account at the same moment could interleave; that is
  accepted until it is seen to matter.

## Measuring play

Everything played is kept, to tune against real numbers rather than
guesses (`src/server/logs.ts`, migration `0002_logs.sql`):

- **Runs.** Each run that ends is kept with:
  - what was played (a quest at a rank, a tier, or nothing for a `?play`
    quick start, whose enemy level shows as 0) and the enemy level
  - the team as it was (each member's level and aspect)
  - how it went
  - its log (`RunLog`, recorded by `features/run-log.ts`): each wave's
    start and the damage taken in it; what hurt the team, by enemy and
    attack; each member's damage dealt and taken; each skill's uses and
    the blows it landed; each fall and what dealt it; dashes and switches.

  A killing blow counts its whole damage.
- **Account events.** Each change to an account is kept with what it
  gained and spent of every resource: training, ascending,
  calls, focus, selection, a run's pay and rewards, and the dev tools.
  A refused action leaves nothing.

`pnpm runs` reads them as the player (see `scripts/runs.ts`):
`RUNS_URL`, `RUNS_USERNAME`, and `RUNS_PASSWORD`, from the environment or
`.env.runs` (gitignored). It prints a line per run, then what hurt the most
and how the skills did; `--since`, `--quest`, `--events`, and `--json` for
the full data.

## On a laptop

`pnpm dev` answers `/api` with the same server over a SQLite file
(`.data/dev.sqlite`, gitignored), migrated as it opens, with the dev tools
on. Sign up as many players as needed; delete the file to start over. Over
the network address (plain HTTP) the cookie is not marked `Secure`, so a
phone on the same network can log in.
