# Quarry

3D reconstruction of the supplied moss-covered Rock Spirit sheet,
kept separately from Bastion's existing Rock Spirit. The designer approved
the revised static model and requested animation. `quarry.blend` and
`quarry.glb` preserve that approved rest model. `quarry-animated.blend` and
`quarry-animated.glb` add ten object animation clips to the same geometry.
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
The viewer loads the actual animated GLB. It offers clip selection, pause,
restart, half speed, scrubbing and a rest pose, eight camera presets, orbit and
zoom, face and moss close-ups, wireframe, a 48 px gameplay preview and
downloads of both assets. On a narrow screen the controls scroll beneath
the model. Eye bloom and the ground are only part of the review scene.

## Animation

The run is a heavy diagonal gait: front-left/rear-right step together,
then front-right/rear-left. A full cycle takes 0.8 seconds. Each stone
travels 25 cm and lifts 10 cm on its forward return. Fourteen of the
24 frames belong to stance, so contact overlaps and at least two stones
support Quarry at every point, including between keys. A small torso
bounce, forward lean, roll and delayed cap-rock response give the push-offs
weight. Idle keeps all four supports planted and adds a blink and a quiet
cap-rock bob.

The moving ground in the viewer travels at 0.536 m/s, matching the linear
stance part of the stride. It can be switched off to inspect the same
motion without a travel cue. Ground movement belongs to the review scene;
the GLB's `Quarry` root is never animated. `Torso` is an animation pivot
for the connected body, moss, head, eyes and tucked hands. The four large
stones remain independent so the torso's weight shift cannot lift a
supporting foot.

`AttackA`, `AttackB`, `AttackC`, `Power`, `Dash`, `Hurt`, `Cast` and
`Ultimate` are planted one-shots, starting and ending at the accepted
rest pose. The attack contacts use the existing spirit convention:
frames 4, 4, 6 and 6 at 30 fps. Cast raises the cap rock immediately;
Ultimate compresses into a heavy stone pulse. The simulation will own
movement, hits and timing when this character is integrated.

`animation.json` contains the generated clip timings, contact times and
gait dimensions. As with the other spirits, Idle and Run omit the repeated
closing pose. The viewer adds that key with the same operation as the
game's `closeLoop`; playback needs these metadata loop lengths.

Browser recordings of the actual GLB:

- `renders/run-review.mp4`: the run from hero, side and game cameras.
- `renders/animation-review.mp4`: all ten clips with their names visible.
- `renders/run-phone-gameplay.mp4`: the run at 48 px in a 390 by 844 viewport.

The animation review checked pause, scrubbing, rest-to-play and synthetic
touch orbit (with pointer capture temporarily stubbed). The phone-sized
browser review is not a physical-device performance test. The shared
browser's long recording call timed out, but reopening the preview and
stopping the recording recovered the complete clip sequence.

`verify-animation.py` samples the delivered GLB at 240 Hz using glTF
linear translation/scale and quaternion interpolation, including loop
seams. It verifies unchanged rest geometry, clip timing, rest endpoints,
root-motion absence, supporting soles, all-mesh ground clearance, floating
rock clearance and planted-foot velocity against preview travel. The
minimum cap-rock/moss gap is 50.9 mm across the clips. The run's maximum
stance velocity error is below 0.002 mm/s. The asset audit and lint pass;
`pnpm check --maxWorkers=2` still stops at the existing Effect SQL module
and type errors described below.

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
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/rock/quarry/animate.py
uv run --with numpy art/spirits/rock/quarry/verify-animation.py
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
