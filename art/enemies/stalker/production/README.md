# Stalker model review

Editable static model from the attached Stalker sheet. Open
`stalker-model.blend` in Blender or `stalker-model.glb` in a glTF viewer.

The source has 1,860 triangles and one vertex-color material. Its pointed
head has a real recessed face and two separate surface-projected eyes.
Long arm blades and broad shoulder shells keep its silhouette readable.
The three floating back crests have been removed as requested. Its violet
eyes now have angular outlines with lowered inner corners for a scowl.
The legs use the side sheet's staggered stance,
with the rear foot measured separately. Tiny armor plates and toes are
simplified. The dorsal crest is shortened so it sits behind the hood.

Twelve dark joints connect shoulders, upper arms, blades, hips, knees and
ankles. A waist joint also bridges the torso and hip armor. Each connector
overlaps both neighboring surfaces, including the staggered rear leg.
`renders/face-front.png`, `face-left.png` and `face-right.png` show the face.

`spirit.json` holds labeled regions, pixel scale, swatches and render lights.
`sheet.json` holds the measured contours and eye blobs. The source uses a
nominal 0.9-meter figure, not the sheet's gameplay size 16. `audit.json`
records the exact full rest height from the ground through its ornaments.
Parts remain separate for editing; skinning into one enemy batch comes later.

## Review evidence

- `renders/compare.png` pairs front, right and hero with the model.
- `renders/overlay-all.png` shows all views, yellow reference and red model.
  Exact intersection-over-union scores are in `renders/overlap.json`.
- `renders/review-game-size.png` shows the 30-degree game camera, a native
  24-pixel study and a pixel enlargement. This is not a live arena check.
- `renders/measure-*.png` records the measured part labels.
- `renders/camera-sweep.json` and `renders/view-camera-sweep.json` record
  hero and labeled-view camera searches. The chosen cameras are in
  `sheet.json`. Top and bottom use the canonical vertical views.
  The sweeps retain the initial camera search; current overlays use the
  saved cameras after the crest, joint and face revisions.
- `verification.json` checks the exported GLB against the saved source.

The current front/back IoU is 70%/61%; left/right is 63%/64%. This does not
meet the pipeline's 90% target. The overlays retain the remaining head,
shoulder, blade and stance differences for review. The sheet's front/back
show a broad symmetric stance while its sides show one foot far behind
the other. Its hero uses another stance and head angle. The model keeps
one consistent crouch. There is no glow halo in the mesh.

There are no animations, rigs or game registrations. This completes the
static model stage for the requested iteration before animation.

## Rebuild and inspect

From the repository root, with Blender 4.5 LTS and uv:

```sh
uv run --with pillow --with numpy art/enemies/stalker/production/sheet.py
blender --background --python-exit-code 1 --python art/enemies/stalker/production/build.py
blender --background --python-exit-code 1 --python art/enemies/model-tools/render.py -- stalker fit
uv run --with pillow --with numpy art/enemies/model-tools/review.py stalker fit
blender --background --python-exit-code 1 --python art/enemies/model-tools/render.py -- stalker sweep
uv run --with pillow --with numpy art/enemies/model-tools/review.py stalker sweep
blender --background --python-exit-code 1 --python art/enemies/model-tools/render.py -- stalker
uv run --with pillow --with numpy art/enemies/model-tools/review.py stalker
blender --background --python-exit-code 1 --python art/enemies/model-tools/verify.py -- stalker
```

Build replaces the generated source. Render and verify read the saved file,
so manual edits can be reviewed without rebuilding it.
