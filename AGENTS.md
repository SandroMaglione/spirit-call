# Agents guide

A top-down action game for the phone (and the browser), built on the
`@typeonce/bevy-ts` ECS. **Read `docs/vision.md` first**: it is the game's
design direction (pillars, non-goals, open questions). Design decisions are
checked against it; open questions are asked, not guessed. Detailed rules
for one area live next to it (`docs/elements.md`: elements, states, ground
effects, enemy traits).

## Commands

- `pnpm dev --host --port 5199`: dev server, reachable from a phone on the
  same network (plain HTTP there is not a secure context: no
  `crypto.randomUUID`, clipboard, and similar).
- `pnpm check`: typecheck, lint, and tests. Run it before every commit.
- Deploying (Cloudflare, with Alchemy): `deploy/` is its own package
  (`pnpm --dir deploy install`) holding `deploy/alchemy.run.ts`. From
  `deploy/`, `pnpm alchemy deploy` builds and deploys your own stage
  (`live_<user>`); `pnpm alchemy destroy` removes it. CI
  (`.github/workflows/deploy.yml`) deploys `prod` from main and a `pr-<n>`
  preview per pull request, building against the published bevy-ts release
  in package.json `bevyTsRelease` (bump it after each bevy-ts release the
  game needs; `scripts/use-published-bevy-ts.ts` does the swap). Its
  Cloudflare secrets come from `deploy/stacks/github.ts`.
- `?play` in the URL skips the menu (with `?character=`, `?weapon=`,
  `?challenge=` for a quick start); backquote opens the tuning panel
  (live numbers, spawns, "Unlock all").

## How the code is organized

- `src/content/`: the game's content as data (characters, weapons and their
  passives, attacks, skills, enemies, challenges, quests, hardcore tracks,
  currencies, progression numbers, the starter set). Adding content is
  mostly adding entries; new kinds (a new effect, condition, or objective)
  extend the vocabulary in one place.
- The arena is a black box to everything around it: it is entered with a
  build (character and weapon at their levels, skills), a challenge, and an
  enemy level, and reports a `RunResult`. Quests, hardcore tiers, levels,
  currencies, and rewards live in the account and the shell, never in the
  simulation.
- Simulation (`src/features/`, `src/schema.ts`, `src/schedules.ts`, physics,
  math, config): the ECS. Deterministic (time and randomness come from the
  world's `Time` and `Rng`), headless, and tested without a browser.
- `src/presentation/`: rendering (Pixi), sounds, effects, and the in-arena
  HUD (plain DOM).
- `src/ui/`: the menu and results screens (Preact with signals). The UI
  mirrors state and calls plain action functions; it never changes game
  state directly.
- `src/account/` and `src/app/`: the player's account and device settings,
  saved with Effect (Schema, versioned saves with migrations, a
  `KeyValueStore`). `src/account/account.ts` holds the account's pure rules.

`tools/lint/plugin.mjs` enforces these boundaries (which part may import
which, Effect imported by module, no clocks or `Math.random` in the
simulation); `pnpm check` runs it.

## Conventions

- Commit after each step (small, focused commits with a message explaining
  why); push only when asked.
- Shipped content ids are permanent: saves refer to them.
  `test/content-ids.json` lists them; add new ids there, and never rename or
  remove one without a save migration.
- `validateContent` (`src/content/validate.ts`) holds the rules content must
  follow beyond its types; extend it when adding content with new rules.
- Comments explain intent in plain language, matching the surrounding code.
- Verify gameplay and UI changes in a real browser, on the network address
  (not only localhost), including a phone-sized viewport with touch input.
