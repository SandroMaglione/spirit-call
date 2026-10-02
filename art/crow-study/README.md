# Crow model study 01

A character-only study of the Death's Door crow, built in Blender through
Python. No sword or accessories. The original static model and a separate
rigged idle/run version live here. The previous pixel art experiment is
independent of this directory.

## In the game

Open `/?play&character=swordsman` on the dev server to play with the crow.
Every player character currently uses this same test visual. Enemy visuals
and character abilities retain their existing definitions.

The game uses transparent renders of the animated Blender model in its
existing Pixi renderer. Idle has 16 frames and run has 12, each in 16 facing
directions selected by aim. The camera matches the game's isometric projection;
each frame shares a ground anchor so turning does not shift the feet.
The sprite retains the pill's nominal height, collision radius, depth
sorting, and ground indicators. Hit, dash, and charge feedback brighten
the rendered silhouette.

To bring saved model changes into the game, run these in order:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/crow-study/animate.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/crow-study/verify-animation.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/crow-study/bake-sprites.py -- --animated
```

`animate.py` reads `crow.blend` without overwriting it, then writes
`crow-animated.blend` with 12 bones, weighted meshes, and named Idle/Run
actions. It overwrites the animated variant; save manual rig edits separately
or put them in the script. To bake manual animation edits, skip `animate.py`
and run the verifier and bake directly against the saved animated variant.

The bake generates `src/presentation/assets/crow-idle.png`, `crow-run.png`,
and `crow-animation.ts` metadata. Frames are 128px square with shared
camera scale and ground anchor. Both atlases total about 5.19 MB on disk
and 28 MiB decoded RGBA. Vite bundles them for production; Blender is
needed only when rebuilding. The original static atlas remains available
for comparison, but the game no longer loads it. Running the bake without
`--animated` still rebuilds that static atlas.

`src/presentation/crow.ts` loads and displays frames.
`src/presentation/crow-animation.ts` advances playback from interpolated
travel distance, returns to idle when travel stops, reverses the cycle for
backward movement, and holds the current pose during a dash. One run cycle
covers 110 game units, an artistic timing choice rather than root-motion
matching. At speed 320, it plays about 2.9 cycles per second. The clip retains
aim-facing when strafing, so sideways travel still slides. Dedicated strafe,
attack, and dash clips are outside this first animation pass. No simulation
state, live 3D engine, or package dependency was added.

The bake uses a 30-degree camera elevation for `projection.squash = 0.5`.
A change to the game's projection requires updating and rebaking this
camera. At phone scale, the crow is small and dark against the current
arena; size and contrast remain useful art-direction checks. Animation has
already increased decoded texture memory from 4 to 28 MiB for this one
character. More clips and characters will need atlas packing, loading only
needed characters, and a phone memory/performance budget.

## Inspect the animation

Open `/art/crow-study/animation.html` on the dev server. It shows both loops
with facing, speed, display-size, pause, and frame-scrubbing controls. The
enlarged preview intentionally magnifies the game sprites; it is not a
high-resolution model render.

Open `crow-animated.blend` in Blender to inspect the actual rig. Select
`Crow rig | idle + run` and choose Idle or Run in the Action Editor.
Idle loops over frames 1–48 and Run over 1–12 at 24 fps. Each action also
has a duplicate closing key at 49 or 13, excluded from playback and baking.
Feet use two-bone inverse kinematics; the body and head deform through
weights, while eyes, beak, wings, and toes follow their assigned bones.
Idle keeps both feet planted, with an exaggerated breath, head nod, and
wing opening that move the silhouette at phone size. The run leans forward
about 30 degrees, with the head counter-rotated to keep looking ahead,
wings swept back, a longer leg swing, and two airborne intervals per cycle.
Its shorter stance and faster recovery replace the earlier upright walk.
This simple rig suits these two clips; it has not proved combat poses,
extreme wing motion, retargeting, or animated GLB export. `crow.glb` remains
the original static export.

## Inspect

Run `pnpm dev --host --port 5199` at the repository root, then open
`/art/crow-study/` on the server's network address. The page also works by
opening `index.html` directly. It includes six views, a camera turntable,
and links to the editable model. The turntable is a camera orbit, not a
character animation.

- `crow.blend`: editable meshes, packed body texture, materials, lights,
  and an orthographic camera. Open in Blender 4.5 LTS. Middle-mouse drag
  or the viewport navigation gizmo orbits the view; scroll zooms. Render
  the saved camera with F12. The Studio collection is hidden in the
  working viewport but remains enabled for renders.
- `crow.glb`: character only, with the texture embedded. No floor,
  camera, lights, or Blender-specific shader dependencies.
- `renders/contact-sheet.png`: three-quarter, front, side, back, rear
  three-quarter, and a higher camera view, in reading order.
- `renders/turntable.mp4`: 72 angles, five degrees apart, six seconds.
- `body-palette.png`: the script-authored body color regions. It is also
  packed into the Blender file and GLB.

The character has 23 mesh parts, 2,518 source vertices, and 4,944 triangles.
It uses one 512 × 512 texture and simple material colors on the other parts.
The static file is an editable visual study. Its animated variant has a
small rig tested for idle and run; deformation under more demanding poses
and runtime optimization remain unfinished.

## Rebuild

Installed for this study: Blender 4.5.14 LTS, Apple Silicon, at
`/Applications/Blender.app`. The download was verified against Blender's
published SHA-256. FFmpeg was already installed. There are no new pnpm
dependencies, paid tools, or Blender add-ons.

From the repository root:

```sh
# Rebuild the model and one fast preview.
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/crow-study/build.py -- --draft

