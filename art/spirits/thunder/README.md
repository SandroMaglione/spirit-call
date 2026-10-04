# Thunder Spirit

First static model for review against the supplied Thunder Spirit sheet.
The editable asset is `thunder-spirit.blend`. There are no animations,
GLB exports, presentation registrations, or changes to game content.

`renders/review-angles.png` shows front, right, back, left, the fitted
reference camera, and the game's 30 degree elevation. The reference is
beside the model in `renders/review-reference.png`. The phone-scale check
is `renders/review-game-size.png`, including an actual 30 x 32 pixel render.
These are Blender renders, with no painted additions.

## Construction

- `crop.py` keeps the source and crops each view at its original scale.
- `sheet.py` measures purple row outlines and bright eye blobs. Its region
  polygons separate touching parts; `renders/measure-*.png` shows them.
- `build.py` lofts the body and lightning crest through four orthographic
  views. The face is symmetric; the crest keeps the measured lean.
- The gold wings intersect front and side silhouette extrusions. Each
  wing, violet fin, crest, eye, eye rim, halo, and underside spark is a
  separate object. Each eye lies 2 mm above the body's actual facets.
- Violet colors are flat per-facet vertex colors, using the sheet's
  swatches. The pale gold wing fill is between its yellow and white.
- `audit.json` records actual bounds, triangles, materials, and objects.
  The model has 2,628 triangles and four materials, without a skeleton.

The model uses the front view's 220 pixel overall height as 0.62 m. The
printed widths and the cross-section diagrams disagree with the upright
drawings, so the upright silhouettes take precedence, as `docs/spirits.md`
requires. In Blender it faces -Y with Z up and hovers above the origin.

## Review limits

This is a first review pass, not a final match. `renders/overlay-*.png`
contains measured comparisons and `renders/overlap.txt` records the
current full-figure color-mask scores. They are below the 90% target.

The sheet shows the halo's interior from front, both sides, and the back,
while leaving the body nearly orthographic. A single planar ring cannot
reproduce all those projections. This version keeps a mildly tilted,
jagged physical ring. Its thickness and tilt are review points, along
with the crest's large facets and the body shading. Pale glow and white
eyes also create gaps in the color masks; scores include those differences.
The fitted camera is a candidate from the sweep, not proof of a perfect
match to the illustrated isometric view.

## Rebuild

From the repository root, with Blender 4.5 LTS:

```sh
uv run --with pillow art/spirits/thunder/crop.py
uv run --with pillow --with numpy art/spirits/thunder/sheet.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/thunder/build.py
env SWEEP=/tmp/thunder-spirit-sweep /Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/tools/render.py -- thunder
uv run --with pillow --with numpy art/spirits/tools/sweep_score.py thunder /tmp/thunder-spirit-sweep
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/tools/render.py -- thunder
uv run --with pillow --with numpy art/spirits/tools/overlay.py thunder
uv run --with pillow --with numpy art/spirits/thunder/review.py
```

`sheet.py` preserves the fitted camera when measurements are regenerated.
Glow in these renders is a preview. Game glow and clips belong to the later
integration stage after the model review.
