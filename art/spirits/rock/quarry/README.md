# Quarry

Static 3D reconstruction of the supplied moss-covered Rock Spirit sheet,
kept separately from Bastion's existing Rock Spirit. `quarry.blend` is the
editable rest source and `quarry.glb` is the static export. There are no
animation clips, skeleton, textures, lights or cameras in either asset.
Quarry has not been registered as a playable character.

The revised model has 1,424 triangles, two materials and 13 named mesh parts.
Its height including the floating rock is 0.772 m, width 0.947 m and depth
0.830 m. The sheet gives no
physical height; 0.62 m was chosen as a working scale near the other spirits.
The GLB stands at Y=0 and faces +Z. Blender uses Z up and -Y forward.

## Shapes and colors

Four broad stone shoulders taper outward to planted blunt points. A closed
moss mantle covers the central dark boulder, with a separate floating rock
above it and a broad rear stone beneath its skirt. The head contains an actual
boolean-cut pocket with a dark backing, sloping walls and a rounded 9 mm lip.
Separate thin
elliptical eyes follow that backing, 2 mm above it. The cheek stones have
small moss patches at their upper inner corners, as in the face detail.
These two hands now sit 20 mm farther inward and 43 mm farther back into
the head. Their top ends overlap the lower head instead of standing outside it.

The designer requested this pass after reviewing the first static model.
Each large limb now has 76 triangles instead of 116; the moss has 156
instead of 284. Wider facets keep their main contours, while the socket
bevel receives extra geometry where the rounded edge needs it. The original
crown stone is removed. `FloatRock` rests 70.8 mm above the highest moss
vertex, and has its own centered origin for a later animation pass.

`measure.py` preserves the supplied sheet and crops its seven views and
two detail panels. It records the silhouette rows, moss bounds, eye cores
and sampled palette in `sheet.json`. The front's width-to-height ratio is
1.594. Glowing eye cores average 11.5 by 24 source
pixels. The model uses mirrored 34 by 77 mm eyes with 105 mm spacing.
Stone section profiles reconstruct the chunky shapes, with deterministic
irregular vertices and flat color per facet. Stone, moss, underside and
socket share one vertex-color material; the eyes use amber emission.

The source views do not describe one exact orthographic object. The front
is slightly turned, side views show an eye through the head, and the top
omits the crown stone shown in the other views. The requested floating
rock replaces that crown, and the model keeps the real recessed face. The
side proportions use a small depth compromise. The literal side camera
can occlude the eyes; the reference comparison uses a modest front turn.

## Review

Start `pnpm dev --host --port 5201 --strictPort` at the repository root and
open `/art/spirits/rock/quarry/index.html` on the printed network address.
The viewer loads the actual GLB. It offers eight camera presets, orbit and
zoom, face and moss close-ups, wireframe, a 48 px gameplay preview and
downloads of both assets. On a narrow screen the controls scroll beneath
the model. Eye bloom and the ground are only part of the review scene.

`renders/quarry.png` is the studio image. `renders/review-reference.png`
compares all seven sheet views with the reconstructed object and includes
the game's 30 degree camera. `renders/overlay-all.png` and
`renders/overlap.json` record whole-silhouette overlap after uniform height
normalization. Width is never stretched to improve the score.

The initial scores were front 84.8%, left 83.1%, back 86.5%, right 80.1%,
top 81.6%, bottom 70.8% and hero 82.8%. The revised whole-figure scores
are in `overlap.json`; height normalization now includes the floating rock
absent from the sheet, so upright scores fall. The designer's requested
changes take precedence over fitting the original sheet. No exact match
or approval of the revision is implied.

The browser review used `http://192.168.0.45:5201` at 1280 by 800 and
390 by 844 CSS pixels on 2026-10-10. The loaded GLB bounds exactly matched
the audit. Camera and detail controls, wireframe and gameplay size were
checked. Synthetic touch pointer events changed orbit and pinch zoom;
pointer capture was temporarily stubbed for those synthetic events. This
was a browser viewport review, not a physical-phone test.

## Rebuild and verify

From the repository root, with Blender 4.5 LTS and `uv`:

```sh
uv run --with pillow --with numpy art/spirits/rock/quarry/measure.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/rock/quarry/build.py
uv run --with numpy art/spirits/rock/quarry/verify.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/rock/quarry/render.py
uv run --with pillow --with numpy art/spirits/rock/quarry/review.py
```

`verify.py` reads the delivered GLB rather than trusting source metadata.
It checks the hashes, named parts, triangle and material budgets, vertex
colors, embedded buffer, absence of helpers and animations, finite bounds,
four grounded supports, height and facing. All volumetric source meshes
are closed; the eye overlays are deliberately thin open surfaces.

For camera experiments, run `render.py -- --sweep`, then
`uv run --with pillow --with numpy art/spirits/rock/quarry/fit.py`.
`render.py -- --geometry-fit` tests depth and rear-stone offsets without
changing the source. Experimental render files are not part of delivery.

The revised asset audit passed, including the floating rock's clearance
and removal of the old crown node. `pnpm check --maxWorkers=2` was rerun
and stopped at the same existing Effect SQL type errors as the initial pass.
The initial asset audit and lint passed. That test run passed 546 tests
with one skipped; the server suite could not load
`@effect/sql-sqlite-node/SqliteClient`. `pnpm check --maxWorkers=2` stopped
at existing Effect SQL type errors involving that package and
`@effect/sql-d1/D1Client`. The original checkout's `pnpm typecheck` produced
the same errors. No application code was changed to address them.
