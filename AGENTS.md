# Agents guide

A top-down action game for the phone (and the browser), built on the
`@typeonce/ritmo` ECS. **Read `docs/vision.md` first**: it is the game's
design direction (pillars, non-goals, open questions). Design decisions are
checked against it; open questions are asked, not guessed. Detailed rules
for one area live next to it (`docs/elements.md`: elements, states, bursts,
ground effects, enemy traits; `docs/aspects.md`: classes, aspects, and how
they are owned and equipped; `docs/relics.md`: relics, their slots and
tiers; `docs/enemies.md`: enemy movesets, behaviors,
fairness, and measuring difficulty; `docs/models.md`: 3D models and looks;
`docs/spirits.md`: characters' spirits, from a character sheet to the game;
`docs/quests.md`: quests, stars, ranks, materials, and ascension;
`docs/collection.md`: how every character, aspect, relic, and look is
owned, auditions, and the game's pace;
`docs/roster.md`: who the characters are (element, class, role), and how
support is set up;
`docs/saves.md`: the account saved on the device, and its versions;
`docs/controls.md`: input devices (keyboard and mouse, touch, gamepad),
how they become the same commands, and remapping;
`docs/mobile.md`: the Android and iOS apps (Capacitor);
`docs/playtest.md`: playtest builds, the runs they send, the server that
keeps them, and releasing).

## Commands

- This branch pins `ritmoSource` until the new packages are published. Run
  `pnpm engine:prepare` before the first `pnpm install --frozen-lockfile`.
  The helper fetches and builds that exact commit in `.repos/ritmo-preview/`;
  no sibling checkout is required. Remove the source pin and run it again
  when `ritmoRelease` is available on npm.

- `pnpm dev --host --port 5199`: dev server, reachable from a phone on the
  same network (plain HTTP there is not a secure context: no
  `crypto.randomUUID`, clipboard, and similar).
  Accounts are saved in the browser, as many as you make (see
  `docs/saves.md`; delete one from the list, or clear the site's data to
  start over). A dev build is a playtest build: its runs go
  to the dev server's own `/api`, over a local SQLite file
  (`.data/playtest.sqlite`, see `docs/playtest.md`).
- `pnpm check`: typecheck, lint, and tests. Run it before every commit.
- `pnpm app`: builds the game into the Android and iOS apps (Capacitor;
  `pnpm app:android` and `pnpm app:ios` then open Android Studio or Xcode).
  See `docs/mobile.md`.
- Deploying (Cloudflare, with Alchemy): `deploy/` is its own package
  (`pnpm --dir deploy install`) holding `deploy/alchemy.run.ts`. From
  `deploy/`, `pnpm alchemy deploy` builds and deploys your own stage
  (`live_<user>`, with a database of its own); `pnpm alchemy destroy`
  removes it. Deployments, balance audits, and native builds run locally;
  GitHub runs only `pnpm check` (`.github/workflows/check.yml`). For a
  release, use the published bevy-ts version in package.json
  `ritmoRelease` (`scripts/use-ritmo.ts` does the swap in a
  clean worktree). `pnpm release` deploys `prod`, the release at
  spirit-call.typeonce.dev: static files alone, no Worker code or database.
  Apply the shared database migrations before deploying `playtest`. See `docs/local-workflows.md` for the commands and
  `docs/playtest.md`, "Releasing", for the stage rules.
- `pnpm effect-source`: puts the source of the Effect release the game
  uses in `.repos/effect` (a single-commit copy of github.com/Effect-TS/effect
  at the installed version's tag, gitignored; rerun after upgrading Effect).
  Read it to learn how Effect works and how it is meant to be used before
  writing Effect code: `LLMS.md` and `ai-docs/` there are its own guides
  (services, errors, Schema, `HttpApi`, SQL, testing), and `packages/` its
  source, which is the truth when a guide and the code disagree.
- `pnpm runs`: testers' runs as playtest builds sent them, a line each with
  their logs (what hurt, skills, falls, by wave). Tune against these (see
  `docs/playtest.md`).
- `pnpm db`: the same runs as tables: `testers`, `summary`, `runs`,
  `run <id>`, `hurts`, `sql` (see `docs/playtest.md`, "Measuring play").
  Both read the deployed playtest database with the read-only key in
  `.env.database` (made by `deploy/stacks/reader.ts`), or the dev server's
  with `--local`, and pick runs with `--tester`, `--device`, `--build`,
  `--quest`, and `--since`.
- `pnpm progression`: a new account played through the whole game on the
  account's rules (levels, farming, essence, trials, auditions, the
  collection; see `docs/collection.md`): the hour each thing arrives, when
  everything is owned (about 55 hours), and when all ten characters reach
  the top (about 100). `--lost 0.25` loses a share of runs (the measure the
  targets are for). Run it after changing rewards, costs, or quests.
- `pnpm expected`: every quest, side quest, rank, hardcore tier, and trial
  rank fought by the bot with the team a new account has when it opens
  (from `pnpm progression`): cleared or not, and hits beside the hit budget.
