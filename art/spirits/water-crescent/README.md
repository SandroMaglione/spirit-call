# Water Spirit, crescent model and animations

A static model of the supplied Water Spirit sheet. The dark faceted core,
tall cyan eyes, large left crescent, smaller right crescent, soft head highlight and
three floating fins carry its silhouette. This study lives beside the
existing Water Spirit so the new direction can be reviewed independently.

![Static model](renders/preview.png)

## Reference decisions

`reference/sheet.png` is the original attachment. `sheet.py` crops every
view, samples the five swatches and saves traced front landmarks in
`sheet.json`. The front and isometric images control the outline, exposed
face, part arrangement and colors. The labelled side views are turned
renderings. Their apparent scale and part overlap vary, so they help
interpret volume rather than establish exact orthographic measurements.

The main and right shells are closed curved blades with a front and rear
keel. Static review clarified that the pale sweep over the head looked too
solid as a separate cap. It now blends through the core's existing facet
colors, with no raised plate or seam. This visual correction takes priority
over treating the sheet's note about three shell pieces literally. The rear
and shell thickness remain an interpretation; the static viewer exposes
that choice from every direction.

A second review found the arrangement too heavy on the left. The upper and
tail fins now float on the right, mirroring their original outlines with a
small outward offset to leave space around the smaller crescent. Their
points still sweep inward and down; the small lower fin remains on the left
to continue the curve beneath the large crescent. The core and shells retain
their shapes.

No dimension is supplied. Overall mesh height is provisionally 0.60 m,
comparable to the compact existing Water Spirit. All pixel landmarks use
one uniform scale. The sphere and blade sections contain depth; the asset
contains no image planes or reference textures.

The source faces native +Y with +Z up. The supplied front corresponds to
a camera turned 16 degrees from that direction. `export.py` temporarily
turns the meshes 180 degrees about native Z before Blender's glTF axis
conversion, giving the GLB +Y up and +Z forward. The editable source stays
in meters, with a ground reference at world origin.

## Static review

![Same-scale reference and silhouette overlay](renders/review-reference.png)

The front silhouette overlap is 71.4%, with fixed traced coordinates and
one pixel scale. The overlay includes the core, shells and fins. It measures
the mask, not color accuracy, depth or consistency across the generated
views. Yellow is reference only; red is model only. This is a useful outline
comparison, not a quality gate: the fins intentionally depart from the
sheet's positions following the balance review.

![Eight cameras](renders/review-angles.png)

![Game-size review](renders/review-game-size.png)

The 32 and 64 px samples use a camera 30 degrees above the floor. The paired
eyes, dark core and opposing crescents remain visible at that scale.
The HTML inspector loads the actual GLB and provides nine camera presets,
orbit and zoom, wireframe, and a 32 px height setting. Browser review covers
desktop and a 390 x 844 viewport with a synthetic touch drag. This is browser
viewport evidence, not physical-phone performance evidence.

## Files and verification

- `water-crescent.blend` is the editable static source, with eight mesh
  objects and individual pivots. No skeleton or keyframes.
- `water-crescent.glb` has 1,798 triangles, two materials, eight primitives,
  vertex colors, cyan eye emission and no textures. Its native-facing
  dimensions are approximately 0.696 x 0.298 x 0.600 m.
- `export.json` records bounds, pivots, triangle counts and the file hash.
- `verification.json` audits closed manifold meshes, outward normals,
  triangulation, degenerate faces, flat shading, export contents and a
  Blender round trip. `reference-review.json` ties the overlay to the GLB hash.
- `browser-review.json` records the exported asset loaded in the inspector.

The eye surfaces have extra triangles to follow the faceted core.
All parts share one vertex-color material except the emissive eyes. Separate
meshes still mean eight draw calls in this standalone inspector.

The static pass passed typecheck, lint, 665 tests and the production build.
The approved static source and export remain the geometry reference.

## Animation

The animated source preserves the approved geometry, including the soft
head highlight and the two floating crystals moved to the right. The core
carries the eyes and all ornaments. The crescents sway slightly, while the
detached crystals bob out of phase and trail during a glide or dash. The
round core flexes more than the sharp shell shapes. Large blows turn the
whole assembly, with more separation between the floating pieces.

| Clip | Motion |
| --- | --- |
| Idle | Two-second hover, gentle facet movement and one paired blink |
| Run | Short repeating glide, forward lean and trailing ornaments |
| AttackA | Wind back and sweep through the first strike |
| AttackB | Opposing sweep for the second strike |
| AttackC | Stronger turning combo finisher |
| Power | Larger reverse turn for the charged strike |
| Dash | Forward stretch, narrowed eyes and streaming crystals |
| Hurt | Backward recoil, compression and recovery |
| Cast | Immediate lift and open eyes, with the ornaments spreading |
| Ultimate | Immediate leap, a full turn and a settling landing |

All ten clips use the shared spirit vocabulary at 30 fps. Idle is 2 seconds
and Run is 16 frames; their closing keys come from `closeLoop`. AttackA/B
contact is frame 4, AttackC/Power frame 6. The simulation owns travel and
hits; clips return to their starting floor position. Entrance and falling
remain the game's procedural spirit presentation, as for the other spirits.
The whole assembly is checked for floor clearance, including the lower fin.
Constant channels stay in the export so a blink cannot leave Run's eyes shut
or lose its held stretch.

`water-crescent-animated.blend` and `water-crescent-animated.glb` contain eight
object-animated meshes, 1,798 triangles and two materials. `animation.json`
records timing, contact frames, rest height and hashes. `export-animated.py`
generates `src/presentation/assets/water-crescent.ts`; the model is registered
as `waterCrescent` for the actual `Puppet` preview. This animation asset does
not replace Tidecaller's current gameplay look or change her kit.

The inspector now opens the animated model, with all ten clip buttons,
Preview all, rest pose, scrubbing, speed controls and the game's blending.
`static.html` keeps the static viewer. The [animation reel](renders/animation-preview.mp4)
renders the animated Blender object keys; [key poses](renders/animation-poses.png)
show the same source. Game-player verification is separate: tests compare
every object's exported contact transform through `Puppet`, verify hit-stop,
loop closure, floor clearance, constant Run scale, restored eyes, and
immediate Cast/Ultimate lift.

Typecheck, lint and all 80 test files pass, with 669 tests passed and one
skipped. The production build passes. The live GLB preview was checked at
1280 x 800 and 390 x 844 with a synthetic touch orbit. All ten representative
poses fit the phone viewport. These checks do not establish physical-device
performance. `animation-review.json` records the asset hash and review data.

## Rebuild

From the repository root, with Blender 4.5 LTS and `uv`:

```sh
uv run --with pillow art/spirits/water-crescent/sheet.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/water-crescent/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/water-crescent/export.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/water-crescent/verify.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/water-crescent/render.py
uv run --with pillow --with numpy art/spirits/water-crescent/review.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/water-crescent/export-animated.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/water-crescent/verify-animated.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/water-crescent/render-animation.py
uv run --with pillow art/spirits/water-crescent/review-animation.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/water-crescent/render-reel.py
uv run --with pillow art/spirits/water-crescent/encode-reel.py
pnpm dev --host --port 5219
```

Open `/art/spirits/water-crescent/` on the server's network address.
