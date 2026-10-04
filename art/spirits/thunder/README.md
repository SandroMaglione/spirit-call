# Thunder Spirit

Stormcaller's spirit, built from the supplied Thunder Spirit sheet and
approved in model review. The editable rest model is `thunder-spirit.blend`;
`animate.py` adds object clips during export to `thunder-spirit.glb`.

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
  swatches: around the middle violet, lighter toward the top and front,
  each facet a clear step from its neighbours so they read at phone size.
  The wings, eye rims, and underside spark are the sheet's gold.
- The halo is a band of lightning: 32 diamond sections whose middle line
  zig-zags and whose width swells and thins, with barbs forking off it.
  It is level from the front and tilted front-down by the front view's
  measured opening, thick enough to read side-on.
- `audit.json` records actual bounds, triangles, materials, and objects.
  The model has 1,620 triangles and four materials, without a skeleton.

The model uses the front view's 220 pixel overall height as 0.62 m. The
printed widths and the cross-section diagrams disagree with the upright
drawings, so the upright silhouettes take precedence, as `docs/spirits.md`
requires. In Blender it faces -Y with Z up and hovers above the origin.

## Review limits

The approved model is a first review pass, not an exact match. `renders/overlay-*.png`
contains measured comparisons and `renders/overlap.txt` records the
current full-figure color-mask scores. They are below the 90% target.

The sheet shows the halo's interior from front, both sides, and the back,
while leaving the body nearly orthographic. A single planar ring cannot
reproduce all those projections. This version keeps a tilted, jagged
physical band: it matches the front and back views' open ring and shows
edge-on from the sides, where it crosses the drawn ring's opening. Its
thickness and tilt are review points, along with the crest's large facets
and the body shading. Pale glow and white
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
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/thunder/export.py
```

`sheet.py` preserves the fitted camera when measurements are regenerated.
Glow in the review renders is a preview. The game adds its violet rim,
soft halo, and gold eye glow through `thunderGlow` in `models.ts`.

## In the game

`export.py` preserves the approved rest source, generates the asset spec,
and records the file hashes, scale height and its basis, and clip timing in
`export.json`. Scale height is 0.665 m from the ground origin to the full
rest figure's top, including the crest and ring. The former body-only
0.4015 m divisor made the full figure 66% taller than Water in the arena.
The corrected divisor matches Water's full height, with the wings retaining
their wider silhouette. `Idle` is a 60 frame
hover with a blink; `Run` is a 16 frame glide with a forward lean and
trailing parts. Both run at 30 fps, omit their closing key, and have no
movement along the floor axes. The eye rims blink with the eyes.

`assets/spirits.ts` exports the generated spec, `models.ts` registers
`thunderSpirit`, and `characterLooks.stormcaller` selects it. Its trail
uses the existing batched ember particles in violet and pale gold. Its
combat clips (a combo's blows, the charged move, the dash, a hit taken,
the special, the ultimate) are every spirit's (`../tools/moves.py`), in the
Stormcaller's `STYLE`: she casts, with a small nod and a hop. They may lean
along the floor into a blow, starting and ending on the spot. Her eyes
have her own shape (`EYE_SHAPE` in `build.py`: big and round, their outer
ends a little lower), and the halo turns about its own tilted axis, tipped
a little further down in front while she stands. A gold bolt down its back
(`BackBolt`, not on the sheet) says which way she faces when her eyes do
not show.

`renders/gameplay-desktop.mp4` records keyboard movement and the Spark
Totem in the normal arena. `renders/gameplay-touch.mp4` records the
390 x 844 phone layout with simulated touch movement, a totem, and switching
to Tidecaller and back. Both were exercised at the dev server's network
address. The `gameplay-*.png` files are frames from those recordings.

`renders/arena-size-comparison.jpg` compares the former Thunder scale,
Water, Fire, and corrected Thunder as rest-pose copies of the actual
loaded assets in the arena. All use the same requested height, facing,
camera, and ground line. Thunder's full top now matches Water's; its
front-view wing span is about 15% wider. Fire retains its established
scale, with shards reaching about 19% above Water's top.
`renders/arena-size-phone.png` shows the correction at 390 x 844;
`renders/arena-size-touch.mp4` records simulated touch movement and a
switch to Water and back on the network address. The loaded-asset bounds
check in `test/spirit-assets.test.ts` guards against the former oversized
height and width returning after an export.
