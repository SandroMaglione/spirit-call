# Models

How 3D models get into the game: what a model file must be, where it is
registered, and how a character, an enemy, or the arena starts using it.
Like `vision.md`, this records the rules; the code is in
`src/presentation/` (`models.ts`, `looks.ts`, `bodies.ts`, `puppet.ts`).

## The pieces

- **A model** is a glTF binary (`.glb`) in `src/presentation/assets/`, with
  its numbers in a module next to it (`assets/crow.ts`), registered by id in
  `models` (`models.ts`). It is an asset, not content: content never names a
  model.
- **A look** says what something looks like (`looks.ts`): every character
  (`characterLooks`), every enemy (`enemyLooks`), and the arena's floor,
  walls, and scenery (`arenaLook`). A look is a placeholder (a capsule, a
  box) or a model. The tables are keyed by content id, so a new character or
  enemy does not compile until it has a look.
- **Moments** say which clip plays when (`Moments` in `looks.ts`): loops
  for standing and moving, one-shots for an attack step, the power move, a
  dash, a skill, being hurt, an enemy's windup.

Giving something a model is: drop the file in `assets/`, add its module and
its `models` entry, and point its look at it. No system changes.
`test/looks.test.ts` checks every file has exactly the clips its spec lists
and every moment names a clip its model has.

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
  Copy these from the export's metadata; never edit them by hand.

## Animation follows the simulation

The simulation's timings decide, the clips follow (see `AGENTS.md`). A
one-shot is stretched over the moment's length in the simulation: an
attack step over the move's recovery, a dash over the dash, a windup over
the windup. Skills and hurt play at the clip's own length. Everything
freezes with the world during hit-stop. A clip never moves a body, and no
hit or hitbox ever comes from a clip.

## Budgets

- **Characters and a few large enemies** are each drawn on their own (their
  own skeleton and materials): fine for the team and a boss or two.
- **Things that come in numbers** (swarms, projectiles) must be batched:
  today they are capsules and primitives drawn as one instance batch per
  shape (`batch.ts`). A swarm enemy's model must be a single static mesh
  with one material, so it can join a batch the same way (its motion done
  by moving the instance, or later by animation baked into a texture).
- Keep a character under about 5,000 triangles and a 512 px texture; check
  new art at phone size on the network address.

## Arena

The simulation's walls (`content/arena.ts`, the arena's edges) decide what
blocks movement and shots; the arena's look only dresses them. A wall model
is stretched to fill each wall's box (footprint and the view's wall height),
so model pillars as a unit block. Scenery is for looks only and must not
look solid where nothing blocks; when a scenery model brings its own floor,
set the floor look to `none`.
