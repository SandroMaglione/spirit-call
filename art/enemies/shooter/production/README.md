# Shooter model review

Approved replacement built from the attached enemy sheet. Open
`shooter-model.blend` to edit it, or `shooter-model.glb` to inspect it in a
glTF viewer. These static review files are preserved. The game now uses
`animated/shooter.glb`, with its editable rig in `animated/shooter.blend`.

The body loft uses the front/back widths and left/right depths measured in
`sheet.json`. Separate measured parts form the cream fins, dorsal spike,
feet and tail. The coral mouth has an actual opening, inner wall and dark
recess. The two eyes are separate surface-projected meshes. All parts share
one vertex-color material. The static source has 1,180 triangles and no rig
or clips. The animated copy preserves every rest vertex and facet color,
with eight rigid bones, one mesh and the same shared material.

The bell swells for a shot and expands further for a close spray. Separate
spray phase clips are selected by the look's attack id. Phase progress comes
from the simulation, including recovery starting in the release pose when
the active phase has zero duration. Spawn, idle, run and hurt cover the
live lifecycle. Death remains an unused file clip; kills use the game's
existing particle burst, now blue to match the body.

## Review evidence

- `renders/compare.png`: front, right and hero against the sheet.
- `renders/overlay-all.png`: every sheet view, yellow reference outline and
  red model outline. Exact scores are in `renders/overlap.json`.
- `renders/review-game-size.png`: 30 degree game-camera render, native 32 px
  preview and a nearest-neighbor enlargement. This is a size study, not a
  live arena or physical-phone performance check.
- `renders/camera-sweep.json`: measured hero-camera candidates. The chosen
  camera is recorded in `sheet.json`.
- `renders/measure-*.png`: the pixel regions used to construct each part.

The front defines the face's vertical position. The sheet's side mouths sit
higher than its front mouth, and the tail is lower in the back than on the
sides. The side views define mouth depth and tail elevation; the back gives
the tail its width. The front/back orthographic overlap is 87%/92%, the
sides 84%/84%. These do not all meet the spirits pipeline's 90% target.
The differences remain visible for review. Fine underside trim and surface
noise are simplified. The sheet's named size is a gameplay radius, so the
source uses a nominal one-meter height for modeling, with exact rest bounds
recorded in `audit.json` for later scaling.

## Rebuild

From the repository root, with Blender 4.5 LTS and uv:

```sh
uv run --with pillow --with numpy art/enemies/shooter/production/sheet.py
blender --background --python-exit-code 1 --python art/enemies/shooter/production/build.py
blender --background --python-exit-code 1 --python art/enemies/production-tools/render.py -- shooter sweep
uv run --with pillow --with numpy art/enemies/production-tools/review.py shooter sweep
blender --background --python-exit-code 1 --python art/enemies/production-tools/render.py -- shooter
uv run --with pillow --with numpy art/enemies/production-tools/review.py shooter
```

Build regenerates the source. Render reads the saved Blender source, so manual
edits can be inspected without rebuilding. Rebuild the animated copy and
its generated runtime spec from the approved saved source:

```sh
blender --background --python-exit-code 1 --python art/enemies/production-tools/animate-approved.py -- shooter build-export
blender --background --python-exit-code 1 --python art/enemies/production-tools/verify-approved-animation.py -- shooter
blender --background --python-exit-code 1 --python art/enemies/production-tools/render-approved-animation.py -- shooter
```

`animated/verification.json` checks every exported frame against the source,
the ground origin, unchanged rest bounds, closed loops, zero root motion
and windup/contact/recovery continuity. Runtime atlas equivalence is checked
by `test/enemy-assets.test.ts`.
