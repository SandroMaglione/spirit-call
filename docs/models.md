# Models

How 3D models get into the game: what a model file must be, where it is
registered, and how a character, an enemy, or the arena starts using it.
Like `vision.md`, this records the rules; the code is in
`src/presentation/` (`models.ts`, `looks.ts`, `bodies.ts`, `puppet.ts`).

## The pieces

- **A model** is a glTF binary (`.glb`) exported into `art/`, next to its
  Blender source and the scripts that build and export it: one folder per
  spirit (`art/spirits/<element>/`: in the arena a character shows as her
  spirit, see `spirits.md`), per enemy (`art/enemies/<kind>/`), and per
  environment kit (`art/environment/courtyard/`). (`art/characters/crow/`
  is the first placeholder character, kept as a scale reference for
  environment previews; the game no longer uses it.) A module in
  `src/presentation/assets/` imports the file and takes its numbers from
  the export's metadata (`assets/water-spirit.ts`, `assets/courtyard.ts`), and `models` (`models.ts`)
  registers it by id. It is an asset, not content: content never names a
  model. The build bundles only the files the game imports.
- **A look** says what something looks like (`looks.ts`): every character
  (`characterLooks`), every enemy (`enemyLooks`), and every arena's floor,
  walls, and scenery (`arenaLooks`, one environment kit each: the courtyard,
  the flooded cistern, the ember kilnworks, the overgrown sanctuary). A look
  is a placeholder (a capsule, a box) or a model. The tables are keyed by
  content id, so a new character, enemy, or arena does not compile until it
  has a look.
- **Moments** say which clip plays when (`Moments` in `looks.ts`): loops
  for standing and moving, one-shots for an attack step, the power move, a
  dash, a skill, being hurt, an enemy's windup.

Giving something a model is: export it into `art/`, register it (its
module in `assets/` and its `models` entry), and point its look at it. No
system changes.
`test/looks.test.ts` checks every file has exactly the clips its spec lists
and every moment names a clip its model has.

## What a model file must be

- **glTF binary**, textures embedded, no Draco or other decoders, no lights,
  cameras, or helper objects.
- **Meters, +Y up, facing +Z**, standing on its origin (the ground point
  under it; between the feet for a body). The game scales it: a body to its
  look's height, a wall to its box, scenery by its `scale`.
- **Few materials.** Every material of every model on screen is a draw call.
  Prefer one palette texture shared by all parts, or vertex colors (as the
  spirits do).
- **Animation:** one armature, at most four weights per vertex (or, for a
  model without a skeleton like the spirits, clips keyed on its objects),
  clips named as the moments will name them, played in place (no root motion: the game
  moves the body). A combat clip may lean into its blow over its feet (a
  spirit's lunge or kick, well inside its own width) as long as it starts
  and ends on the spot. Loops leave out their closing key (the first pose
  again); the spec's `loopSeconds` puts it back (`closeLoop`).
- **The spec** (`ModelSpec`): the file's url, its rest height in meters,
  and each clip's last key time and loop length (`null` for one-shots).
  Generate or copy these from the export's metadata; never edit them by hand.
  The spirits' exporters generate `assets/<spirit>-spirit.ts` alongside their GLBs.

## Animation follows the simulation

The simulation's timings decide, the clips follow (see `AGENTS.md`). A
one-shot is stretched over the moment's length in the simulation: an
attack step over the move's recovery, a dash over the dash, a windup over
the windup. Skills and hurt play at the clip's own length. Everything
freezes with the world during hit-stop. A clip never moves a body, and no
hit or hitbox ever comes from a clip.

Attack contact poses map to the simulation's hit time. Entry blends capture
the visible outgoing pose (of its bones, or of the objects its clips move)
and finish by contact, including when a new
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
- Enemy rigs currently use 3–12 bones and 740–1,974 triangles. Keep new
  ordinary enemies under 2,000 triangles and 12 bones unless a measured
  need justifies more. See `art/enemies/README.md` for sources and checks.
- Keep a character under about 5,000 triangles and a 512 px texture; check
  new art at phone size on the network address.

Enemy attack poses follow `AttackPhase` and `Attacker.elapsed` directly:
`Windup`, `Active`, and `Recovery` stretch to content timings. Ranged attacks
with no active interval start recovery in their release pose. The guardian's
shield follows the simulation's shield facing independently of its attack.
`Idle`, `Run`, `Spawn`, and `Hurt` cover the rest of the lifecycle. The three
training dummy variants keep Idle during knockback; the Sparring Dummy's
striking arm follows its simulated swing. A killed enemy does not
fall: its body is gone at the kill and bursts into particles in its color
(`view.death`). The models' `Death` clips stay in the files, unused.

Use `?stress=300,2000,mixed` to exercise all fifteen animated kinds in the live
arena (invulnerable test actors). The original `?stress=300,2000` still uses
stationary training dummies.

## Arena

The simulation's walls (`content/arena.ts`, the arena's edges) decide what
blocks movement and shots; the arena's look only dresses them, at one scale
for the whole kit (`unitsPerMeter`, 70 today: a kit's large pillar fits the
arena's 70-unit pillars). Low `inner` walls are runs of the kit's low wall,
so they never hide the player. A kit's pieces are registered from its
manifest (`presentation/assets/<arena>.ts`, prefixed with the arena's id).

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
- **Props:** what stands in the arena and blocks (`props` in
  `content/arena.ts`: a throne, a brazier, a crate). The look names each
  one's model and turn, in the same order; it stands on its box at the
  arena's scale and fades like a pillar in front of the player.
  `test/looks.test.ts` keeps the model about the size of its box.
- **Scenery:** pieces placed for looks only, at the arena's scale. Only for
  what nobody would expect to block (flat or tiny things): anything that
  looks solid is a prop.
- **Floor:** besides its tiles, a `border` (other tiles along the walls) and
  `inlays` (single tiles chosen by hand: a medallion in the middle).
- **Exterior paving:** `apronTiles` extends the tiled floor beyond the boundary
  walls. Structures placed there are scenery, supported by the paving and
  unreachable past the simulation's boundary. The apron changes no collisions.
- **Off-center pieces:** `ModelSpec.footprintCenter` comes from the export bounds.
  Static placements use it to center the visible footprint on its collision box
  or scenery point, including when the model turns.
- **Its own tones:** the color beyond the walls (`background`), its pools'
  tones and stone rim (`pools`), its light (`light`), and the flames in its
  props (`fires`: they flicker and shed embers).

Floor tiles, wall segments, and props must be one mesh with one material,
so each model is drawn as one batch however many copies there are.

The courtyard kit is used straight from `art/environment/courtyard/models/`
(`assets/courtyard.ts` registers the pieces in use, with sizes from its
`manifest.json`); the build bundles the files it uses.

## Finished enemy roster

Enemy game exports receive a finishing pass after their reference-fitting
animation recipes. See [the roster changes](enemy-roster-polish.md) and
[rebuild instructions](../art/enemies/polish-tools/README.md). The final animated
source is editable; static production sources preserve the reference benchmark.
Joint sleeves follow both adjoining bones, and `_GLOW` marks luminous regions
within the same crowd material. Simulation owns contact timing and facing.
