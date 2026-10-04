# Brute model review

Static stone heavyweight measured from the attached sheet. The saved
`brute-model.blend` and `brute-model.glb` use the lowered-fist front stance.
These approved static files are preserved. The game now uses
`animated/brute.glb`, with its editable rig in `animated/brute.blend`.

The torso, brow, hunched back, shoulders, arms, fists, thighs and feet loft
the labeled front and side silhouettes in `sheet.json`. The paired limbs
are mirrored. A surface-clipped black visor and pale chest plate follow the
actual body facets. The head, visor and eye pair share the body's center
axis; the right eye and socket are exact mirrors of the left. A separate
ivory brow cap projects over the visor. Eye surfaces clear the visor so
the dark face cannot occlude small patches of their amber cores.
Small stone chips are simplified into broad facets and color variation.
The source has 1,612 triangles, one vertex-color material and no skeleton
or clips.

## Game-size refinement

After the first in-game review the limbs were grown about their own centers
(`GROW` in `build.py`: fists and shoulders most) and their rings roughened
(`ROUGH`) so the stone breaks into planes; the eyes are a third wider and
slant down toward the nose. At 60 px the measured limbs read as thin lumps
and the round eye cores as two dots. Front/back sheet overlap is now
86%/88%. The triangle count is unchanged.

## Review evidence

`renders/compare.png` pairs the front, right and hero with the reference.
`renders/overlay-all.png` and `renders/overlap.json` expose every view's
silhouette difference. `renders/review-game-size.png` shows the saved neutral
model from the game's 30 degree camera, including a native 48 px study.
The source's nominal height is 1.4 meters; exact ground-to-top bounds are
recorded in `audit.json` for later game scaling.

The sheet is not a single rest pose. Its side and hero fists are raised;
its front and back fists are down. Front/back contours define the lowered
stance. The side fist gives thickness, recentered to the front's height.
`render.py` temporarily rotates arm objects for the hero and camera sweep;
it writes no keys and never saves those transforms. The six orthographic
renders and game-size study show the saved neutral model. Side/hero scores
must be read with that pose mismatch in mind. The front/back overlap is
84%/88%, below the spirits pipeline's 90% target, and further shape changes
can be reviewed against these overlays before animation.

## Rebuild

From the repository root:

```sh
uv run --with pillow --with numpy art/enemies/brute/production/sheet.py
blender --background --python-exit-code 1 --python art/enemies/brute/production/build.py
blender --background --python-exit-code 1 --python art/enemies/production-tools/render.py -- brute sweep
uv run --with pillow --with numpy art/enemies/production-tools/review.py brute sweep
blender --background --python-exit-code 1 --python art/enemies/production-tools/render.py -- brute
uv run --with pillow --with numpy art/enemies/production-tools/review.py brute
```

Build regenerates the Blender source; render reads its saved meshes. Animation,
skinning and game registration use a separate copy of this approved source:

```sh
blender --background --python-exit-code 1 --python art/enemies/production-tools/animate-approved.py -- brute build-export
blender --background --python-exit-code 1 --python art/enemies/production-tools/verify-approved-animation.py -- brute
blender --background --python-exit-code 1 --python art/enemies/production-tools/render-approved-animation.py -- brute
```

The copy has seven rigid bones, one mesh, one shared material and the same
1,612 triangles and rest bounds. The head bone carries the cap, visor and
both eyes together. The slam raises both fists, while the stomp lifts and
plants the left foot with lower arms. The look selects stomp phase clips
by moveset id; simulation phase progress drives both attacks.

`animated/verification.json` checks every frame against a fresh GLB import,
zero root motion, floor clearance, closed loops and continuous contact and
recovery poses. Spawn, idle, run and hurt cover the live lifecycle. Kills
keep the game's particle burst, now stone-colored. The Death file clip is
unused by gameplay.
