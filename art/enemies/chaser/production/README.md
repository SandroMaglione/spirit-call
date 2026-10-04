# Chaser production model

An editable model built from the supplied production sheet, following
`docs/spirits.md` through the model review stage. The approved static source
is preserved; `animated/` contains its rigged source and runtime export.

[Play against the Chaser](http://192.168.40.47:5199/?play&challenge=cloister&team=swordsman,tidecaller&touch)
while the network dev server is running. The first wave has three Chasers.
The same link supports keyboard/mouse and phone touch controls.

The runtime export has one skinned mesh, one vertex-color material, twelve
bones and 1,890 triangles. Its eight clips use the existing enemy lifecycle:
Idle, Run, Windup, Active, Recovery, Hurt, Death and Spawn. The simulation
still controls attack timing, movement and hit areas; the renderer samples
these clips through the existing shared GPU animation atlas. Death is
authored for completeness; current gameplay despawns defeated enemies.

[Rotate the model](http://192.168.40.47:5199/art/enemies/chaser/production/index.html)
while the repository's network dev server is running. The page has front,
back, side, top and game-camera views, plus wireframe and silhouette controls.
Drag to rotate, or pinch to zoom on a phone.

- [Blender source](chaser-production.blend)
- [Angle renders](renders/review.png)
- [Sheet comparison](renders/compare.png)
- [All overlays](renders/overlay-all.png)
- [Small-size review](renders/review-game-size.png)
- [Source audit](audit.json)

The model has 1,890 triangles, one vertex-color material and 52 separately
editable mesh parts. Its full height is 1.8 m and its lowest mesh point is
on the ground. Blender uses Z up and -Y forward. This static source has no
rig or animation. `animate.py` joins weighted parts into one skinned mesh,
writes a separate Blender source, and preserves its rest geometry and colors.

## What was simplified

The head's V, swept crest, crouched legs, asymmetric arms and curved bone
claw carry the design. Armor chips, finger joints and small toe details are
reduced to larger facets. Eye objects are mirrored and cut at the skull's
facet boundaries so they lie on its surface. Their origins are at their
centers. All parts share the sheet's rust, brown, bone and yellow palette.

The main shells loft measured image contours. Joint positions and widths
come from the sheet pixels recorded in `sheet.json`. Part labels separate
touching shapes before measuring them. The saved masks make that separation
reviewable. The forehead is an explicit angular shield over the measured
skull, rather than a rounded primitive.

## Sheet agreement

This is a simplified review model. It does **not** meet the pipeline's 90%
silhouette goal. The current scores are front 69.0%, back 55.2%, left 61.5%,
right 70.7%, top 37.9%, bottom 45.8% and hero 56.1%. `renders/overlap.json`
contains the exact results. Overlays fit only uniform scale and translation.

The remaining differences include the shoulder and limb outlines, the
crest's front/back asymmetry, the claw's side curve, and the compactness of
the top-down footprint. The user accepted this simplified model for integration.
The sheets also disagree with each other:

- The rear claw is much shorter than the front claw.
- The side drawings place the small hand behind the body; the top view
  places it forward. This model follows the sides.
- The printed width and depth dimensions do not agree with the shared
  pixel scale. The height anchors the model; outlines set its proportions.
- LEFT shows the face on the image's left, opposite to the spirits' usual
  naming convention. The review cameras follow this sheet's labels.

A sweep of 16 hero cameras scores silhouette overlap and eye positions,
following the spirits' camera-fitting procedure. The selected camera is
45 degrees around the front and 25 degrees up. The game-size renders use
30 degrees up. This is a fitted review camera, not a gameplay size claim.

## Rebuild and review

Run these from the repository root. `blender` below means the local Blender
4.5 LTS executable at `/Applications/Blender.app/Contents/MacOS/Blender`.

```sh
uv run --offline --with pillow --with numpy art/enemies/chaser/production/crop.py
uv run --offline --with pillow --with numpy art/enemies/chaser/production/sheet.py
blender --background --python-exit-code 1 --python art/enemies/chaser/production/build.py
blender --background --python-exit-code 1 --python art/enemies/chaser/production/render.py -- --sweep
uv run --offline --with pillow --with numpy art/enemies/chaser/production/review.py --sweep
blender --background --python-exit-code 1 --python art/enemies/chaser/production/render.py
uv run --offline --with pillow --with numpy art/enemies/chaser/production/review.py
blender --background --python-exit-code 1 --python art/enemies/chaser/production/verify-source.py
pnpm dev --host --port 5199
```

`build.py` regenerates the source from measurements. Keep manual Blender
edits before running it again. `render.py` and `verify-source.py` read the
saved file, preserving those edits. `review-mesh.json` is a static browser
snapshot of that file, not an export for the game.

## Validation

The saved Blender file passes checks for one material, vertex colors,
ground bounds, no rig, no actions, no modifiers and no degenerate triangles.
The review viewer was exercised on the network address at 1280 x 800 and
390 x 844, with camera buttons, wireframe, silhouette and synthetic touch
rotation. There was no horizontal overflow or WebGL context loss. This is
browser validation, not a physical-phone performance test.

`pnpm check` passed typecheck, lint and all 369 tests in 48 files.

## Animated export and gameplay validation

```sh
blender --background --python-exit-code 1 --python art/enemies/chaser/production/animate.py
blender --background --python-exit-code 1 --python art/enemies/chaser/production/export.py
blender --background --python-exit-code 1 --python art/enemies/chaser/production/verify-animation.py
```

`export.py` reads the saved animated Blender file and generates the GLB and
the Chaser asset module. It does not save over manual Blender edits.
`verify-animation.py` checks a fresh GLB import against sampled source poses,
root immobility, loop closure, bounds and runtime structure. Contact poses
match exactly across Windup → Active → Recovery → Idle. Source/import bound
differences remain below 0.000001 m. The eight clips also pass the game's
Three.js skinning versus baked-atlas test.

The network gameplay page was exercised at 1280 × 800 and 390 × 844.
Observed all four attack phases, both Chaser attacks, changing atlas frames,
keyboard movement, synthetic touch movement/dash, damage and a kill. Synthetic
touch tests temporarily stubbed pointer capture because synthetic pointers
cannot acquire native capture. A mixed 80-enemy scene rendered its ten
Chasers in one instanced mesh, with changing poses and no WebGL context loss.
These are browser checks, not a physical-phone performance measurement.

Typecheck and lint passed. All 369 tests passed with
`pnpm exec vitest run --maxWorkers=2`; unrestricted parallel runs encountered
simulation-test timeouts under concurrent machine load. `pnpm build` passed.

## Run refinement

The revised Run uses a 15° forward torso lean, stronger shoulder drive,
alternating planted push-offs and a 0.18 m foot return. Two ankle bones keep
the toes level as the legs rotate. Stance occupies 28% of each leg's cycle;
the remaining time brings the foot forward and gives the body a brief bound.
The gameplay stride is 48 world units per cycle, down from 68, giving 42%
more cycles over the same distance. At the current model scale, the authored
stance corresponds to 47.03 world units, keeping foot drift small.

`verify-animation.py` also checks interpolated foot poses: planted ground
error stays below 0.002 m, feet remain level, and both returns clear 0.16 m.
The mesh remains 1,890 triangles; the rig now uses the twelve-bone budget.
Gameplay was checked again on the network address at desktop and phone
sizes, including touch movement/dash and all attack phases at the enemy's
215-unit chase speed. No new page errors or WebGL context loss occurred.

Typecheck, lint and the production build passed. The normal `pnpm check`
run encountered the existing five-second replay-test timeout under machine
load. All 372 tests passed with
`pnpm exec vitest run --maxWorkers=2 --testTimeout=20000`.
