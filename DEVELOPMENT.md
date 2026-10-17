# Developing Spirit Call

[← back to the README](README.md)

Spirit Call is a TypeScript game. The fight runs on the
[Ritmo](https://github.com/typeonce-dev/ritmo) ECS at a fixed step:
deterministic (time and randomness come from the world), headless, and
tested without a browser. [Three.js](https://threejs.org) draws the
low-poly world and [Preact](https://preactjs.com) the menus; the save and
the playtest server are written with [Effect](https://effect.website).

## Getting started

```sh
pnpm engine:prepare           # fetches and builds the pinned Ritmo commit (until it is on npm)
pnpm install
pnpm dev --host --port 5199   # reachable from a phone on the same network
pnpm check                    # typecheck, lint, and tests: run it before every commit
```

Saves live in the browser (delete an account from the list, or clear the
site's data, to start over). A dev build is a playtest build: the runs you
play go to the dev server's own `/api`, over a local SQLite file in
`.data/`.

In a dev build, `?play` in the URL skips the menu
(`?play&team=swordsman,tidecaller&challenge=…` for a quick start, `?charged`
to keep the team's energy full), and backquote opens the tuning panel.

## Measuring the game

A bot plays the game headless, so difficulty and pace are measured rather
than guessed:

```sh
pnpm lab              # every wave of every challenge, fought by the bot
pnpm balance --matrix # every character with every aspect of its class, side by side
pnpm expected         # every quest, rank, and trial, fought with a new account's team
pnpm progression      # a new account played through the whole game: when each thing arrives
pnpm perf             # the worst-case frame times, in headless Chrome
```

## The phone apps

```sh
pnpm app          # builds the game into the Android and iOS projects (Capacitor)
pnpm app:android  # …and opens Android Studio
pnpm app:ios      # …and opens Xcode
```

See [docs/mobile.md](docs/mobile.md).

## How the code is organized

| Where | What |
|---|---|
| `src/content/` | the game as data: characters, skills, enemies, challenges, quests, relics, rewards |
| `src/features/`, `src/schema.ts` | the simulation (the ECS): deterministic and headless |
| `src/presentation/` | rendering (Three.js), sounds, effects, and the in-arena HUD |
| `src/ui/` | the menus, pause, and results screens (Preact with signals) |
| `src/account/` | the account's rules and the save, with every version of it |
| `src/app/` | the shell: the Effect runtime and where the device keeps things |
| `src/api/`, `src/server/` | the playtest API and server (a Cloudflare Worker over D1) |
| `deploy/` | deploying to Cloudflare with [Alchemy](https://alchemy.run) |
| `art/` | the sources of the 3D models (Blender) and how they are made |

`tools/lint/plugin.mjs` enforces the boundaries between them (which part
may import which, no clocks or `Math.random` in the simulation).

## Design documents

Design decisions are checked against [the vision](docs/vision.md). The
rest of `docs/` covers one area each:
[elements](docs/elements.md), [classes and aspects](docs/aspects.md),
[relics](docs/relics.md), [enemies](docs/enemies.md),
[the roster](docs/roster.md), [quests](docs/quests.md),
[the collection](docs/collection.md), [balance](docs/balance.md),
[3D models](docs/models.md), [spirits](docs/spirits.md),
[the menus](docs/menu-ui.md), [saves](docs/saves.md),
[the phone apps](docs/mobile.md), [playtesting](docs/playtest.md), and
[local workflows](docs/local-workflows.md).

[AGENTS.md](AGENTS.md) is the full guide for working on the code, written
for coding agents and just as useful for people.
