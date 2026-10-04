# Brute model review

Static stone heavyweight measured from the attached sheet. The saved
`brute-model.blend` and `brute-model.glb` use the lowered-fist front stance.
The game's existing animated Brute is unchanged.

The torso, brow, hunched back, shoulders, arms, fists, thighs and feet loft
the labeled front and side silhouettes in `sheet.json`. The paired limbs
are mirrored. A surface-clipped black visor and pale chest plate follow the
actual body facets. The eyes remain separate meshes. Small stone chips are
simplified into broad facets and color variation. The source has 1,539
triangles, one vertex-color material and no skeleton or clips.

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
skinning into a single batched enemy mesh and game registration follow review.
