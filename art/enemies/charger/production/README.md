# Firebomber model review

Static replacement for the enemy named Firebomber. Its permanent content id
is `charger`. This folder is a model review, before rigging, animation, or
registration in the game.

The supplied sheet is preserved in `reference/`. `spirit.json` labels its
parts in source pixels; `sheet.py` measures their row contours and swatches
into `sheet.json`. `build.py` lofts those measured sections and creates the
open hood, recessed face, bomb pack, hand bomb, and separate flame shapes.
The small fingers, straps, and ember fragments are simplified.

`charger-model.blend` keeps the editable parts. `charger-model.glb` is a
static review export with one shared vertex-color material, no animations,
and no skeleton. It is not yet a crowd-ready skinned asset.

From the repository root:

```sh
uv run --with pillow --with numpy art/enemies/charger/production/sheet.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/charger/production/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/sheet-tools/render.py -- charger sweep
uv run --with pillow --with numpy art/enemies/sheet-tools/review.py charger sweep
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/sheet-tools/render.py -- charger
uv run --with pillow --with numpy art/enemies/sheet-tools/review.py charger
```

Review `renders/compare.png`, `renders/overlay-all.png`, and the game-camera
images. `renders/overlap.json` records every view against the pipeline's 90%
target. Scores below that target remain visible for review. The hero camera
is chosen from a sweep; the game render always uses a 30-degree elevation.
Runtime flame glow is a later presentation step, as in the spirits pipeline.
