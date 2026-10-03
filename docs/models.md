# Models

How 3D models get into the game: what a model file must be, where it is
registered, and how a character, an enemy, or the arena starts using it.
Like `vision.md`, this records the rules; the code is in
`src/presentation/` (`models.ts`, `looks.ts`, `bodies.ts`, `puppet.ts`).

## The pieces

- **A model** is a glTF binary (`.glb`) exported into `art/`, next to its
  Blender source and the scripts that build and export it: one folder per
  character (`art/characters/crow/`), per enemy (`art/enemies/<kind>/`), and
  per environment kit (`art/environment/courtyard/`). A module in `src/presentation/assets/`
  imports the file and takes its numbers from the export's metadata
  (`assets/crow.ts`, `assets/courtyard.ts`), and `models` (`models.ts`)
  registers it by id. It is an asset, not content: content never names a
  model. The build bundles only the files the game imports.
- **A look** says what something looks like (`looks.ts`): every character
  (`characterLooks`), every enemy (`enemyLooks`), and the arena's floor,
  walls, and scenery (`arenaLook`). A look is a placeholder (a capsule, a
  box) or a model. The tables are keyed by content id, so a new character or
  enemy does not compile until it has a look.
- **Moments** say which clip plays when (`Moments` in `looks.ts`): loops
  for standing and moving, one-shots for an attack step, the power move, a
  dash, a skill, being hurt, an enemy's windup.

Giving something a model is: export it into `art/`, register it (its
module in `assets/` and its `models` entry), and point its look at it. No
system changes.
`test/looks.test.ts` checks every file has exactly the clips its spec lists
and every moment names a clip its model has.

## Characters

The game's characters are anime girls with normal proportions, not chibi
(the crow is a placeholder). Each is built from a character sheet
(`character-sheet.md`); `art/characters/abigail/` is the reference study,
and its scripts are the template.

- **Cel-shaded.** Its spec says `shading: "toon"`: its materials light in
  two flat tones, and each copy gets an outline that follows its skeleton,
  from 0.8 px in the arena to 2.2 px close up in the menu (`toon.ts`). Its
  face's normals lean forward and up in the file, so the shading's edge
  never crosses the face.
- **Proportions:** about 6.5 to 7 heads, the head drawn about 10% larger
  than a page figure's so it reads at 20 to 35 pixels tall.
- **Its contract with the game is the crow's:** scaled to its body's
  height, the clips its look's moments name (`Idle`, `Run`, `RunStart`,
  `RunStop`, `AttackCombo` in four sections with contacts, `Recover1`–`3`,
  `Power`, `Dash`), and a `weapon_grip` bone. Weapons attach as they are,
  so a character of a different size has its own scaled copies.
- **Review** with its inspector (the model drawn by the game's own code,
  at fixed clip times), at arena size on a phone beside the crow and
  close up, then in the live game.

## What a model file must be

- **glTF binary**, textures embedded, no Draco or other decoders, no lights,
  cameras, or helper objects.
- **Meters, +Y up, facing +Z**, standing on its origin (the ground point
  under it; between the feet for a body). The game scales it: a body to its
  look's height, a wall to its box, scenery by its `scale`.
- **Few materials.** Every material of every model on screen is a draw call.
  Prefer one palette texture shared by all parts (as the crow's body does).
- **Animation:** one armature, at most four weights per vertex, clips named
  as the moments will name them, played in place (no root motion: the game
  moves the body). Loops leave out their closing key (the first pose
  again); the spec's `loopSeconds` puts it back (`closeLoop`).
- **The spec** (`ModelSpec`): the file's url, its rest height in meters,
  and each clip's last key time and loop length (`null` for one-shots).
  Generate or copy these from the export's metadata; never edit them by hand.
  The crow exporter generates `assets/crow-timing.ts` alongside its GLBs.

## Animation follows the simulation

The simulation's timings decide, the clips follow (see `AGENTS.md`). A
one-shot is stretched over the moment's length in the simulation: an
attack step over the move's recovery, a dash over the dash, a windup over
the windup. Skills and hurt play at the clip's own length. Everything
freezes with the world during hit-stop. A clip never moves a body, and no
hit or hitbox ever comes from a clip.

Attack contact poses map to the simulation's hit time. Entry blends capture
the visible outgoing bone pose and finish by contact, including when a new
attack interrupts another range of the same clip. Recovery clips start at
the previous section's endpoint and carry any elapsed frame remainder.

## Budgets

- **Characters** are drawn with their own skeleton and materials.
- **Things that come in numbers** (enemies, projectiles) must be batched.
  Every current enemy uses one skinned mesh and one vertex-color material.
  `animation-atlas.ts` samples its GLB clips into a shared bone texture at
  load time; `batch.ts` supplies each instance's pose and interpolation.
  Each enemy kind costs one body draw call, regardless of its population.
  No per-enemy skeleton or animation mixer runs during play.
- Enemy rigs currently use 3–8 bones and 456–1,624 triangles. Keep new
  ordinary enemies under 2,000 triangles and 12 bones unless a measured
  need justifies more. See `art/enemies/README.md` for sources and checks.
- Keep a character under about 5,000 triangles and a 512 px texture; check
  new art at phone size on the network address.

Enemy attack poses follow `AttackPhase` and `Attacker.elapsed` directly:
`Windup`, `Active`, and `Recovery` stretch to content timings. Ranged attacks
with no active interval start recovery in their release pose. The guardian's
shield follows the simulation's shield facing independently of its attack.
`Idle`, `Run`, `Spawn`, and `Hurt` cover the rest of the lifecycle; the
training dummy has no locomotion or attack clips. A killed enemy does not
fall: its body is gone at the kill and bursts into particles in its color
(`view.death`). The models' `Death` clips stay in the files, unused.

Use `?stress=300,2000,mixed` to exercise all eight animated kinds in the live
arena (invulnerable test actors). The original `?stress=300,2000` still uses
stationary training dummies.

## Arena

The simulation's walls (`content/arena.ts`, the arena's edges) decide what
blocks movement and shots; the arena's look (`arenaLook`) only dresses
them, at one scale for the whole kit (`unitsPerMeter`, 70 today: the
courtyard's large pillar fits the arena's 70-unit pillars).

- **Floor:** `tiles` of square pieces laid edge to edge (as many as fit,
  stretched a little to fill the arena exactly; variants by place, quarter
  turns at random) over a base slab that shows in their joints, or the
  placeholder `grid`.
- **Edge walls:** a `run` of segments of a wall piece along each wall's
  long side, stretched to fill it and to its thickness. The front walls
  (toward the camera) use a low piece, so they never hide the player.
- **Pillars:** a `pillar` model standing on each pillar's box, scaled evenly
  to its footprint, picked by the footprint closest to the box (variants of
  that size by place). They fade when the player is behind them.
- **Scenery:** props placed for looks only, at the arena's scale. They must
  not look solid where nothing blocks: keep them against the edges.

Floor tiles, wall segments, and props must be one mesh with one material,
so each model is drawn as one batch however many copies there are.

The courtyard kit is used straight from `art/environment/courtyard/models/`
(`assets/courtyard.ts` registers the pieces in use, with sizes from its
`manifest.json`); the build bundles the files it uses.
