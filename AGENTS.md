# Agents guide

A top-down action game for the phone (and the browser), built on the
`@typeonce/bevy-ts` ECS. **Read `docs/vision.md` first**: it is the game's
design direction (pillars, non-goals, open questions). Design decisions are
checked against it; open questions are asked, not guessed. Detailed rules
for one area live next to it (`docs/elements.md`: elements, states, bursts,
ground effects, enemy traits; `docs/aspects.md`: classes, aspects, and how
they are owned and equipped; `docs/relics.md`: relics, their slots and
tiers; `docs/enemies.md`: enemy movesets, behaviors,
fairness, and measuring difficulty; `docs/models.md`: 3D models and looks;
`docs/spirits.md`: characters' spirits, from a character sheet to the game;
`docs/quests.md`: quests, stars, ranks, materials, and ascension;
`docs/roster.md`: who the characters are (element, class, role), and how
support is set up;
`docs/server.md`: the server, the API, players, and the database).

## Commands

- `pnpm dev --host --port 5199`: dev server, reachable from a phone on the
  same network (plain HTTP there is not a secure context: no
  `crypto.randomUUID`, clipboard, and similar).
  It also answers `/api` with the game's server over a local SQLite file
  (`.data/dev.sqlite`, see `docs/server.md`): sign up as many players as
  needed, and delete the file to start over.
- `pnpm check`: typecheck, lint, and tests. Run it before every commit.
- Deploying (Cloudflare, with Alchemy): `deploy/` is its own package
  (`pnpm --dir deploy install`) holding `deploy/alchemy.run.ts`. From
  `deploy/`, `pnpm alchemy deploy` builds and deploys your own stage
  (`live_<user>`); `pnpm alchemy destroy` removes it. CI
  (`.github/workflows/deploy.yml`) deploys `prod` from main and a `pr-<n>`
  preview per pull request, building against the published bevy-ts release
  in package.json `bevyTsRelease` (`scripts/use-published-bevy-ts.ts` does
  the swap). Its Cloudflare secrets come from `deploy/stacks/github.ts`.
  Every stage shares one database (`deploy/stacks/database.ts`), which
  main's CI deploys (applying new migrations) before prod.
  Bumping `bevyTsRelease` is automatic: `.github/workflows/bevy-ts.yml`
  checks npm hourly, checks the game against a new release, commits the
  bump to main, and deploys prod.
- `pnpm effect-source`: puts the source of the Effect release the game
  uses in `.repos/effect` (a single-commit copy of github.com/Effect-TS/effect
  at the installed version's tag, gitignored; rerun after upgrading Effect).
  Read it to learn how Effect works and how it is meant to be used before
  writing Effect code: `LLMS.md` and `ai-docs/` there are its own guides
  (services, errors, Schema, `HttpApi`, SQL, testing), and `packages/` its
  source, which is the truth when a guide and the code disagree.
- `pnpm runs`: a player's runs as the server kept them, with their logs
  (what hurt, skills, falls, by wave), or `--events` for the account's
  gains and spending; logs in as the player (`RUNS_URL`, `RUNS_USERNAME`,
  `RUNS_PASSWORD`, or `.env.runs`). Tune against these (see
  `docs/server.md`).
- `pnpm db`: every player's runs and account changes, read from the
  database with the read-only key in `.env.database` (made by
  `deploy/stacks/reader.ts`): `players`, `summary`, `runs`, `run <id>`,
  `hurts`, `events`, `sql` (see `docs/server.md`, "Measuring play").
- `pnpm calls`: the Spirit Call's pace (when characters come from calls
  along the quest line; see `docs/calls.md`). Run it after changing crystal
  rewards or call numbers.
- `pnpm progression`: a new account played through the main line on the
  account's rules (levels, farming, materials, trials; see
  `docs/quests.md`). Run it after changing rewards, costs, or quests.
- `pnpm expected`: every quest, side quest, rank, hardcore tier, and trial
  rank fought by the bot with the team a new account has when it opens
  (from `pnpm progression`): cleared or not, and hits beside the hit budget.
- `pnpm balance --matrix`: every character with every aspect of her
  class, at the enemies' level, side by side (a skilled and a learning
  bot; see `docs/balance.md` for how to read it). Run it after changing
  characters, kits, aspects, or relics.
- `pnpm lab`: the difficulty lab (a bot fights every wave of every
  challenge; see `docs/enemies.md`). Run it before and after tuning enemies.
