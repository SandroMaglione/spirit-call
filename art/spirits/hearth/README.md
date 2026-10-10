# Hearth static spirit

Hearth modeled from the supplied Fire Spirit sheet. A thick, open stone
brazier holds a solid faceted flame. The face is cut into the tapered body,
with two warm oval eyes on its inset backing. Two broad side stones and a
smaller front stone float around it. Angular jaw plates belong to the bowl.

![Static model beside the supplied reference](renders/preview.png)

Open [the interactive viewer](index.html) through Vite. It loads the actual
static GLB, with orbit controls, sheet cameras, true level cameras, wireframe,
optional review bloom and a 32 px mode. The glow toggle changes the viewer's
bloom; the flame's colored facets and molten seams are part of the asset.

- [Editable Blender source](hearth-spirit.blend)
- [Static GLB](hearth-spirit.glb)
- [Reference comparison](renders/review-reference.png)
- [Every angle](renders/review-angles.png)
- [Game-camera samples](renders/review-game-size.png)
- [Original supplied sheet](reference/sheet.png)
- [Export metadata](export.json) and [geometry audit](verification.json)

The GLB has 2,982 triangles, seven mesh nodes, four shared materials and
twelve primitives. It uses vertex colors and embeds no textures. The
visible figure is 0.80 m tall, with its lowest stone 0.08 m above the ground
origin. Its full height from that origin, including the flame, is 0.88 m.
The silhouette is approximately 0.80 m wide. Exact bounds are in the export
metadata. The native file uses Blender +Z up and -Y forward; the GLB uses
+Y up and +Z forward.

This is the static review stage. It contains no rig, animation clips or
runtime registration. The source preserves the bowl, jaw plates, flame
lobes, supports, eyes and surface seams as editable pieces. The exporter
combines the body details and joins each support's seam to its stone,
keeping seven named nodes for a future animation pass.

## Reading the sheet

`sheet.py` crops the seven supplied views and records pixel anchors,
silhouette rows and flame widths in `sheet.json`. The front silhouette is
301 px high; that sets the 0.80 m model scale. The rim is approximately
246 px wide. The three-support layout follows the top and bottom views.
The flame keeps its asymmetric curl in both horizontal axes, so its shape
is visible from the sides.

The sheet's cardinal pictures show the bowl opening, so their comparison
cameras sit 10 degrees above horizontal. The side pictures are also turned
toward the face. The viewer labels those presets "Sheet left" and "Sheet
right"; separate level cameras show the actual orthographic geometry.
The hero camera is 16 degrees up, and the game camera is 30 degrees up.

The supplied views disagree on apparent depth, the size of the small
support, and which side exposes the face. This model keeps one coherent
bowl and one forward-facing recess. The eyes are mirrored and centered.
`reference-review.json` records the camera settings and silhouette overlap
for every comparison. The current overlap is about 84% at the front and
85% at the back, with lower side scores. These measurements are diagnostics
for shape, not a claim about matching every drawn facet or glow.

The stone palette runs from dark plum to warm brown. Flame and seam colors
run from red-orange to pale yellow. The flame and eyes use glTF's unlit
material extension to preserve their colored emission under different
lights. The stone uses a rough vertex-colored material; the recess has its
own dark material. Cameras, lights, shadows and bloom in the review are
not exported.

## Rebuild

From the repository root, with Blender 4.5 LTS and `uv`:

```sh
uv run --with pillow --with numpy art/spirits/hearth/sheet.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/hearth/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/hearth/export.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/hearth/verify.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/hearth/render.py
uv run --with pillow --with numpy art/spirits/hearth/review.py
pnpm dev --host --port 5208 --strictPort
```

Open `/art/spirits/hearth/index.html` on the printed network address.
`render.py -- front,hero` renders only those named views for iteration.
The scripts are self-contained and do not change the shared spirit tools.

## Validation

The native geometry audit checks closed solid parts, flat triangular
faces, no degenerate faces or loose vertices, symmetric eyes on the
recessed backing, and no animation or helper objects. Molten seam strips
are intentional open surface details. The GLB audit checks the triangle
budget, seven mesh nodes, four materials, vertex colors, forward-facing
eyes, unlit colored flame, no skins, clips, textures or compression, and
matching bounds after importing the export back into Blender.

The network browser review checked loading, camera presets, wireframe and
phone layouts at 390 × 844 and 844 × 390. Touch orbiting was tested with
synthetic touch PointerEvents, with pointer capture stubbed during that
probe. This is browser evidence, not physical-phone performance evidence.
`browser-review.json` records the export hash and saved captures.

`pnpm check --maxWorkers=2` passed typecheck, lint and 565 tests, with one
existing skipped test. `pnpm build` passed with the existing bundle-size
warning. The first check used an incomplete shared dependency directory;
installing this worktree's frozen lockfile resolved the missing SQL
packages. Only files under `art/spirits/hearth/` belong to this change.
