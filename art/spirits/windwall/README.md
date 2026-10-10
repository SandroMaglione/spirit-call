# Windwall — static model

Windwall's model follows the supplied Wind Spirit sheet: a cream and mint
faceted hood, a recessed dark face with two pale yellow eyes, two crystal
leaves, a pointed floating body with a framed teal gem, and a broad cape
with pale upper blades and teal lower leaves.

`windwall.blend` is the editable static source. `windwall.glb` is the
inspection export: 1,024 triangles, three materials, fifteen closed mesh
parts, no textures, skeleton, animation, cameras, or lights. The scene root
is a transform at the ground origin. Blender is Z up, facing -Y; glTF is
Y up, facing +Z. The lowest point floats 0.04 m above the origin. The
normalized silhouette is 0.62 m tall; the complete rest height including
that hover is 0.66 m. `export.json` records the measured bounds and hashes.
The sheet gives no real-world height, so this is a uniform modeling scale.

The hood is a closed volume with inward-sloping socket walls and a backing
inside the same mesh. Eyes are separate thin, closed ellipses named
`Eye.L` and `Eye.R`, mirrored from the sheet's measured 10–11 px width,
25–26 px height, and 28.6 px center spacing. The paired cape parts are
mirrored; the two crest leaves keep the reference's asymmetric shape.
Cream collar ribbons are sampled against the cape surface so they follow
its facets. The body has actual depth and a pointed underside, with no legs.

Facet colors use the sheet's palette. The palette and socket export with
`KHR_materials_unlit` to retain their painted color from all angles,
including the underside. The eyes use constant pale yellow emission;
glTF cannot reproduce Blender's emissive vertex-color connections. There
are no runtime glow helpers in the model.

## Inspect

From this worktree, run `pnpm dev --host --port 5204 --strictPort` and open
`/art/spirits/windwall/index.html` on the server's printed network address.
The inspector loads the actual GLB. It supports orbit, pinch and zoom,
eight camera presets, detail views, wireframe, a 40 px gameplay-size view,
the reference, comparisons, and source downloads.

`renders/review.png` compares the front, back and hero with the original
sheet and shows the game's 30 degree camera. `renders/overlay-*.png` and
`renders/overlap.json` retain strict-camera silhouette comparisons.
`camera-fit.json` and `renders/fitted-*.png` retain the best camera samples
for the turned upright drawings. These scores measure silhouettes only,
using uniform height normalization and no independent width stretching.

The sheet's views do not describe one exact orthographic volume. Its
side drawings show a visible face and a long cape depth, while its top
and bottom drawings make the cape much shallower. The upright drawings
drive this model's cape depth, following `docs/spirits.md`. The inspector
keeps strict orthographic views as well as the reference comparisons;
the scores document differences and do not imply designer approval.

## Rebuild and verify

From the repository root:

```sh
uv run --with pillow --with numpy art/spirits/windwall/measure.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/windwall/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/windwall/render.py
uv run --with pillow --with numpy art/spirits/windwall/review.py
uv run --with numpy art/spirits/windwall/audit.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/windwall/verify.py
```

For a camera sweep, run `render.py` with `SWEEP=/tmp/windwall-camera-fit`,
then `uv run --with pillow --with numpy art/spirits/windwall/fit.py`.
`measure.py` preserves original crops, masks, seam polygons, outlines,
and eye measurements in `sheet.json`; `build.py` records the construction
profiles in sheet pixel units. The source sheet is retained unchanged.

The binary audit checks embedded buffers, materials, vertex colors,
triangle budget, and absence of animation, skeletons, textures, helpers,
and compression. The Blender round-trip independently checks bounds,
coordinate conversion, hover height, and closed surfaces after welding
the duplicated vertices used for facet colors.

## Verification on 2026-10-10

`pnpm check` passed typecheck, lint, and 565 tests, with one existing skip.
The first run used stale shared dependencies; a frozen-lockfile install in
the isolated worktree resolved its missing Effect SQL packages.

The actual GLB loaded at `http://192.168.0.45:5204` in the T3 browser at
1280 × 800 and 390 × 844. Camera presets, detail views, wireframe, and
gameplay-size projection were checked. Synthetic touch orbit changed
camera position, and pinch changed zoom from 1 to 1.5, with pointer capture
stubbed for synthetic events. This is browser review, not a physical
phone performance check. `renders/browser-desktop.png` and
`renders/browser-phone.png` preserve the review. `browser-review.json`
records the scope of those checks.

This folder is the complete static model deliverable. It adds no content
ids, animation clips, game assets registration, or gameplay changes.