- `pnpm balance --matrix`: every character with every aspect of her
  class, at the enemies' level, side by side (a skilled and a learning
  bot; see `docs/balance.md` for how to read it). Run it after changing
  characters, kits, aspects, or relics.
- `pnpm lab`: the difficulty lab (a bot fights every wave of every
  challenge; see `docs/enemies.md`). Run it before and after tuning enemies.
- `pnpm perf`: how long frames take in the worst case: each performance
  scene (`src/dev/perf-scene.ts`, a crowd hit by a whole team at once)
  played in headless Chrome (`CHROME_PATH`) at 1x, 4x, and 6x CPU
  slowdown, read from the page's raw samples, a CPU profile, and a trace
  (`--label <name>` writes `.data/perf/<name>.json`, `--compare <json>`
  prints the change). `node --import tsx scripts/stress.ts --scene crowd`
  times the same fight's simulation steps in Node (`--systems` adds up the
  time in each system). Effects, sounds, and shaders have budgets: see
  `docs/models.md`, "Budgets". Run both before and
  after work on speed; `test/determinism.test.ts` proves the simulation
  still plays exactly the same.
- `/tools/progress/` on the dev server: a dev-only design aid projecting a
  new account's journey from the game's numbers, editable live (see
  `tools/progress/README.md`). It never edits content or ships.
- In a dev build only (`pnpm dev`): `?play` in the URL skips the menu (with `?team=swordsman,tidecaller`,
  `?character=`, `?aspect=`, `?challenge=` for a quick start, and `?arena=` to
  fight every challenge in one arena, `?wave=4` to start every challenge at a
  wave, and `?charged` to keep the
  team's energy full, to try ultimates); `?perf=crowd,30` (or `crowd-fire`,
  `kills`) plays a performance scene and shows a summary of frame times
  when its script ends (open it on a phone over the network); backquote (or the key left of 1 or of Z)
  opens the tuning panel (live numbers, spawns and elite spawns).

## How the code is organized

- `src/content/`: the game's content as data (characters, classes, aspects
  and what their moves set off, relics, skills, enemies, challenges, quests, hardcore tracks,
  auditions, discoveries, gold and essence, progression numbers, the starter
  set, and where everything is owned from, `collection.ts`). Adding
  content is mostly adding entries; new kinds (a new effect, condition, or
  objective) extend the vocabulary in one place.
- The arena is a black box to everything around it: it is entered with a
  team (one to three builds: a character at her level and the aspect
  equipped on her; each character brings her own kit), a challenge, and an enemy level, and
  reports a `RunResult`. Quests, hardcore tiers, levels,
  currencies, and rewards live in the account and the shell, never in the
  simulation.
- Simulation (`src/features/`, `src/schema.ts`, `src/schedules.ts`, physics,
  math, config): the ECS. Deterministic (time comes from the world's `Time`,
  randomness from `Random.draw(resources.rng)`, and trigonometry, `exp`,
  `pow`, `hypot`, and `a ** b` from `Ops`, which returns the same bits on
  every device), headless, and tested without a browser. Vectors, swept
  collision, the spatial grid, the flow field, random numbers, and that math
  come from `@typeonce/ritmo-math` (`Vec2`, `Box2`, `Collide2`, `SpatialGrid`,
  `FlowField`, `Random`, `Ops`); content (`src/content/`) may import `Ops`.
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
- `src/account/`: the account's pure rules (`account.ts`), the account as
  stored (`convert.ts`, `stored.ts`, with every version of the save), and
  the stores that keep the account and the device's settings (Effect, over
  a `KeyValueStore`; see `docs/saves.md`).
- `src/app/`: the shell (`app.ts`): the Effect runtime, given where the
  device keeps things (`storage.ts`, the one module a phone build swaps),
  and plain functions for the rest of the game; and a playtest build's
  sender (`playtest.ts`, `playtest-send.ts`).
- `src/api/` and `src/server/`: the playtest API (Effect `HttpApi`, shared
  by the sender and the server) and the server that keeps the runs
  playtest builds send (a Cloudflare Worker over D1; SQLite locally; see
  `docs/playtest.md`). A release build contains none of it.

`tools/lint/plugin.mjs` enforces these boundaries (which part may import
which, Effect imported by module, no casts that switch type checking off),
and `@typeonce/oxlint-plugin-ritmo` keeps the simulation and content
deterministic and headless (no clocks, timers, `Math.random`, `Math.sin` and
the like, the page, or `Infinity` in their data) and every
`runtime.tick(...)` result checked (tests wrap one with `expectOk(...)`);
`pnpm check` runs both. Each report names what to use instead.

## Conventions

- Commit after each step (small, focused commits with a message explaining
  why); push only when asked.
- Shipped content ids are permanent: saves on players' devices refer to them.
  `test/content-ids.json` lists them; add new ids there, and never rename or
  remove one without a save migration (see `docs/saves.md`). Until the
  release, a renamed id may instead move to `retired`, and testers' saves
  lose what it named.
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
