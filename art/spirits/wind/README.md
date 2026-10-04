# Wind spirit

The wind character's spirit: a faceted, near-white ball with dark eyes, two
crystal leaves on top, a crescent horn on each side sweeping back and
curling up, and two leaves hanging under it. Built only from its
production model sheet (`reference/sheet.png`; the other images in
`reference/` are its views, cropped). In the game it is the wind
character's (the Swordsman's) spirit.

![The model laid on each of the sheet's views](renders/overlay-all.png)

The model rendered from each of the sheet's cameras and laid on its view
(front, back, left, right, top, bottom, and the isometric render; sheet
outlines yellow, model red). Beside the sheet, and at the game's camera:

![Beside the sheet; the game's camera](renders/compare.png)

## From the sheet

1. `sheet.py` measures the front and left views into `sheet.json`: the
   body, an ellipse fitted to its near-white outline where it meets the
   background (the leaves and horns cover the rest); each leaf's base,
   tip, and widths from base to tip; each horn's middle line and its width
   along it; and the eyes (the holes in the body).
2. `build.py` makes the body a faceted ball through those ellipses (its
   width from the front view, its depth from the left view), and each part
   its own object, its origin at its base, to sway:
   - the leaves are crystal blades from base to tip, across and height
     from the front view, front to back from the left view, their blades
     turned between the two so each view sees its own width;
   - the horns follow their middle lines (across from the front view, depth
     from the left view's, height halfway between theirs), rooted in the
     body's sides (both views lose the root where it crosses the body),
     thickest there and narrowing to a point; crescent blades, broad in the
     plane they curl in;
   - the dark eyes are laid on the surface (`Eye.L`, `Eye.R`, to blink),
     one size, mirrored about the body's middle.
3. Colors are the swatches, one per facet: the body white toward the light,
   pale aqua, minty pale aqua away from it; the leaves mint to teal.
4. `tools/overlay.py` scores the overlap: front 69%, back 60%, left 59%,
   right 57%, the isometric render 53%, top 44%, bottom 45%.

**Where the sheet disagrees with itself.** The model follows the front and
left views. The back view draws an S-shaped tail wrapping round the body
where the front and side views draw two leaves; the right view is not the
left's mirror image (its horn comes over the top of the head); the left
view shows a curl above the head that no other view has; the top view
draws five leaves round the body. Its measurements label the body 0.32 m
tall; its drawings measure about 0.24 m.

## In the game

- **Clips** (`animate.py`, keyed on its objects, exported with it): an idle
  that bobs and tilts on a breeze while the top leaves flutter, the horns
  sway, and the leaves under it swing, with a blink; a run that hops,
  squashes on landing, and leans in, its leaves and horns swept back.
- **Glow** (`windGlow` in `src/presentation/models.ts`): teal edges and a
  teal halo, kept low (its palette is pale); its eyes stay dark.
- **Wisps** while it moves (its look's `drops` with `kind: "wisp"`): mint
  and white motes curling away behind it as they fade.
- Scaled by its whole height, top leaves included (they grow from it), so
  it stands as tall as the other spirits.

## Rebuild

From the repository root, with Blender 4.5 LTS and `uv` (the shared tools
are in `../tools/`, see `docs/spirits.md`):

```sh
uv run --with pillow --with numpy art/spirits/wind/sheet.py                       # sheet.json (once per sheet; drops the isometric camera)
blender --background --python-exit-code 1 --python art/spirits/wind/build.py     # wind-spirit.blend
SWEEP=/tmp/sweep blender --background --python art/spirits/tools/render.py -- wind   # isometric camera candidates
uv run --with pillow --with numpy art/spirits/tools/sweep_score.py wind /tmp/sweep  # its camera, into sheet.json
blender --background --python-exit-code 1 --python art/spirits/tools/render.py -- wind  # renders/
uv run --with pillow --with numpy art/spirits/tools/overlay.py wind                 # renders on the sheet, scored
uv run --with pillow --with numpy art/spirits/tools/compare.py wind                 # renders/compare.png
blender --background --python-exit-code 1 --python art/spirits/wind/export.py     # wind-spirit.glb with its clips, src/presentation/assets/wind-spirit.ts
```
