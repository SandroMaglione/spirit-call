# Water spirit

The water character's spirit, as the game shows it: a faceted low-poly
droplet with two glowing eyes and a floating nub. Built only from its
character sheet (`reference/sheet.png`; the other images in `reference/`
are crops of its views).

![Model beside the sheet](renders/compare.png)

Top row: the sheet's hero render and front, side, back, and top views.
Bottom row: the model, rendered the same way. The hero view is isometric,
the game's camera (30° down), with the sheet's turn: beside the sheet's
and at game size in [hero-compare.png](renders/hero-compare.png).
`measure.py` compares the front silhouettes height by height.

## From the sheet

`sheet.py` measures the sheet's front and side views into `sheet.json`:
the body's outline row by row, the nub, and the eyes. `build.py` lofts the
body through those outlines: each ring takes its four extents at its
height (left and right from the front view, front and back from the side
view), so the bulb, the uneven taper, and the cap's back curving in toward
the nub are the sheet's own, not fitted by eye. `overlay.py` lays the
renders on the sheet's views and scores the overlap (front 96%, side 96%,
back 91%; the rest is the facets' own unevenness):
[front](renders/overlay-front.png), [side](renders/overlay-side.png),
[back](renders/overlay-back.png).

| The sheet | The model |
| --- | --- |
| About 0.6 m tall with its nub (scale reference) | Body 0.5 m, hovering 6 cm, nub on top |
| Front and side outlines | Lofted through them (12 rings of 10 facets, each ring turned half a step, a little uneven) |
| The nub floating over the tip, behind it | Where both views put it (its center, size) |
| Eyes: tall ovals, separate emissive material | Flat upright plates facing straight ahead (no tilt), set just in front of the surface; size and spacing from the front view; height from the isometric view (below) |
| Colors: base #2E7BFF, mid #44B6FF, light #8EEBFF, highlight #E0F9FF | Each facet one flat color (vertex colors), deep low and away from the light, bright high and toward it; a soft inner glow |
| 100–300 triangles | 348 (the nub's 80 can come down) |

**Where the sheet disagrees with itself.** Its isometric hero view and its
front view cannot both be one model: in the hero view the eyes sit at 31%
and 23% of the silhouette's height, with body showing under them; a body
with the front view's outline shows that only if its eyes are at 41% of
its height, where the front view draws them at 26%. The model follows the
hero view (it is the game's camera), so its front view shows the eyes
higher than the sheet's. (The sheet's front view is also turned about
17°, so its eyes are off center; the model's are centered.)

## Rebuild

```sh
blender --background --python-exit-code 1 --python art/spirits/water/build.py    # water-spirit.blend (reads sheet.json)
blender --background --python-exit-code 1 --python art/spirits/water/render.py   # renders/
uv run --with pillow art/spirits/water/compare.py                                # renders/compare.png
uv run --with pillow --with numpy art/spirits/water/sheet.py                     # sheet.json (once per sheet)
uv run --with pillow --with numpy art/spirits/water/overlay.py                   # renders on the sheet, scored
blender --background --python-exit-code 1 --python art/spirits/water/export.py   # water-spirit.glb
```
