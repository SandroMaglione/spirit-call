# Sniper model review

Approved static model from the supplied robotic Sniper sheet. The game imports
its rigged copy from `animated/sniper.glb`. `sniper-model.blend` keeps editable named
parts; `sniper-model.glb` is a static review export with one shared
vertex-color material. It is not yet a crowd-ready skinned asset.

The sheet and all seven crops live in `reference/`. `spirit.json` labels
parts in source pixels. `sheet.py` measures their contours and palette into
`sheet.json`; `build.py` creates the connected head/barrel, mirrored crests,
armor, side lenses, folded arms, and jointed legs. Small panel seams and
electrical cracks are simplified.

The head's tip is lower in the front illustration than in the side views.
The model uses the side views' tip height and the front's measured widths.
The hero image also has a wider crouch and a longer-looking barrel than the
standing views. It is reported separately, not claimed as a matching pose.
Camera sweeps check the turned/elevated views as required by the pipeline.
The 90% silhouette target remains a review target; `renders/overlap.json`
records all scores without hiding below-target results.

From the repository root:

```sh
uv run --with pillow --with numpy art/enemies/sniper/production/sheet.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/sniper/production/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/sheet-tools/render.py -- sniper sweep
uv run --with pillow --with numpy art/enemies/sheet-tools/review.py sniper sweep
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/sheet-tools/render.py -- sniper fit-views
uv run --with pillow --with numpy art/enemies/sheet-tools/review.py sniper fit-views
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/sheet-tools/render.py -- sniper
uv run --with pillow --with numpy art/enemies/sheet-tools/review.py sniper
node art/enemies/sheet-tools/verify.mjs sniper
```

Review `renders/compare.png`, `renders/overlay-all.png`, and `renders/game.png`.
The shared `art/enemies/sheet-tools/review.html` page loads the GLB for orbiting
and phone-sized review without changing the game.