# Rebuild everything, encode the video, assemble the contact sheet, and verify.
sh art/crow-study/render.sh

# Verify saved meshes, packed texture, and GLB import without rendering again.
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/crow-study/verify.py
```

Set `CROW_BLENDER_BINARY` when running `render.sh` on another machine.
Blender provides its own Python. Draft mode writes lower-resolution output
to the same paths; rerun the full command for delivery-quality renders.
Rebuilding overwrites `crow.blend`, so save manual edits under another name
or incorporate them into `build.py` before rebuilding.

The pipeline is:

```text
build.py -> editable meshes + UV palette -> crow.blend / crow.glb
         -> six inspection views + 72 camera angles
render.sh -> contact sheet + MP4
verify.py -> closed meshes, finite coordinates, packed texture,
             matching mesh count / triangle count / bounds after GLB import
```

The source uses elliptical cross sections for the body and neck, custom
closed wing shells, a faceted beak, and tapered feet. `SECTIONS` controls
the main silhouette. `breast_rows` and `hood_rows` control the color regions.
These are authored shapes, not an image-to-3D reconstruction or imported
game geometry.

## Reference and interpretation

Primary reference: [Frits Olsen's crow and NPC concepts](https://folsen.artstation.com/projects/X1VJEw).
The final crow occupies the bottom-right of the first sheet. Earlier
explorations on that sheet are not interchangeable with that final design.
The feather coat belongs to the crow's wings, rather than a separate garment.

[Official gameplay screenshots](https://store.steampowered.com/app/894020/Deaths_Door/)
were also consulted for the broad shading, dark silhouette, and how small
the crow appears in the environment. They did not supply usable mesh or
rig information. No original game assets were extracted. This is a fan
study of Acid Nerve's character, intended to assess the workflow before
making original characters.

Motion reference: the [official gameplay trailer](https://www.youtube.com/watch?v=MfOQWtpeEN0),
also published on the Steam page. Frame-by-frame inspection of the laser
room traversal informed the alternating feet, compact body bounce, and
trailing wing silhouette. The stronger forward lean is an intentional
adaptation to this game's faster travel, not a claim to reproduce the
original game's timing. The run cadence is about 2.9 cycles per second at
speed 320, compared with the previous walk's 1.8. Game movement speed and
collision sizes have not changed.

The sheet was enough to establish identity, color placement, and broad
proportions. It was not a complete orthographic turnaround. Body depth,
the backs of the wings, rear skull shape, and feet required interpretation.
Those should be judged in the side and rear renders. The current model
has smoother, rounder volumes and simpler feather transitions than the
reference. It is a first interpretation, not an exact reconstruction.

For the next iteration, feedback on beak/head proportions, the grey hood,
and wing silhouette will be more useful than small surface details. For
closer fidelity, a clean side/back turnaround or close-up model views would
reduce guesswork. Animation needs motion reference for poses and timing.

## What this establishes about scale

- Modeling, materials, export, and batch rendering work through Blender's
  CLI on this M1. A 640px draft at 16 Cycles samples took about three
  seconds per view; a 1000px view at 48 samples took about sixteen seconds.
  These are observed examples for this scene, not general benchmarks.
- Related characters and enemies can reuse construction helpers, material
  conventions, camera setups, and eventually rigs. A different anatomy
  still needs a new silhouette and deformation plan. This script is a
  character-specific starting point, not a general character generator.
- Named Blender actions now produce idle and run sprites. The next proof
  should be one strong attack, checking feet, wing deformation, silhouette,
  and pose transitions. Animated GLB export remains untested. Scripted
  keyframes still require visual iteration for appealing timing and weight.
- Modular environment pieces, props, stairs, rocks, and palette variants
  are good candidates for scripted construction. Cohesive scene layout,
  lighting, and distinctive organic shapes remain art tasks.
- Sprite delivery multiplies rendering and texture storage by directions,
  frames, and clips. Live 3D avoids that multiplication but introduces
  runtime rendering and animation integration. This study does not settle
  that choice or establish phone performance.

The useful result is a repeatable build-and-review loop. A successful
idle/run test does not by itself prove production-ready combat animation,
large content throughput, or Death's Door's finished art quality.

## Verification

- Opened the saved file in the Blender desktop app and inspected the model
  with its material colors visible.
- `verify.py` passed, including a fresh GLB import with 23 mesh objects,
  4,944 triangles, matching bounds, and an embedded body texture.
- Viewed all six renders. The MP4 contains 72 frames at 12 fps, 640 × 640.
- Exercised the inspection page on the network address at desktop width
  and 390 × 844: view selection, video playback, and slider seeking worked;
  images loaded and there was no horizontal overflow. Browser automation
  provided pointer clicks, not native touch emulation; physical-phone
  touch behavior remains unverified.
- `pnpm check` passed: typecheck, lint, and 195 tests across 27 files.
- The sprite bake checked all 16 frames for opacity, transparent background,
  and empty margins to avoid sampling adjacent frames. The atlas was
  visually inspected and `pnpm build` included it in the production output.
- The network game was checked at desktop and 390 × 844 sizes. Scripted
  keyboard and touch pointer events exercised movement, aim, dash feedback,
  and attacks with the crow present. Browser ticks were advanced explicitly
  during input checks because the hidden preview throttles animation frames.
  This is functional browser verification, not a phone performance test or
  a physical-device touch test. The desktop canvas and phone view were
  visually inspected; subsequent preview screenshots intermittently failed.
- Animation verification passed for normalized weights, finite evaluated
  geometry, exact loop closure, no below-ground vertices, stationary idle
  feet, a visible idle head-height range, forward run lean, foot contact,
  and frames with both feet airborne over the full actions.
- All 448 animation renders passed transparency/margin checks. The preview
  exposes every facing and frame for review. Browser checks exercised idle,
  moving frames, dash pose hold, stopping, and touch movement. The separate
  viewer was checked at desktop and phone sizes, including pause and scrub.
- With animation playback tests, `pnpm check` passed 199 tests in 28 files;
  `pnpm build` bundled both animated atlases.
- The run revision was exercised through keyboard and synthetic touch
  input in the browser. The game canvas was resized to 390 × 844 for the
  phone-scale check after the preview's viewport-resize command timed out.
  Idle's peak and trough changed the silhouette by about 1.75 CSS pixels
  at phone size. This checks readability and playback, not device performance.
