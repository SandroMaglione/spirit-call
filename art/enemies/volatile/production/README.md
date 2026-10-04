# Volatile model review

Editable static model from the attached Volatile sheet. Open
`volatile-model.blend` in Blender or `volatile-model.glb` in a glTF viewer.

The source has 1,768 triangles and one shared vertex-color material. Its
round body has fifty irregular crust plates over an orange lava core,
two separate recessed angular eyes, a mouth fissure, small rock feet,
side rocks and a separate curved flame. The gaps between plates expose
the core; they are geometric seams rather than a texture. The flame has
an orange exterior and a smaller yellow interior.

Rock chips, ember specks and the sheet's exact crack network are simplified.
The eyes, sockets, feet and side rocks are exactly mirrored. Tapered sockets
are cut into each closed rock plate and the core before joining them; the
eyes sit about 2.2 cm behind the socket rims at authoring scale. The iris
follows the rear cap with clearance, keeping it visible at oblique angles.
Crust plates are also mirrored so both eyebrows have matching rock lips.
The feet sit farther into the body and have short overlapping roots.
`renders/face-front.png`, `face-left.png` and `face-right.png` show the result.
The flame root joins
behind the top rock. Colors are flat; glow and particles belong to the
later presentation stage.

`spirit.json` records labeled regions, pixel scale, swatches and lights.
`sheet.json` records measured contours and eye blobs. The source uses a
nominal 0.82-meter figure, not the sheet's gameplay size 14. Its measured
full rest height is 0.7316 meters, including the flame (`audit.json`).
Parts remain separate for editing; enemy skinning and batching follow review.

## Review evidence

- `renders/compare.png` pairs front, right and hero with the model.
- `renders/overlay-all.png` shows every view, yellow reference and red model.
  Exact intersection-over-union scores are in `renders/overlap.json`.
- `renders/review-game-size.png` shows the 30-degree game camera and a native
  24-pixel study. This is a raster study, not a live arena check.
- `renders/measure-*.png` records the labeled part measurements.
- `renders/camera-sweep.json` and `renders/view-camera-sweep.json` record
  hero and labeled-view camera searches. `sheet.json` stores the chosen
  cameras; top and bottom use canonical vertical views.
  The sweep files retain the initial camera search; current overlays use
  those saved cameras after the symmetry and face revision.
- `verification.json` checks the actual GLB against the saved Blender source.

The current front/back silhouette IoU is 75%/71%; left/right is 66%/69%.
This does not meet the pipeline's 90% target. Remaining differences include
the flame curl, plate outline, rock feet and face. The flame changes shape
between the sheet's front, back, sides and hero. The model keeps one fixed
curl for review, with no floating ember geometry.

There are no animations, rigs or game registrations. The static model is
ready for the requested design iteration before animation.

## Rebuild and inspect

From the repository root, with Blender 4.5 LTS and uv:

```sh
uv run --with pillow --with numpy art/enemies/volatile/production/sheet.py
blender --background --python-exit-code 1 --python art/enemies/volatile/production/build.py
blender --background --python-exit-code 1 --python art/enemies/model-tools/render.py -- volatile fit
uv run --with pillow --with numpy art/enemies/model-tools/review.py volatile fit
blender --background --python-exit-code 1 --python art/enemies/model-tools/render.py -- volatile sweep
uv run --with pillow --with numpy art/enemies/model-tools/review.py volatile sweep
blender --background --python-exit-code 1 --python art/enemies/model-tools/render.py -- volatile
uv run --with pillow --with numpy art/enemies/model-tools/review.py volatile
blender --background --python-exit-code 1 --python art/enemies/model-tools/verify.py -- volatile
```

Build replaces the generated source. Render and verify read the saved file,
so manual edits can be reviewed without regenerating it.
