# Rock Spirit

Static model built from the supplied Rock Spirit model sheet, following
`docs/models.md` and `docs/spirits.md`. The editable rest source is
`rock-spirit.blend`; `rock-spirit.glb` is the inspection export. It has
800 triangles, three materials and nine named objects, with no skeleton,
textures, cameras, lights or animation clips.

This is the model review stage. There is no Rock character kit in current
content, so this asset does not register a playable character or replace
an existing spirit. Animation, gameplay glow, rear-facing feedback and
character wiring belong to the next stage after model review.

## Construction

`reference/sheet.png` preserves the supplied image. `crop.py` extracts
the seven views at their original pixel scale. `sheet.py` separates
touching parts with region labels, measures each stone-colored row, finds
the two amber eye blobs, and samples the material swatches. Its raw
measurements are in `sheet.json`; `renders/measure-*.png` shows the masks.

`build.py` lofts the main body and top rock through the four upright
views. The foot width and height come from the front; its depth comes
from the left. The side stones use the front contour and a compact depth.
Non-silhouette vertices vary slightly in height to break horizontal rows
into irregular rock facets. All stone parts share flat per-facet vertex
colors drawn from the measured tan, brown and grey swatches.

The face is an octagonal boolean recess in the boulder, with inward
sloping walls and a separate dark liner. It is geometry, not a dark decal.
`Eye.L` and `Eye.R` are mirrored, independently editable ellipses snapped
2 mm above that recessed surface. Their origins are their centers. A flat
amber emission keeps their color independent of light and shadow.

`Foot.L`, `Foot.R`, `Float.L`, `Float.R` and `TopRock` are separate
objects with centered origins for later animation. Both feet meet the
ground, and the cap and side stones have real gaps. `RockSpirit` is their
parent; `FaceInset` is the dark inner surface. L is negative Blender X.
In Blender the model faces -Y with Z up; the GLB faces +Z with Y up.

## Proportions and reference disagreements

The front turnaround's 151 px total height sets a 0.62 m sheet scale.
The actual exported rest height is 0.622106 m from the ground origin to
the highest mesh vertex, including the cap. Width is 0.537881 m, depth
0.388775 m. `audit.json` and `export.json` record the measured bounds and
the whole-figure height basis; animation must preserve that basis.

The printed 1.2H width/depth, 0.35H cap height and 0.15H cap gap do not
agree with the upright drawings. The drawings take precedence, as the
spirit guide requires. The front cap gap is about 0.018 m. The hero image
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
elevation, face/feet/rock close-ups, wireframe, a small gameplay preview,
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
90% target; top, bottom and hero disagree more. The mask scores also
include differences in dark cavity coverage and lighting. These are
review evidence, not a claim of an exact match or designer approval.

The inspection page was exercised at `http://192.168.40.47:5199` on
2026-10-05, at 1280 x 800 and 390 x 844. Camera presets, close-ups,
wireframe, small-size view and model loading were checked. Simulated touch
pointer events exercised orbit and two-finger pinch, with pointer capture
stubbed for synthetic events. No physical-phone check was performed.
`renders/browser-desktop.png` and `renders/browser-phone.png` capture the
final GLB in the browser. The source and export hashes are in `export.json`.

`pnpm check` passed typecheck, lint and 466 tests, with one existing skipped
test. `pnpm build` passed with the existing bundle-size warning. The GLB
audit passed. Gameplay and combat animation are outside this static pass.
