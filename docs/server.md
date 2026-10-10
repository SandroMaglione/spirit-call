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
    `account/account.ts`.
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

The game runs with nobody looking after it (`vision.md`), so a player
looks after her own account:

- **A recovery code.** Signing up answers with a recovery code (four
  groups of four letters and digits), shown once on the login screen to
  write down, and kept only as a salted PBKDF2 hash (`users.recovery_hash`).
  With it, `POST /api/recovery` sets a new password: every session of the
  player closes, a new code replaces the old one (shown once again), and a
  new session opens. There is no email and no one to ask.
- **Too many attempts are refused.** Signing up, logging in, and
  recovering are counted per address (Cloudflare's `CF-Connecting-IP`) in
  windows of 15 minutes (`attemptLimits`: 5 sign-ups, 20 logins, 10
  recoveries); one more answers `429 TooManyAttempts`. The counts live in
  `attempts`, swept of old windows as it goes.
- **Expired sessions are swept**, anyone's, whenever a session opens.

## The endpoints

| | |
| --- | --- |
| `POST /api/users` | Sign up (and log in). |
| `POST /api/sessions` | Log in. |
| `POST /api/recovery` | Set a new password with the recovery code (and log in). |
| `GET /api/sessions/current` | Who is logged in. |
| `DELETE /api/sessions/current` | Log out. |
| `GET /api/account` | The account. |
| `PUT /api/account/selection` | The team, its aspects and relics, and what to play. |
| `PUT /api/characters/{id}/looks/{kind}` | Wear a look (a tint or a trail), or none. |
| `PUT /api/account/teams/{slot}` | Save a team (with its aspects and relics) in a slot, 1 to 3, or empty it. |
| `POST /api/characters/{id}/training` | Level a character with gold. |
| `POST /api/characters/{id}/ascension` | Ascend a character. |
| `POST /api/runs` | Record a run that ended, with its log: the account after it, and what it earned. |
| `GET /api/runs?since=` | The player's runs, with their logs. |
| `GET /api/account/events?since=` | The changes to the player's account. |
| `POST /api/dev/unlock-everything` | Dev tool: everywhere but prod. |

Every endpoint but the first three needs the session. A rule that refuses
(not owned, not enough, locked) answers `409 Refused` with its kind, and
changes nothing. The server's own clock is the time.

## The database

The players' D1 database is prod's alone. It is its own Alchemy stack
(`deploy/stacks/database.ts`, stage `shared`) that prod binds to by
reference. Every other stage (a pull request's preview, a laptop's deployed
stage) makes a database of its own with the same migrations, destroyed with
it (`deploy/alchemy.run.ts`), so nothing but prod touches a player's
account. (Until October 2026 every stage shared the one database.)

- **Content ids are `TEXT`.** Content lives in code; the server checks
  every id it reads against it. Content that no longer exists is dropped as
  the account is read (`fromRecord`), and what depended on it is repaired.
  Adding content needs no migration.
- **Migrations only add** (tables, nullable columns) and never change once
  merged. Before the game opened, three reset every account instead
  (`0003`, `0004`, which also keyed quest progress, stars, and chests by
  rank; `0005`, which brought relics, looks, and dust, and rebuilt the
  calls' table for their results). `0008` (the Call in three tiers) is the
  one exception since: it renamed the count since the last aspect to the
  count since the last rare thing, dropped the count since the last relic,
  and rebuilt the calls' table once more for the kinds there are now,
  keeping the calls that remain (relics and supplies left the Call; what
  they gave stays). `0009` added perfect clears to quest progress, and the
  shop's weekly stock to the account (`shop_period`, `shop_bought`; the
  stock was dropped soon after, and the columns are left unused). `0010`
  reset every account once more, for the release roster (where characters
  come from changed; see "No players yet" below), and `0011` once more for
  the complete release (`collection.md`: the Spirit Call, crystals, sigils,
  dust, the shop, the account level, and the weekly reset gone; the Call's
  tables are left empty and unused, and the account's own row keeps its
  Call and experience columns, written as zero); it also added the saved
  teams' tables. `0012` added recovery codes, the attempts' counts, and an
  index for sweeping sessions. Deploying prod (by hand, see "Releasing")
  applies new ones first.
- **No players yet: reset, do not migrate.** Until the game opens to
  players (decided by the developer, and written here when it happens),
  the only accounts are the developer's test accounts, with nothing to
  keep. A change that would need a migration to carry accounts over (a
  character moved from the Call to a quest, a content id renamed) may
  instead reset every account, with a migration that empties the
  account's tables (as `0003` did); `pnpm testers new` makes test
  accounts again. A renamed id then moves to `retired` in
  `test/content-ids.json`, with no save migration of its own. From the
  opening on, migrations only add, and shipped ids are permanent.
- **Logs stop growing.** Each player's last 200 runs keep their whole
  log (`keptLogs`); older runs keep their row and who played them, and lose
  their waves, hurts, skills, and falls, written away as each new run is
  kept.
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
  run counted was saved and only its answer lost.
- **What only the server answers** (a level, an ascension, a saved team)
  is waited for.

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
  gained and spent of every resource: training, ascending, a saved team,
  selection, a run's pay and rewards, and the dev tools.
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

## Releasing

The game is a finished release (`vision.md`): it changes only when its
developer decides, and nothing changes it on its own.

- **Prod deploys by hand**: Actions, "Deploy", run from main (it applies
  the players' database's new migrations, then deploys). Merging to main
  deploys nothing; pull requests still get their previews.
- **bevy-ts stays at `bevyTsRelease`**; `.github/workflows/bevy-ts.yml`
  moves it to a newer release only when started by hand.
- **Dev tools are a dev build's** (`pnpm dev`): the tuning panel and its
  saved numbers, the URL's quick starts and tools, and the monitor are not
  in a built game; the server's dev route answers everywhere but prod.
- **Opening to players** (the day is written here when it comes): the
  rule "No players yet: reset, do not migrate" ends, and from then on
  migrations only add and shipped ids are permanent; the test accounts'
  write key (`deploy/stacks/writer.ts`) is destroyed, and the test
  accounts with it if wanted.

## Test accounts

`pnpm testers new` makes the next test account on prod (`sandro1`,
`sandro2`, ...): a new player's account, signed up through the API, with a
wallet full enough to try anything (gold and every essence to take every
character to the top). `new --chapter1`
(or `chapter1 <name>` on one already made) clears chapter 1 first, so
relics are open: each quest is selected and a cleared run recorded
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
