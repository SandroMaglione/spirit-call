# Enemy models

Original low-poly creatures for the current eight enemy IDs. Blender sources,
portable animated GLBs, generated metadata and a reference PNG live beside each
recipe. There is no separate viewer; inspect motion in Blender or the live game.

| Content ID | Design and attack pose | Triangles | Bones | Reference |
| --- | --- | ---: | ---: | --- |
| dummy | Padded training post; wobbles when struck | 676 | 3 | [PNG](dummy/reference.png) |
| chaser | Rust-colored hook creature; draws back its striking arm | 1,540 | 8 | [PNG](chaser/reference.png) |
| shooter | Blue bell-mouth creature; expands its muzzle for volley/spray | 1,180 | 8 | [Approved source](shooter/production/README.md) |
| brute | Pale-brow stone heavyweight; raises fists to slam, lifts a foot to stomp | 1,612 | 7 | [Approved source](brute/production/README.md) |
| swarmer | Red-shell pest with projecting fangs; compresses and lifts into a bite | 984 | 7 | [Approved source](swarmer/production/README.md) |
| charger | Firebomber; raises its bomb to lob, swipes with its free hand | 1,890 | 9 | [Approved source](charger/production/README.md) |
| sniper | Purple robotic Sniper; steadies its head-mounted barrel | 1,376 | 7 | [Approved source](sniper/production/README.md) |
| guardian | Helmeted guard; swings and thrusts its round mace behind a plank shield | 1,934 | 7 | [Approved source](guardian/production/README.md) |

Every combat enemy has `Idle`, `Run`, `Windup`, `Active`, `Recovery`, `Hurt`,
`Death`, and `Spawn`. The dummy has `Idle`, `Hurt`, `Death`, and `Spawn`.
The designs use wood, cloth, shell, stone and metal across several palettes;
the courtyard is the initial setting, not a limit on future creature families.

Blender 4.5 LTS is at `/Applications/Blender.app/Contents/MacOS/Blender` on the
authoring machine. Run from the repository root, replacing `chaser` as needed:

```sh
blender --background --python-exit-code 1 --python art/enemies/chaser/build.py
blender --background --python-exit-code 1 --python art/enemies/scripts/common.py -- export chaser
blender --background --python-exit-code 1 --python art/enemies/scripts/common.py -- render chaser
```

Rebuild and render the whole set, or verify the existing exports:

```sh
blender --background --python-exit-code 1 --python art/enemies/scripts/build-all.py -- --replace --renders
blender --background --python-exit-code 1 --python art/enemies/scripts/verify.py
```

Rebuilding refuses to replace a saved source. Pass `-- --replace` to deliberately
regenerate it. Export and render read the saved source and preserve manual edits.
Named actions are editable in Blender's Action Editor. Source loops include their
closing key; export omits it and the game's `closeLoop` restores the interval.

Each export has one mesh, one vertex-color material, one armature and rigid
weights. The small joint counts suit the separate shells, claws, shields and
limbs. The GLB uses meters, +Y up, +Z forward, a ground origin and no root motion.
No original reference-game assets, external textures or compression decoders are used.

The game bakes the GLB actions into a shared bone texture once per model. Enemies
then use one instance batch per model, including their animated limbs. The
simulation supplies attack phase and elapsed time. The atlas adds no hit windows,
movement, stagger, immunity or spawn delay.

`verify.py` compares sampled animation bounds from the Blender source with a
fresh import of each GLB, checks root motion, loops and mesh/material structure,
then records the export hash in `verification.json`. `test/enemy-assets.test.ts`
compares the runtime atlas with Three.js skeletal deformation for every clip.

The full set was checked in the network-served game at 1280×800 and 390×844,
including synthetic touch movement/dash and simulation-driven attack phases.
Killed enemies now disappear immediately and burst into particles; `Death`
clips remain in the files but are unused.
At 80 and 300 mixed stress enemies, the renderer used eight animated body
batches (one per kind); this checks batching, not physical-phone frame rate.
Use `?stress=300,2000,mixed` to repeat the crowded arena setup, or the tuning
panel's spawn controls for ordinary combat. [In-game reference](in-game.png).

The reference direction is broad shapes and readable poses, informed by
[Frits Olsen's Death's Door concepts](https://folsen.artstation.com/projects/X1VJEw).
Material variety can expand beyond the first courtyard, whose palette references
[HoYoverse's Chenyu Vale overview](https://blog.playstation.com/2024/01/19/genshin-impact-version-4-4-brings-new-friends-and-visual-enhancements-jan-31/).
