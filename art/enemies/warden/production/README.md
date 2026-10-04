# Warden model review

Editable static model from the attached Warden sheet. Open
`warden-model.blend` in Blender or `warden-model.glb` in a glTF viewer.

The source has 1,775 triangles, one shared vertex-color material, two separate
surface-projected eyes, an open hood with a recessed face, a staff, and four
thin folded ribbons. Fine fingers, shoulder ornaments, and fabric folds are
simplified. Parts remain separate for model editing. Enemy skinning and
batching can follow the model review.

The revised face uses mirrored angular cyan eyes with lowered inner corners
for an angry expression. Each eye follows its own hood facets so neither
side sinks into the face. `renders/face-front.png`, `face-left.png` and
`face-right.png` show the close views.

`spirit.json` records labeled pixel regions, scale, swatches and lights.
`sheet.json` records measured row contours, ribbon columns and eye blobs.
The source uses a nominal one-meter figure, not the sheet's gameplay size 22.
`audit.json` measures its full rest height from the ground to the staff tip.

## Review evidence

- `renders/compare.png` pairs the front, right and hero with the model.
- `renders/overlay-all.png` shows every view with the reference in yellow
  and the model in red. `renders/overlap.json` holds the exact scores.
- `renders/review-game-size.png` shows the 30-degree game camera and a
  native 24-pixel study. This is a raster study, not a live arena check.
- `renders/measure-*.png` shows the labels used to measure the parts.
- `renders/camera-sweep.json` and `renders/view-camera-sweep.json` record
  hero and labeled-view camera searches. The chosen cameras are in
  `sheet.json`. Top and bottom use canonical vertical views.
  These sweep files retain the initial camera search; current overlays use
  those saved cameras after the face revision.
- `verification.json` checks the actual GLB against the saved Blender
  source, including triangle counts, palette, axes and rest bounds.

The current front/back silhouette IoU is 52%/53%; left/right is 50%/53%.
This does not meet the pipeline's 90% target. The remaining differences are
visible in the overlays, chiefly the ribbons, robe proportions and staff.
The sheet's back omits the staff, while top and bottom hold it across the
body instead of upright. Ribbon placement also changes between views.
The model keeps one upright staff and four ribbons in one consistent pose.
Its geometric colors are flat; glow belongs to the later game stage.

There are no animations, rigs or game registrations. The model is ready
for the requested design iteration before those steps.

## Rebuild and inspect

From the repository root, with Blender 4.5 LTS and uv:

```sh
uv run --with pillow --with numpy art/enemies/warden/production/sheet.py
blender --background --python-exit-code 1 --python art/enemies/warden/production/build.py
blender --background --python-exit-code 1 --python art/enemies/model-tools/render.py -- warden fit
uv run --with pillow --with numpy art/enemies/model-tools/review.py warden fit
blender --background --python-exit-code 1 --python art/enemies/model-tools/render.py -- warden sweep
uv run --with pillow --with numpy art/enemies/model-tools/review.py warden sweep
blender --background --python-exit-code 1 --python art/enemies/model-tools/render.py -- warden
uv run --with pillow --with numpy art/enemies/model-tools/review.py warden
blender --background --python-exit-code 1 --python art/enemies/model-tools/verify.py -- warden
```

Build replaces the generated source. Render and verify read the saved file,
so manual edits can be reviewed without regenerating it.
