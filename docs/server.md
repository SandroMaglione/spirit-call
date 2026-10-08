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
| `PUT /api/account/selection` | The team, its aspects and relics, and what to play. |
| `PUT /api/characters/{id}/looks/{kind}` | Wear a look (a tint or a trail), or none. |
| `POST /api/shop/relics/{id}` | Buy a relic owned one tier up, with dust. |
| `POST /api/shop/looks/{id}` | Buy a look the shop sells, with dust. |
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
  merged. Before the game opened, three reset every account instead
  (`0003`, `0004`, which also keyed quest progress, stars, and chests by
  rank; `0005`, which brought relics, looks, and dust, and rebuilt the
  calls' table for their results). Main's CI applies new ones before deploying prod. Previews and
  laptops share the database, so they run against what main has applied.
- **Two round trips an action.** An action reads the whole account in one
  batch and writes everything it changed (its rows, its log lines) in
  another: a D1 `batch`, one round trip, all or none (`server/batch.ts`;
  on a laptop's SQLite, one transaction). A session found is remembered
  for a minute. A run's save went from about 2.5 s to two round trips.
  A player's two devices changing the account at the same moment could
  still interleave; that is accepted until it is seen to matter.

## The game's side

The game never waits on the server to show what the account's rules can
work out (`app/saves.ts`):

- **In order.** Every change goes to the server one at a time, in the
  order it was made, so each runs on the account the one before left (a
  quest a run cleared is open when the next run's selection arrives).
- **Shown at once.** A run's rewards and a selection are worked out on the
  page by the same rules the server runs (`account/account.ts`, over the
  same content), and shown at once; the run starts, the results come in.
  The server's answer then replaces them (it wins where they differ).
- **Never lost unnoticed.** A change that fails is tried again a few times;
  a run or a selection that still fails waits, and everything after it
  waits behind it: a dialog says so, a mark stays at the top until it is
  saved (a tap tries again), and nothing new starts meanwhile. The page
  asks before closing while anything is on its way.
- **Never made twice.** Before trying again, the account is read back: a
  run counted, or a call made (its seed moved), was saved and only its
  answer lost.
- **What only the server knows** (a call's results, a level, a focus) is
  waited for. A call shows its seal at once, cracking while the answer is
  on its way (see docs/calls.md).

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

`pnpm db` reads them for every player at once, straight from the database,
with a read-only key (see `scripts/db.ts`):

- **The key** is a Cloudflare token allowed only to read D1, made by
  `deploy/stacks/reader.ts` from a laptop with the admin profile and saved
  to `.env.database` (gitignored, readable by its owner only). Writes are
  refused by Cloudflare. Destroying the stack revokes it.
- **What it shows:** `players` (who plays, how much, last seen),
  `summary` (per quest and rank: tries, clear rate, hits, clear time, the
  wave lost at), `runs`, `run <id>` (one run in full), `hurts` (what hurts
  teams most, and what makes them fall), `events` (what accounts gained
  and spent), and `sql` for any other read query. `--since 2d`,
  `--player`, `--quest` narrow it down; test accounts (`check…`, `probe…`,
  `sandroN`) are left out unless `--tests`.
- **Login secrets are never read:** no command selects password hashes or
  sessions, and `sql` refuses queries naming them.

## Test accounts

`pnpm testers new` makes the next test account on prod (`sandro1`,
`sandro2`, ...): a new player's account, signed up through the API, with a
wallet full enough to try anything (crystals for about 500 calls, gold and
every material to take every character to the top). `new --chapter1`
(or `chapter1 <name>` on one already made) clears chapter 1 first, so the
Spirit Call is open: each quest is selected and a cleared run recorded
through the API, earning no star, so the server pays what a
player would get. `refill <name>` fills one again, `list` shows them (see
`scripts/testers.ts`).

- **The wallet is written straight to the database** with a key that can
  write D1, made by `deploy/stacks/writer.ts` from a laptop with the admin
  profile and saved next to the read-only key in `.env.database`, with the
  game's address (`TESTERS_URL`) and the accounts' password
  (`TESTERS_PASSWORD`). Each fill is logged as a `testerFill` event.
  Destroying the stack revokes the key.
- **Only `sandroN` accounts are touched**, and they stay out of `pnpm db`'s
  numbers.

## On a laptop

`pnpm dev` answers `/api` with the same server over a SQLite file
(`.data/dev.sqlite`, gitignored), migrated as it opens, with the dev tools
on. Sign up as many players as needed; delete the file to start over. Over
the network address (plain HTTP) the cookie is not marked `Secure`, so a
phone on the same network can log in.
