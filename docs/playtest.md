# Playtesting

The game runs on the device (see [vision.md](vision.md)): the account is a
save there (see [saves.md](saves.md)), and nothing needs a server. Until the
release, though, what testers play is measured, to tune against real
numbers rather than guesses. A **playtest build** sends every run that ends
to a small server: one Cloudflare Worker (the same one that serves the
game's files) over one D1 database. A **release build** sends nothing, and
contains none of the code that would.

## Where things are

- `src/app/playtest.ts`: **the shell's side.** One call, a run that
  ended, through the `Playtest` service: the release build's does nothing;
  `reportOf` makes the run from what the arena reported.
- `src/app/playtest-send.ts`: **the sender**, loaded only by a playtest
  build: the outbox, the device's id, and the tester's name.
- `src/api/`: **the API, shared by the sender and the server.** `api.ts`
  defines the one endpoint (Effect's `HttpApi`); `schemas.ts` holds the run
  as Schemas. Every content id is checked against the content, and type
  checks keep the Schemas equal to the types the account's rules use.
- `src/server/`: **the server.**
  - `http.ts`: the handler, the key's check, CORS, and the server as a
    web handler (`Request` in, `Response` out) over any database.
  - `runs.ts`: a run kept in the tables.
  - `migrations/`: the database's tables, as SQL files.
  - `worker.ts`: the Cloudflare entry (D1). `local.ts` and `dev.ts` run the
    same handler over SQLite for `pnpm dev` and tests.

`tools/lint/plugin.mjs` keeps them apart: the API holds no code of either
side, the server knows nothing of the game but the API, and only the shell
(and `main.ts`) reaches the sender.

## Playtest builds and release builds

The build decides, in `vite.config.ts`:

- **A dev build** (`pnpm dev`) is a playtest build sending to the laptop's
  own server (see "On a laptop").
- **A built game with `PLAYTEST_KEY`** in the environment is a playtest
  build: it sends to `PLAYTEST_URL` (the game's own address when empty, as
  on the web; a phone app sets the Worker's address), with that key, and
  `PLAYTEST_TESTER` names its tester when given.
- **Any other build is a release build.** `SHOOTER_PLAYTEST` is `null` as
  it is built, so `startApp` never imports the sender and the bundle leaves
  it out: no sender, no address, no key. `test/release.test.ts` builds both
  kinds and fails if the release build carries any of it; `pnpm check`
  runs it.

Every stage deployed to Cloudflare (`deploy/alchemy.run.ts`) is a playtest
build until the release (see "Releasing").

## What a run carries

The server holds no account, so each run carries what it needs to be read
on its own (`PlaytestRun`, `src/api/schemas.ts`):

- **Who played it**: the device (a random id, made the first time the
  playtest build runs on it) and the tester's name.
- **Which build**: the commit it was built from (`dev` for a dev build), so
  runs from before and after a change can be told apart.
- **What was played**: a quest at a rank, a tier, or nothing for a `?play`
  quick start (whose enemy level shows as 0), and the enemy level.
- **The team as it entered the arena**: each member's level, aspect, and
  relics.
- **How it went**: the arena's result.
- **Its log** (`RunLog`, recorded by `features/run-log.ts`): each wave's
  start and the damage taken in it; what hurt the team, by enemy and
  attack; each member's damage dealt and taken; each skill's uses and the
  blows it landed; each fall and what dealt it; dashes and switches. A
  killing blow counts its whole damage.
- **What it earned** (the account's `Earned`): pay, materials, discoveries,
  rewards, stars, chests. Nothing else of the account is sent: no account
  changes (training, ascending, looks) are recorded.

## Sending never gets in the way

- **An outbox on the device.** A run goes into the outbox (in the same
  storage as the save, `shooter.playtest.outbox`), then the outbox is sent,
  oldest first. A run that cannot be sent (no network, a phone in the
  field, the server down) waits, and goes when the game next starts or
  the device is back online. At most 200 runs wait; past that the oldest
  go.
- **Kept once.** Every run has its own id: one sent again after its answer
  was lost is kept once.
- **Never in the way.** Nothing waits on sending, and a failure is only
  logged. A run the server will never take (it names content the server's
  build does not know) is dropped rather than tried forever.

## Who the tester is, and opting in

A tester opts in by name. The name comes from the build
(`PLAYTEST_TESTER`; a dev build's is `dev`), or from the address: opening
the game once with `?tester=Robin` names this device's tester from then on
(remembered on the device). Without a name, nothing is recorded, not even
into the outbox. Opening it with `?tester=` and no name opts this device
out, over the build's name too, and lets go of what waited to be sent.

## The key and CORS

Every run is sent with the playtest key in a header (`x-playtest-key`);
the server refuses any other (`401`). The build carries the key, so it is
not a secret: it only keeps casual traffic out. Each stage has its own,
always the same (derived from the stage's name), unless `PLAYTEST_KEY` is
set where it deploys. No cookies are used, so a phone app can send from
its own origin: the server answers CORS for Capacitor's
(`capacitor://localhost`, `https://localhost`, `http://localhost`;
`appOrigins` in `src/server/http.ts`).

## The database

Prod's runs go to the playtest database, its own Alchemy stack
(`deploy/stacks/database.ts`, stage `shared`) that prod binds to by
reference. Every other stage (a pull request's preview, a laptop's
deployed stage) makes a database of its own with the same migrations,
destroyed with it, so only prod's runs are testers'.

- **One row a run** (`runs`, with what it earned as JSON), and its team,
  waves, what hurt, skills, and falls in their own tables
  (`migrations/0001_playtest.sql`).
- **Content ids are `TEXT`.** A run naming content the server's build does
  not know is refused as it arrives.
- **Migrations only add** and never change once merged. Deploying prod
  (by hand, see "Releasing") applies new ones first.
- **Logs stop growing.** Each device's last 200 runs keep their whole log
  (`keptLogs`); older runs keep their row and their team, and lose their
  waves, hurts, skills, and falls.
- **The accounts' database is retired.** Until October 2026 the account
  lived on the server, in `top-down-team-shooter-accounts`; nothing reads
  or writes it any more. It stays in `deploy/stacks/database.ts`, with the
  migrations it was made with (`deploy/stacks/accounts-migrations/`),
  until it is deleted by hand.

## Measuring play

`pnpm db` reads every tester's runs at once, as tables (see
`scripts/db.ts`): `testers` (who plays: devices, builds, runs, hours, last
seen), `summary` (per quest and rank: tries, clear rate, hits, clear time,
the wave lost at), `runs`, `run <id>` (one run in full, with what it
earned), `hurts` (what hurts teams most, and what makes them fall), and
`sql` for any other read query.

`pnpm runs` prints the same runs a readable line each, then what hurt the
most and how the skills did (see `scripts/runs.ts`); `--json` for the full
data.

Both take `--since 2d` (or a date), `--tester`, `--device`, `--build`, and
`--quest` to narrow the runs down, and read:

- **the deployed database**, with a read-only key: a Cloudflare token
  allowed only to read D1, made by `deploy/stacks/reader.ts` from a laptop
  with the admin profile and saved to `.env.database` (gitignored, readable
  by its owner only). Prod's by default, `--stage pr-12` for a preview's.
  Destroying the stack revokes it.
- **the dev server's database** with `--local` (`.data/playtest.sqlite`).

## Releasing

The game is a finished release (`vision.md`): it changes only when its
developer decides, and nothing changes it on its own.

- **Prod deploys by hand**: Actions, "Deploy", run from main (it applies
  the playtest database's new migrations, then deploys). Merging to main
  deploys nothing; pull requests still get their previews.
- **bevy-ts stays at `bevyTsRelease`**; `.github/workflows/bevy-ts.yml`
  moves it to a newer release only when started by hand.
- **Dev tools are a dev build's** (`pnpm dev`): the tuning panel and its
  saved numbers, the URL's quick starts and tools, and the monitor are not
  in a built game.
- **The release** (the day is written here when it comes): the hosted game
  is built without `PLAYTEST_KEY` (a release build), so it sends nothing;
  the Worker's `/api/` route and the playtest database can then go. From
  then on, a change to the save's shape needs a save migration (see
  [saves.md](saves.md)), and shipped content ids are permanent.

## On a laptop

`pnpm dev` is a playtest build: its runs go to the dev server's own
`/api`, the same server over a SQLite file (`.data/playtest.sqlite`,
gitignored), migrated as it opens, with the key `dev`. Read them with
`pnpm db --local` or `pnpm runs --local`; delete the file to start over.
The save itself is the browser's (see [saves.md](saves.md)).
