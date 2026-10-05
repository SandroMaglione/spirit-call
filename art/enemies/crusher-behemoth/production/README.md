# Crusher Behemoth static model

First model pass from the supplied handoff sheet, ready for design review.
The compact stone torso, broad gold-strapped pauldrons, oversized fists,
segmented knuckles, black visor, amber eyes, recessed diamond core, and
lower keystone remain separately editable. This pass has no rig or clips.

Open `/art/enemies/crusher-behemoth/review.html` through the repository's
Vite server. The viewer loads the actual GLB and provides orbit and zoom,
nine camera presets, a turntable, wireframe, light and dark backgrounds,
a 1.8 m scale figure, reference comparisons, and source downloads.
The game camera is 45 degrees around the model and 30 degrees above the
floor, matching the elevation of `src/math/iso.ts`.

## Files and scale

- `crusher-behemoth-model.blend` is the editable source with 31 named parts.
- `crusher-behemoth-model.glb` is the static export, 2,418 triangles with
  two shared materials. Stone and gold use facet vertex colors. The amber
  eyes and core share a flat emissive material that survives glTF export.
- `reference/sheet.png` preserves the original attachment. Seven unscaled
  view crops accompany it.
- `spirit.json` labels visible parts in the sheet's pixel coordinates.
  `sheet.json` records measured row contours and the printed hex swatches.
- `audit.json` records source dimensions. `verification.json` records the
  export hash, structure, source round trip, and symmetric paired parts.

The GLB uses meters, +Y up, +Z forward, and a ground origin. Its highest
vertex is 8.5 m above that origin and its lowest is 0.8 m above the floor.
The model intentionally floats. Width is 10.93 m and depth is 5.02 m.
Rest height includes the floating clearance, rather than measuring only
the visible body's 7.7 m height.

The sheet's labels are inconsistent with its drawings. The orthographic
front is about 1.45 times as wide as its visible height, whereas a
16 m width and 8.5 m ground-to-apex height imply a much wider body. The
12 m depth label conflicts with the narrower side views too. Following
`docs/spirits.md`, this pass preserves the drawn orthographic proportions
and anchors scale to the stated height. It does not stretch to the
footprint labels. The plan views draw deeper, more tucked arms than the
side views. The hero shows larger fists and a longer visible keystone.
Those discrepancies need a design choice in a later revision if exact
agreement across all views is required.

## Shape decisions for this pass

Front and back contours set each part's width, and side contours set its
depth. Side sections are aligned to the front part's vertical midpoint
because the shoulder tops sit higher in the side drawings. The visible
regions identify where touching armor shells belong; hidden connections
are simple dark joint masses. The front-side measurements remain
available as colored region images for inspection.

The face and arms are symmetric. Eye polygons sit just above the helmet's
actual facets. The diamond bezel has physical thickness and a recessed
core. Broad finger blocks and an outward fist cant preserve readable
seams without individual finger joints. Fine cracks and layered stone
chips are simplified. The gold shoulder straps use cut geometry for a
clean border rather than coloring whole crossing triangles.

This boss is above the ordinary enemy's 2,000-triangle target. Its 2,418
triangles keep the editable finger blocks and armor trim. The build caps
this review source at 3,500 triangles. The multipart source is for review;
the later animation stage should join or rig it for the game's batched
enemy renderer after its shape is approved. No content ids, asset registry,
looks, simulation, or game bundles were changed.

## Review evidence

`renders/review-board.png` compares the original hero, static model, game
camera, and rear facing. `compare.png` places sheet views beside renders.
`overlay-all.png` shows sheet outlines in yellow and model outlines in red.
The hero camera sweep selects a frontal camera at 10 degrees elevation.
`review-game-size.png` shows native 128 px and 64 px canvases plus a 4x
nearest-neighbor enlargement. These are scale studies, not a claim about
the final boss's game size.

Silhouette intersection over union, independently normalized by height
and centered by bounding box, is 87.1% front, 90.1% back, 80.0% left,
75.8% right, 67.2% top, 67.0% bottom, and 81.1% hero. The front, sides,
plan views, and hero remain below the 90% target. The overlays expose the
shallower arm placement, fist block shape, and shorter visible keystone.
This is an unapproved first pass, not an exact reconstruction of every
drawing. Camera sweep scores and all view scores are retained.

The network review at `http://192.168.40.47:5209` loaded the final GLB with
31 meshes, two materials, and no animation. Desktop and 390 x 844 layouts
had no horizontal overflow. Camera presets, wireframe, turntable, scale
figure, and background controls were exercised. Synthetic touch pointer
events rotated the model at phone size. Native pointer capture was
temporarily bypassed for that synthetic test and restored afterward;
this does not verify native capture or physical-phone performance.
`browser-desktop.png`, `browser-phone.png`, and `browser-review.json`
record the review of the hash in `verification.json`.

Blender verification compares every named source part's unique world
vertices with a fresh GLB import and checks material count, absence of
skins, animations, lights, cameras, decoder dependencies and textures,
floating clearance, height, and mirrored arm and eye geometry.
`pnpm check` passed 54 test files with 448 tests passed and one skipped.
`pnpm build` passed. The standalone viewer is served by Vite for local
review and is not included in the production game's entry point.

## Rebuild

From the repository root, with Blender 4.5 LTS and `uv`:

```sh
uv run --with pillow --with numpy art/enemies/crusher-behemoth/production/prepare.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/crusher-behemoth/production/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/crusher-behemoth/production/render.py -- sweep
uv run --with pillow --with numpy art/enemies/crusher-behemoth/production/review.py sweep
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/crusher-behemoth/production/render.py
uv run --with pillow --with numpy art/enemies/crusher-behemoth/production/review.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/crusher-behemoth/production/verify.py
pnpm dev --host --port 5209 --strictPort
```

Build commands replace generated files. Preserve manual revisions in a
separate Blender file or update the recipe first. Rendering reads the
saved source without saving lights, cameras, or review settings into it.
