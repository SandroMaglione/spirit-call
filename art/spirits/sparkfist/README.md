# Sparkfist thunder spirit

The approved Ice Spirit adapted for Sparkfist's thunder element. This pass
changes the palette to violet and gold, warms the glowing eyes, and adds a
small gold lightning mark on the rear. The pointed silhouette, crown,
four floating shards, face recess and part pivots are preserved.

![Before and after](renders/review-comparison.png)

Open [the viewer](index.html) through Vite to orbit the static GLB,
switch between Sparkfist and the Ice source under the same camera and
lights, inspect wireframe, and check the 32 px framing.
[All angles](renders/review-angles.png) and
[game-size samples](renders/review-game-size.png) use actual Blender renders.

The editable source is [sparkfist-spirit.blend](sparkfist-spirit.blend).
The static export is [sparkfist-spirit.glb](sparkfist-spirit.glb).
It has 1,218 triangles, eight mesh objects, three shared materials and
nine GLB primitives. Rest dimensions remain 0.80 m high, 0.55 m wide and
0.35 m deep. The ground origin, native +Y facing and exported +Z facing
match the Ice source.

The existing Ice animation files are unchanged. The inherited `IceSpirit`,
`Crown`, shard and eye node names remain because the animation recipe
binds to them. The rear bolt is a closed mesh joined to the body, sharing
its material, so it follows the body's clips without another animation
track. The approved static review is commit `2953449`, before integration.

## In the game

[sparkfist-spirit-animated.blend](sparkfist-spirit-animated.blend) and
[sparkfist-spirit-animated.glb](sparkfist-spirit-animated.glb) contain the ten
accepted Ice clips, rebuilt on the approved violet/gold geometry.
`export-animated.py` imports `../ice/animate.py` directly. Timing and every
exported animation channel are identical to the original Ice GLB, checked
by [verification-animated.json](verification-animated.json).

The generated `assets/sparkfist-spirit.ts` spec supplies the full rest
height and clip timing. `models.sparkfistSpirit` adds a restrained violet
rim and halo and gold eye glows. `characterLooks.sparkfist` selects it with
the existing four-hit combo mapping, charged attack, dash, hurt, Spark Step
and Storm Flurry moments. Gold/violet embers replace the placeholder's
trail. Both eyes use the inherited eye nodes; Stormcaller's eye rims and
the old blue tint are no longer applied to Sparkfist.

The character kit, stats, collision radius, simulation movement, contact
times and skill rules are unchanged. The skin's local lean follows those
times through `Puppet`, with floor clearance and no root travel.

Open [the animation inspector](animation.html) for individual clips,
scrubbing, a complete sequence and the actual game's animation blending.
[Key poses](renders/animation-poses.png) show all ten clips.

### Rebuild animations

After rebuilding the static asset, run:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/sparkfist/export-animated.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/sparkfist/verify-animated.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/sparkfist/render-animation.py
uv run --with pillow art/spirits/sparkfist/review-animation.py
```

The recolor preserves the original broad facet colors across their
subdivided triangles. Body shades range from dark violet to lilac;
floating shards range from amber to pale gold. The face stays dark for
contrast with the warm eyes. [adaptation.json](adaptation.json) records the
palette and source hash.

## Rebuild

Run from the repository root with Blender 4.5 LTS and uv:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/sparkfist/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/sparkfist/export.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/sparkfist/verify.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/spirits/sparkfist/render.py
uv run --with pillow art/spirits/sparkfist/review.py
pnpm dev --host --port 5221 --strictPort
```

The exporter, topology audit and render cameras follow the source asset's
tools. The build reads the approved Ice Blender source directly and writes
only this folder.

## Verification

[verification.json](verification.json) checks closed manifold surfaces,
flat shading, no loose vertices or degenerate faces, all original vertex
positions and pivots, triangle count, vertex colors, hash, dimensions,
ground origin and facing after a GLB round trip. The static GLB has no
animation, skeleton, textures, cameras or lights.

The static pass passed `pnpm check --maxWorkers=2` with 688 tests. The
integration passed with 83 test files and 692 tests passed, one skipped;
`pnpm build` passed. The Ice animation regression suite now runs against
both assets, checking rest dimensions, parenting, floor clearance, loop
closure, eye recovery, immediate skills, contact poses through `Puppet`
and freeze behavior. The production build bundles the animated GLB.

The exported GLB loaded on Vite's network address at desktop and 390×844
phone sizes. Camera presets, the source comparison, 32 px framing and
synthetic touch orbit were checked. Phone buttons are at least 44 px tall,
with no horizontal overflow. Touch used synthetic PointerEvents with
pointer capture temporarily stubbed. Browser screenshot capture failed;
visual review uses the fresh Blender renders.

Gameplay was reviewed on the network address at 1280×800 and 844×390.
[Desktop recording](renders/gameplay-desktop.mp4) shows movement and the
loaded model and portraits. [Phone recording](renders/gameplay-touch.mp4)
shows simulated touch movement, the four combo poses, charged attack,
dash, both skills and switching. A temporary browser probe recorded the
actual `ActorBody.play` calls, including the expected contact mapping.
[gameplay-review.json](gameplay-review.json) records those observations.
Recordings were inspected through extracted frames because browser
snapshot capture failed. No physical-device performance check is claimed.
