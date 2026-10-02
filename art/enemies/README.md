# Enemy models

Original low-poly creatures for the current eight enemy IDs. Blender sources,
portable animated GLBs, generated metadata and a reference PNG live beside each
recipe. There is no separate viewer; inspect motion in Blender or the live game.

Blender 4.5 LTS is at `/Applications/Blender.app/Contents/MacOS/Blender` on the
authoring machine. Run from the repository root, replacing `chaser` as needed:

```sh
blender --background --python-exit-code 1 --python art/enemies/chaser/build.py
blender --background --python-exit-code 1 --python art/enemies/scripts/common.py -- export chaser
blender --background --python-exit-code 1 --python art/enemies/scripts/common.py -- render chaser
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

The reference direction is broad shapes and readable poses, informed by
[Frits Olsen's Death's Door concepts](https://folsen.artstation.com/projects/X1VJEw).
Material variety can expand beyond the first courtyard, whose palette references
[HoYoverse's Chenyu Vale overview](https://blog.playstation.com/2024/01/19/genshin-impact-version-4-4-brings-new-friends-and-visual-enhancements-jan-31/).
