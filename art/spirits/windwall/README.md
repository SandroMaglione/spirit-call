# Windwall model and animation

Windwall's model follows the supplied Wind Spirit sheet: a cream and mint
faceted hood, a recessed dark face with two pale yellow eyes, two crystal
leaves, a pointed floating body with a separate teal crystal, and a broad cape
with pale upper blades and teal lower leaves.

`windwall.blend` is the editable static source. `windwall.glb` is the
inspection export: 416 triangles, three materials, twelve closed mesh
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
The cream collar ribbons and gem frame were removed following review.
The hood, body, cape and crest retain 65% of their initial depth; the full
side profile is now 0.280 m deep instead of 0.408 m. Front width and total
height remain the same. The eight-facet chest crystal floats at least
0.016 m clear of the body, independently verified after GLB re-import.
The body has actual depth and a pointed underside, with no legs.

Facet colors use the sheet's palette. The palette and socket export with
`KHR_materials_unlit` to retain their painted color from all angles,
including the underside. The eyes use constant pale yellow emission;
glTF cannot reproduce Blender's emissive vertex-color connections. There
are no runtime glow helpers in the model.

## Inspect

From this worktree, run `pnpm dev --host --port 5204 --strictPort` and open
`/art/spirits/windwall/index.html` on the server's printed network address.
The inspector loads `windwall-animated.glb`. It supports clip buttons,
pause, replay, slow motion, scrubbing, orbit, pinch and zoom, eight camera
presets, detail views, wireframe, a 40 px gameplay-size view, the reference,
comparisons, and static and animated source downloads.

`renders/review.png` compares the front, back and hero with the original
sheet and shows the game's 30 degree camera. `renders/overlay-*.png` and
`renders/overlap.json` retain strict-camera silhouette comparisons.
`camera-fit.json` and `renders/fitted-*.png` retain the best camera samples
for the turned upright drawings. These scores measure silhouettes only,
using uniform height normalization and no independent width stretching.

The sheet's views do not describe one exact orthographic volume. Its
side drawings show a visible face and a long cape depth, while its top
and bottom drawings make the cape much shallower. The initial model
followed the upright drawings; the revised depth follows the user's
request for a slimmer side profile. The inspector
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

The revision keeps before renders in `renders/before-*.png` and compares
the side and game camera at identical scale in `renders/revision.png`.
The camera fits and reference overlays were regenerated for the revision.

## Animation

The approved static `.blend` and `.glb` remain unchanged. `export.py` opens
that source, adds object animation, and saves `windwall-animated.blend`
and `windwall-animated.glb`. The animated export keeps the same 416
triangles, three materials, and twelve mesh parts, without a skeleton.

Idle is a two-second hover with a blink, cape sway, crest flutter and
independent crystal bob. Run is a 16-frame forward lean with trailing
leaves. AttackA, AttackB, AttackC, Power, Dash, Hurt, Cast and Ultimate
use the shared spirit combat channels and contact frames. Windwall has
restrained strikes, opens its cape to cast, and rises into a spinning
ultimate. Skills rise by frame two, with no preparatory crouch.
The top-level Windwall transform stays fixed; a child carries temporary
leans and squash. One-shots begin and end at rest. The simulation owns
travel, contacts, timing and hitboxes.

`animation-export.json` records clip and loop times, attack contact times,
rest height, envelopes and hashes. The inspector uses the game's
`closeLoop` to append each loop's first pose at its full loop duration.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/windwall/export.py
uv run --with numpy art/spirits/windwall/verify-animation.py
```

`verify-animation.py` reads the delivered binary independently of Blender.
It compares all mesh attributes, materials and rest-world positions with
the static export, checks all ten clips and their times, then samples
world-space poses at 120 Hz to check floor clearance, crystal separation,
fixed root, in-place loops, early casting rise and one-shot rest return.

## Game integration

`export.py` also writes `src/presentation/assets/windwall-spirit.ts`, so
runtime height and clip timing come from the export. `looks.ts` connects
the model to the existing Windwall character: its Staff combo, Gale Wall
and Eye of the Storm use the shared spirit moments. The cape keeps its
sheet colors, with a restrained teal halo, yellow eye glow and mint wisps.
The simulation scales clips to its own timing.

Windwall's unlit palette uses `MeshBasicMaterial`. `Puppet` now owns these
materials per copy and applies tint, hit flash and opacity to them, so
invulnerability and falling affect the entire model. Standard materials
keep their existing emissive flash. Tests check copy isolation and
restoration, and load the actual GLB to check arena height, blink,
independent crystal motion and a fixed facing root through every clip.

The integration passed `pnpm check` (703 tests, one existing skip) and
`pnpm build`. The binary animation audit passed on the exported asset.
On the network address above, the T3 browser loaded all ten clips in the
arena, checked movement, dash opacity, both skills, and the generated
Windwall portrait. The 844 × 390 landscape review used synthetic touch
stick movement, three attack taps, a held attack and dash; pointer capture
was stubbed for synthetic events. `renders/game-desktop.png` and
`renders/game-phone-touch.png` retain screenshots. This checks browser
behavior and layout, not physical-device performance.
