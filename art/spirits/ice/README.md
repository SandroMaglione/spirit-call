# Ice Spirit

Static character model built from the supplied Ice Spirit production sheet.
Editable source: [ice-spirit.blend](ice-spirit.blend). Export:
[ice-spirit.glb](ice-spirit.glb). Open [index.html](index.html) through Vite to
orbit the model, choose cameras, inspect wireframe, or view it at 32 px high.

![Static model](renders/preview.png)

## Shape and reference decisions

The model preserves the long crystal crown, broad hood around the face,
pointed lower body, two upright upper shards, two diagonal lower blades,
dark indigo recess, and two tall cyan eyes. Colors are sampled from the
sheet's swatches. Each ice plane has a flat vertex color. The eyes use pale
cyan emission to reproduce the drawing's luminous centers.

The front drawing supplies the traced X/Z landmarks in `sheet.json`.
The labels give an overall height of 0.80 m, width of 0.55 m, and depth of
0.35 m. The drawing's pixel proportions do not agree with those labels,
so width and height use separate pixel-to-meter scales. The model is
slightly narrower in proportion than the original picture. The comparison
preserves that visible difference; only the scored overlay normalizes the
reference to the stated width and height.

Several smaller labels also conflict with the drawing. A 0.30 m body
width, the 0.15 m crown, and shard offsets of ±0.21 m do not reproduce the
pictured proportions at the stated overall size. The drawing wins for
part shape and position. The upper shard pivots are approximately ±0.23 m;
the lower blades are closer to the body, approximately ±0.13 m. The crown
is separate but joins flush, because the image shows a continuous point.
The side drawing is oblique and does not establish an orthographic side
silhouette. No back view is supplied. The rear continues the closed
crystal volume with a keel and triangular facets, without extra ornaments.

The front silhouette scores **94.8% intersection over union** against the
dimension-normalized reference mask, including the four detached shards.
This measures silhouette, not color, face accuracy, or resemblance from
every camera. See [the comparison](renders/review-reference.png),
[all angles](renders/review-angles.png), and
[game-size samples](renders/review-game-size.png).

## Asset contract

| Property | Value |
| --- | --- |
| Stage | Static geometry only |
| Dimensions | 0.80 m high × 0.55 m wide × 0.35 m deep |
| Triangles | 1,194 |
| Objects | 8 independently positioned meshes |
| Materials | 3 shared materials, 9 glTF primitives |
| Native Blender axes | Meters, +Z up, +Y forward |
| GLB axes | Meters, +Y up, +Z forward |
| World origin | Center of the lowest crystal tip, exactly at ground |
| Height basis | Ground origin to the highest rest mesh vertex, including crown |
| Shading | Flat on every face; vertex-color ice palette |
| Rig, animation, UVs, textures, helper objects | None |

`IceSpirit` has its pivot at `(0, 0, 0.45)` m. Its front surface surrounds
an actual opening, with a bevel and backing about 5.8 cm below the outer
lip. There is no hidden intact ice surface behind the eyes.
`Crown` has its pivot at `(0, 0, 0.73)` m. `Shard.Upper.L`,
`Shard.Upper.R`, `Shard.Lower.L`, and `Shard.Lower.R` have centered local
pivots. `Eye.L` and `Eye.R` are mirrored thin ellipsoids with their own
centered pivots. These names are suitable for later object animation;
Three.js sanitizes dots when loading them.

The `.blend` preserves the sheet's native +Y-facing convention. Export
temporarily rotates the objects 180° about native Z before Blender's glTF
axis conversion, producing a +Z-facing GLB. The saved source stays +Y
facing. `export.json` records exact bounds, pivots, triangle counts, and
the GLB hash. There is no runtime registration or animation in this pass.

## Rebuild

From the repository root, with Blender 4.5 LTS and `uv`:

```sh
uv run --with pillow --with numpy art/spirits/ice/sheet.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/ice/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/ice/export.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/ice/verify.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/ice/render.py
uv run --with pillow --with numpy art/spirits/ice/review.py
pnpm dev --host --port 5217 --strictPort
```

Open `/art/spirits/ice/` on the network address printed by Vite. The viewer
loads the GLB using its export hash to avoid showing a cached earlier pass.
Review PNGs document this static pass and must be regenerated after edits.

## Verification

`verify.py` passes for all eight native meshes: closed manifold surfaces,
no degenerate faces or loose vertices, triangles only, and no smoothing.
It reads the binary GLB to check triangle counts, materials, vertex colors,
and absence of animation, skeletons, textures, cameras, lights, and Draco.
It imports the GLB back into Blender to verify scale, orientation, and the
ground point. Results are in [verification.json](verification.json).

`pnpm check --maxWorkers=2` passed: 68 test files, 565 tests passed,
one skipped. `pnpm build` passed. The initial check used the existing
checkout's incomplete dependencies and failed on missing SQL packages;
installing the locked dependencies in this worktree resolved it.

The final GLB was reviewed in the collaborative browser on the network
address, with desktop and 390×844 phone layouts. Camera presets, wireframe,
32 px framing, and simulated touch orbit were checked. Touch used synthetic
PointerEvents with pointer capture stubbed during dispatch. It is a browser
handler check, not a physical phone check. Preview screenshot capture failed;
visual inspection used the browser canvas and the fresh Blender renders.
No physical-device performance or gameplay review is claimed for this
static asset.
