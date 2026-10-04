# Swarmer model review

Static red-shell pest measured from the attached sheet. Open
`swarmer-model.blend` to edit the source or `swarmer-model.glb` to inspect
the static export. The existing animated game asset is unchanged.

Front/back widths and left/right depths drive the shell loft. Measured
cream spikes are seated on the actual shell surface. The bone jaw has a
real cavity, with separate large upper fangs, side fangs and lower teeth.
The tooth polygons are labeled in the build script in original front-view
pixels. Upper and side fangs lean forward from embedded roots, extending
their tapered tips about 12–13 side-view pixels (5 cm) beyond the jaw lip.
The lower teeth project a little less. This preserves the front outline
while making the bite readable from the side.
Four separate dark legs and an under-shell complete the shape.
The source has 984 triangles, one vertex-color material, and no rig or clips.
Small tooth chips, shell cracks and additional leg joints are simplified.

## Review evidence

`renders/compare.png` pairs front, right and hero views with the reference.
`renders/overlay-all.png` and `renders/overlap.json` report every view.
The front reaches 90% silhouette overlap; the back is about 85% and the
sides about 81–82%, below the spirits pipeline's 90% target. The extended
fangs make the side silhouette wider than the previous flush teeth.
The hero has a different shell
proportion from the orthographic sheet and remains about 71% after the
camera sweep. These differences stay visible for the model review.
`renders/review-game-size.png` shows the game's 30 degree camera, a native
24 px size study, and a nearest-neighbor enlargement.

The shell's upper outline follows the orthographic sheet. The spike roots
are moved vertically to meet that shell rather than float above it when
front and side labels disagree. The source's nominal height is 0.65 meters;
the whole rest figure is slightly shorter after seating the spikes. Exact
ground-to-top bounds are recorded in `audit.json` for later game scaling.

## Rebuild

From the repository root:

```sh
uv run --with pillow --with numpy art/enemies/swarmer/production/sheet.py
blender --background --python-exit-code 1 --python art/enemies/swarmer/production/build.py
blender --background --python-exit-code 1 --python art/enemies/production-tools/render.py -- swarmer sweep
uv run --with pillow --with numpy art/enemies/production-tools/review.py swarmer sweep
blender --background --python-exit-code 1 --python art/enemies/production-tools/render.py -- swarmer
uv run --with pillow --with numpy art/enemies/production-tools/review.py swarmer
```

Build regenerates the source; render reads the saved meshes. Animation,
skinning into a single batched enemy mesh and game registration follow review.
