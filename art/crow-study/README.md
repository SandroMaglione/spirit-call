# Crow model study 01

A character-only study of the Death's Door crow, built in Blender through
Python. No sword, accessories, or rig. The previous pixel
art experiment is independent of this directory.

## In the game

Open `/?play&character=swordsman` on the dev server to play with the crow.
Every player character currently uses this same test visual. Enemy visuals
and character abilities retain their existing definitions.

The game uses 16 transparent renders of the saved Blender model in its
existing Pixi renderer. These are static facing directions, selected by
aim, with no animation. The camera matches the game's isometric projection;
each frame shares a ground anchor so turning does not shift the feet.
The sprite retains the pill's nominal height, collision radius, depth
sorting, and ground indicators. Hit, dash, and charge feedback brighten
the rendered silhouette.

To bring saved model changes into the game, run:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/crow-study/bake-sprites.py
```

This reads `crow.blend` without overwriting it and generates
`src/presentation/assets/crow.png` plus its frame/anchor metadata in
`crow.ts`. The 1024 × 1024 atlas contains sixteen 256px frames and is about
631 kB on disk (about 4 MiB decoded RGBA). Vite bundles it for production;
Blender is needed only when rebuilding the asset. `src/presentation/crow.ts`
loads and displays it. No live 3D engine or new package is required.

The bake uses a 30-degree camera elevation for `projection.squash = 0.5`.
A change to the game's projection requires updating and rebaking this
camera. At phone scale, the crow is small and dark against the current
arena; size and contrast remain useful art-direction checks. The next
animation experiment can extend the bake with action/frame indices, but
texture memory then grows with directions times animation frames.

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
This is an editable visual study, not a skinning-ready or runtime-optimized
asset. In particular, the separate wing shells and feet need rigging and
deformation tests before animation production.

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
- Animation can use named Blender actions and baked GLB clips. The next
  proof should be one rig with idle, walk, and one strong action, checking
  feet, wing deformation, and silhouette throughout. This model has not
  proved that stage yet. Scripted keyframes still require visual iteration
  for appealing timing and weight.
- Modular environment pieces, props, stairs, rocks, and palette variants
  are good candidates for scripted construction. Cohesive scene layout,
  lighting, and distinctive organic shapes remain art tasks.
- Sprite delivery multiplies rendering and texture storage by directions,
  frames, and clips. Live 3D avoids that multiplication but introduces
  runtime rendering and animation integration. This study does not settle
  that choice or establish phone performance.

The useful result is a repeatable build-and-review loop. A successful
static render does not by itself prove production-ready animation,
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
