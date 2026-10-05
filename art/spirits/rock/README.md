# Rock Spirit

Static model started from the supplied Rock Spirit model sheet, following
`docs/models.md` and `docs/spirits.md`, then revised to the designer's
requested broader, friendlier shape and grounded stance. The rest source is
`rock-spirit.blend`; `rock-spirit.glb` is the inspection export. It has
808 triangles, three materials and nine named objects, with no skeleton,
textures, cameras, lights or animation clips.

This is the model review stage. There is no Rock character kit in current
content, so this asset does not register a playable character or replace
an existing spirit. Animation, gameplay glow, movement feedback and
character wiring belong to the next stage after model review.

## Construction

`reference/sheet.png` preserves the supplied image. `crop.py` extracts
the seven views at their original pixel scale. `sheet.py` separates
touching parts with region labels, measures each stone-colored row, finds
the two amber eye blobs, and samples the material swatches. Its raw
measurements are in `sheet.json`; `renders/measure-*.png` shows the masks.

`build.py` uses explicit `BODY_SECTIONS` for a broader boulder with angular
shoulders and a low, blunt base. The top rock still follows the measured
turnaround. Foot width and height start from the front, with depth from
the left; their pointed tips are replaced by wider flat soles. Feet and
floating stones move outward to fit the broader body. Non-silhouette
vertices vary in height to break horizontal rows into irregular facets.
All stone parts share the measured tan, brown and grey palette.

The face is an octagonal boolean recess in the boulder, with inward
sloping walls and a back wall in the same closed mesh. The former separate
`FaceInset` plate is removed. The backing corners and all eye vertices
are checked against the original uncut body to prevent protrusion.
`Eye.L` and `Eye.R` are mirrored, open round shapes, 66 mm wide and 69 mm
tall, with a gentle upward sweep at their outer ends. `EYE_SHAPE` records
that deliberate optimistic expression. They sit 2 mm above the carved
back wall, at least 49 mm inside the original body's front surface.
Their origins remain their centers; flat amber emission preserves color.

`Foot.L`, `Foot.R`, `Float.L`, `Float.R`, `TopRock` and `RearRock` are separate
objects with centered origins for later animation. Both feet meet the
ground, and the cap and side stones have real gaps. `RearRock` is a short
angular heel attached through the underside, with a broad flat ground
contact. Its furthest rear vertex is only 5 mm beyond the main body's
overall rear extent. It gives a rear-facing landmark without a long tail.
`RockSpirit` is the parent and contains the entire eye cavity.
L is negative Blender X.
In Blender the model faces -Y with Z up; the GLB faces +Z with Y up.

## Proportions and reference disagreements

The front turnaround's 151 px total height sets a 0.62 m sheet scale.
The actual exported rest height is 0.622106 m from the ground origin to
the highest mesh vertex, including the cap. Full width is 0.707881 m,
depth 0.423313 m. The central boulder is 0.570 m wide and 0.320 m tall,
a width-to-height ratio of 1.78. `audit.json` and `export.json` record the
bounds and whole-figure height basis; animation must preserve that basis.

The initial sheet's printed 1.2H width/depth, 0.35H cap height and 0.15H gap do not
agree with the upright drawings. The initial pass followed those drawings.
The designer then explicitly requested a wider rock body, an integrated
socket, round optimistic eyes and a restrained rear underside rock, and
allowed departures from the sheet. These review choices now take precedence
over exact silhouette matching. The front cap gap remains about 0.018 m.
The hero image
also adds a third small side stone that is absent from the turnaround and
the two-stone detail panel; this model follows those two sources.

The side drawings show an eye even when the body is almost exactly
side-on. This real recess occludes both eyes at a strict 90 degree view.
Its eyes are clear from the front and the game camera. The sweep selected
a candidate hero camera at 20 degrees turn and 15 degrees elevation,
not an exact reconstruction of the painted hero render.

## Inspect and rebuild

From the repository root:

```sh
pnpm dev --host --port 5199 --strictPort
```

Open `/art/spirits/rock/index.html` on the server's printed network address.
The viewer loads the actual GLB with local Three.js dependencies. It has
orbit and zoom controls, seven camera presets, the game's 30 degree
elevation, face/feet/floating/rear-rock close-ups, wireframe, a small preview,
the reference, overlays, and GLB/Blender download links. On a phone the
model stays above a separately scrolling control panel.

With Blender 4.5 LTS and `uv`:

```sh
uv run --with pillow --with numpy art/spirits/rock/crop.py
uv run --with pillow --with numpy art/spirits/rock/sheet.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/rock/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/rock/export.py
uv run art/spirits/rock/audit.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/tools/render.py -- rock
uv run --with pillow --with numpy art/spirits/tools/overlay.py rock
uv run --with pillow --with numpy art/spirits/tools/compare.py rock
uv run --with pillow --with numpy art/spirits/rock/review.py
```

To refit the hero camera, use the spirit guide's `SWEEP` render and
`sweep_score.py` commands with `rock`. Measurements preserve the fitted
camera when regenerated. `export.py` preserves the rest source;
`audit.py` reads the delivered GLB and validates the part names, triangle
and material budgets, embedded buffer and absence of animation/helpers.

## Review evidence

`renders/review.png` compares the four upright views on a common scale
and includes the game camera and a real 30 x 32 px render.
`renders/overlay-*.png` and `renders/overlap.txt` record the current
color-mask overlap scores. The upright views remain below the guide's
90% target because the revised body, eyes and heel deliberately depart
from the original sheet. The scores document the difference, not a fitting
target for these designer-requested changes. They also include differences
in dark cavity coverage and lighting. No designer approval is implied.

The inspection page was exercised at `http://192.168.40.47:5199` on
2026-10-05, at 1280 x 800 and 390 x 844. Camera presets, close-ups,
wireframe, small-size view and model loading were checked. Simulated touch
pointer events exercised orbit and two-finger pinch, with pointer capture
stubbed for synthetic events. No physical-phone check was performed.
`renders/browser-desktop.png` and `renders/browser-phone.png` capture the
revised GLB in the browser. `renders/browser-side.png` and
`renders/browser-back.png` document the integrated socket and short heel.
The source and export hashes are in `export.json`.

The actual loaded GLB's two foot soles both reach Y=0; the heel reaches
Y=0.000106 m, within 0.11 mm of the same ground line. A rendered-pixel
check finds amber eyes in front and none from exact left, right or back
views. The source build also checks the main body is closed and verifies
the cavity backing and every eye vertex stay inside the original boulder.

`pnpm check` passed typecheck, lint and 466 tests, with one existing skipped
test. The initial `pnpm build` passed with the existing bundle-size warning.
The GLB
audit passed. Gameplay and combat animation are outside this static pass.
