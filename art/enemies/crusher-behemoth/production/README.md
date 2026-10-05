# Crusher Behemoth static model

Third model pass from the supplied handoff sheet and requested revisions.
The compact stone torso, broad gold-strapped pauldrons, oversized fists,
solid rock fists, black visor, smaller amber eyes,
recessed diamond core, and lower keystone remain separately editable.
Shaped thighs, kneecaps, tapered shin armor, and broad stone feet form a
splayed V stance. The helmet is wider and deeper. Wrists stay plain, and
there are no fingers or thumbs. This pass has no rig or clips.

Open `/art/enemies/crusher-behemoth/review.html` through the repository's
Vite server. The viewer loads the actual GLB and provides orbit and zoom,
eleven camera presets, a turntable, wireframe, light and dark backgrounds,
a 1.8 m scale figure, isolated hand and leg views, reference comparisons, a
before-and-after board, and source downloads.
The game camera is 45 degrees around the model and 30 degrees above the
floor, matching the elevation of `src/math/iso.ts`.

## Files and scale

- `crusher-behemoth-model.blend` is the editable source with 39 named parts.
- `crusher-behemoth-model.glb` is the static export, 3,125 triangles with
  two shared materials. Stone and gold use facet vertex colors. The amber
  eyes and core share a flat emissive material that survives glTF export.
- `reference/sheet.png` preserves the original attachment. Seven unscaled
  view crops accompany it.
- `spirit.json` labels visible parts in the sheet's pixel coordinates.
  `sheet.json` records measured row contours and the printed hex swatches.
- `audit.json` records source dimensions. `verification.json` records the
  export hash, structure, source round trip, and symmetric paired parts.

The GLB uses meters, +Y up, +Z forward, and a ground origin. Its highest
vertex is 8.5 m above that origin. Both flat soles sit at zero on the floor.
Width is 12.09 m and depth is 5.38 m. The torso and shoulder dimensions
remain unchanged. Larger fists and a thicker helmet are intentional changes.

The sheet's labels are inconsistent with its drawings. A
16 m width and 8.5 m ground-to-apex height imply a much wider body. The
12 m depth label conflicts with the narrower side views too. Following
`docs/spirits.md`, this pass preserves the drawn orthographic proportions
and anchors scale to the stated height. It does not stretch to the
footprint labels. The plan views draw deeper, more tucked arms than the
side views. The hero shows larger fists and a longer visible keystone.
Those discrepancies need a design choice in a later revision if exact
agreement across all views is required.

## Shape decisions for this pass

Front and back contours set the original torso, helmet, and shoulder widths, and
side contours set their depths. Side sections align to the front part's vertical midpoint
because the shoulder tops sit higher in the side drawings. The visible
regions identify where touching armor shells belong; hidden connections
are simple dark joint masses. The front-side measurements remain
available as colored region images for inspection.

The face and arms are symmetric. Each fist is a single irregular, bulging
boulder with broad stone facets and no hand anatomy or attached decorations.
The wrist keeps one plain gold band. Legs angle outward from narrower hips
to wider feet. Varying cross-sections, thick kneecaps, tapered shin guards,
and narrow gold knee bindings replace the previous regular blocks.
A full stone waist overlaps the torso and pelvis, forming a substantial
support visible from behind. `connections.json` checks 28 structural joins
using actual triangle intersections or solid containment, including the
body-to-hip support and the complete shoulder-to-fist and hip-to-foot chains.
The helmet is 35% wider and 65% deeper than pass 02, with a fuller lower
shell while preserving the apex height. Eye slits are 60% of their previous
width and 55% of their previous height. Face patches follow the new shell;
overlapping visor, nose, and gold ridge layers use separate surface depths.
The diamond bezel has physical thickness and a recessed core. Gold shoulder
straps use cut geometry for a clean border.

This boss is above the ordinary enemy's 2,000-triangle target. Its 3,125
triangles keep the rock fists and shaped leg armor editable. The build caps
this review source at 3,500 triangles. The multipart source is for review;
the later animation stage should join or rig it for the game's batched
enemy renderer after its shape is approved. No content ids, asset registry,
looks, simulation, or game bundles were changed.

## Review evidence

`renders/revision.png` compares pass 02 with pass 03 in front and game
views at the same world scale. `pass-02-*.png` preserves the previous revision;
`previous-front.png` and `previous-game.png` preserve pass 01.
`revision-details.png` compares fists and helmets. The old fist close-up is
adjusted from a 5.8 m frame to the current 6.3 m frame for equal scale.
Hand and leg close-ups show those parts in isolation.
`revision-connections.png` compares the rear before and after adding the
waist support, with a close-up of the final connection.
`renders/review-board.png` compares the original hero, static model, game
camera, and rear facing. `compare.png` places sheet views beside renders.
`overlay-all.png` shows sheet outlines in yellow and model outlines in red.
The hero camera sweep selects a frontal camera at 30 degrees elevation.
`review-game-size.png` shows native 128 px and 64 px canvases plus a 4x
nearest-neighbor enlargement. These are scale studies, not a claim about
the final boss's game size.

`overlap.json` records silhouette intersection over union for every sheet
view, independently normalized by height and centered by bounding box.
All views remain below the 90% sheet-matching target. The requested legs
increase the visible height, so normalized comparisons shrink the upper
body relative to the sheet even though its world dimensions are unchanged.
The shaped legs, plainer wrists, rock fists, and bulky helmet are deliberate revisions.
Use `revision.png` to judge the changes at the same scale. Camera sweep
scores and all view scores remain available as reference evidence.

The network review at `http://192.168.40.47:5209` loaded the final GLB with
39 meshes, two materials, and no animation. Desktop and 390 x 844 layouts
had no horizontal overflow after layout settled. Isolated hand and leg presets,
the face view, and the full game view were exercised. Synthetic touch pointer
events rotated the model at phone size. Native pointer capture was
temporarily bypassed for that synthetic test and restored afterward;
this does not verify native capture or physical-phone performance.
`browser-review.json` records the current live loading and input checks
against the hash in `verification.json`. `browser-phone.png` shows the final
model with waist support. `pass-03-before-waist-browser-desktop.png` shows
the rock-fist pass before that support was added, with the older comparison
board. Capture was intermittent and the preview host disconnected before
a final desktop screenshot. Desktop layout and synthetic touch checks were
completed before the waist addition; the final 39-part GLB was loaded and
captured at phone size. The network download hash matches the verified export.
`previous-browser-desktop.png` and `previous-browser-phone.png` preserve
pass-01 screenshots. Blender renders use the saved source, whose vertices
are verified against the actual GLB.

Blender verification compares every named source part's unique world
vertices with a fresh GLB import and checks material count, absence of
skins, animations, lights, cameras, decoder dependencies and textures,
ground contact for both soles, height, and mirrored arm, leg, and eye geometry.
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
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/crusher-behemoth/production/connections.py
pnpm dev --host --port 5209 --strictPort
```

Build commands replace generated files. Preserve manual revisions in a
separate Blender file or update the recipe first. Rendering reads the
saved source without saving lights, cameras, or review settings into it.