- `/tools/progress/` on the dev server: a dev-only design aid projecting a
  new account's journey from the game's numbers, editable live (see
  `tools/progress/README.md`). It never edits content or ships.
- `?play` in the URL skips the menu (with `?team=swordsman,tidecaller`,
  `?character=`, `?aspect=`, `?challenge=` for a quick start, and `?arena=` to
  fight every challenge in one arena, `?wave=4` to start every challenge at a
  wave, and `?openCalls` to clear chapter one
  and add crystals once, to try the Spirit Call, and `?charged` to keep the
  team's energy full, to try ultimates); backquote (or the key left of 1 or of Z)
  opens the tuning panel (live numbers, spawns and elite spawns, "Unlock all", "Open the Call").

## How the code is organized

- `src/content/`: the game's content as data (characters, classes, aspects
  and what their moves set off, relics, skills, enemies, challenges, quests, hardcore tracks,
  discoveries, currencies, progression numbers, the starter set, the Spirit
  Call's banners and odds). Adding
  content is mostly adding entries; new kinds (a new effect, condition, or
  objective) extend the vocabulary in one place.
- The arena is a black box to everything around it: it is entered with a
  team (one to three builds: a character at her level and the aspect
  equipped on her; each character brings her own kit), a challenge, and an enemy level, and
  reports a `RunResult`. Quests, hardcore tiers, levels,
  currencies, and rewards live in the account and the shell, never in the
  simulation.
- Simulation (`src/features/`, `src/schema.ts`, `src/schedules.ts`, physics,
  math, config): the ECS. Deterministic (time and randomness come from the
  world's `Time` and `Rng`), headless, and tested without a browser.
- `src/presentation/`: rendering (Three.js), sounds, effects, and the in-arena
  HUD (plain DOM). The world is 3D (low-poly), seen by an orthographic
  camera whose view of the floor is exactly `src/math/iso.ts`'s projection
  (`test/camera.test.ts`), so input and the overlay work in projected
  coordinates. Things that come in numbers (enemies, projectiles, shadows,
  damage numbers) are drawn in batches, never a mesh each.
- `src/ui/`: the menu, pause, and results screens (Preact with signals). The UI
  mirrors state and calls plain action functions; it never changes game
  state directly. Screens are built from a kit of shared pieces
  (`src/ui/kit/`, and the game's own in `src/ui/menu/parts.tsx`), laid out
  for a phone in landscape and scaled as one piece: read `docs/menu-ui.md`
  before adding or changing one.
- `src/account/`: the account's pure rules (`account.ts`, `calls.ts`), the
  account as stored (`convert.ts`), and the device's own settings (Effect,
  a `KeyValueStore`). The account itself lives on the server.
- `src/api/` and `src/server/`: the game's HTTP API (Effect `HttpApi`,
  shared by both sides) and the server (a Cloudflare Worker over D1; SQLite
  locally): players, sessions, and the account in tables, every change one
  of the account's rules (see `docs/server.md`). `src/app/app.ts` is the
  game's side: the login, and the account through the API.

`tools/lint/plugin.mjs` enforces these boundaries (which part may import
which, Effect imported by module, no clocks or `Math.random` in the
simulation); `pnpm check` runs it.

## Conventions

- Commit after each step (small, focused commits with a message explaining
  why); push only when asked.
- Shipped content ids are permanent: accounts (the server's tables) refer to them.
  `test/content-ids.json` lists them; add new ids there, and never rename or
  remove one without a database migration. Until the game opens to players,
  a reset of every account may take the migration's place (see
  `docs/server.md`, "The database").
- `validateContent` (`src/content/validate.ts`) holds the rules content must
  follow beyond its types; extend it when adding content with new rules.
- Comments explain intent in plain language, matching the surrounding code.
- Player-facing copy (content descriptions, menus, the HUD) uses no
  gendered pronouns: "you/your" for what happens in a fight ("Dashing
  leaves a puddle where you dashed from"), and the character's name or
  "this character" in menus.
- Verify gameplay and UI changes in a real browser, on the network address
  (not only localhost), including a phone-sized viewport with touch input.
- Animation follows the simulation, never the other way round: timings
  (windups, hits, recoveries) live in content and the simulation, and clips
  are sped up or slowed down to fit them. No root motion, and no hitboxes
  from animation.
- What a character, an enemy, or the arena looks like (a placeholder or a
  model, and which clip plays at which moment) is `src/presentation/looks.ts`,
  keyed by content id; content holds no asset paths. Models follow
  `docs/models.md`.
