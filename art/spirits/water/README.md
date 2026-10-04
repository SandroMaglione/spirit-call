# Water spirit

The water character's spirit, as the game shows it: a faceted low-poly
droplet with two glowing eyes and a floating nub. Built only from its
character sheet (`reference/sheet.png`; the other images in `reference/`
are crops of its views).

![The model laid on each of the sheet's views](renders/overlay-all.png)

The model rendered from each of the sheet's cameras and laid on its view
(the sheet's front, side, back, top, and hero views; sheet outlines yellow,
model red): [front](renders/overlay-front.png), [side](renders/overlay-side.png),
[back](renders/overlay-back.png), [top](renders/overlay-top.png),
[hero](renders/overlay-hero.png). Its true front, the game's camera, and
game size: [model-views.png](renders/model-views.png).

## From the sheet

1. `sheet.py` measures the sheet's front, side, and back views into
   `sheet.json`: each outline row by row, the nub, the eyes.
2. `fit.py` works out what the views are. The back and side views are true
   views; the "front view" is the body turned 17° (its eyes off center).
   With the body lofted through the true views, it finds that turn and the
   eyes' place on the true front (26% of its height, 0.30 body heights
   apart) that lands them exactly where the turned view draws them.
3. `build.py` lofts the body through the true views (each ring's left and
   right from the back view, front and back from the side view), so the
   bulb, the uneven taper, and the cap's back curving toward the nub are the
   sheet's own; puts the nub where both views show it; and the eyes, flat
   upright plates facing straight ahead, centered.
4. `sweep_score.py` finds the hero view's camera by rendering many and
   scoring each against it: turned 40°, only 10° from above (not the
   game's 30°).
5. `overlay.py` lays each render on the sheet's view and scores the
   overlap: front 92%, side 96%, back 96%, top 86%, hero 87% (the hero's
   includes its label).

| The sheet | The model |
| --- | --- |
| About 0.6 m tall with its nub (scale reference) | Body 0.5 m, hovering 6 cm, nub on top |
| Front, side, back outlines | Lofted through the true views (12 rings of 10 facets, each ring turned half a step, a little uneven) |
| The nub floating over the tip, behind it | Where the views put it |
| Eyes: tall ovals, separate emissive material | Flat upright plates on the true front, centered; placed so the sheet's turned views show them where it draws them |
| Colors: base #2E7BFF, mid #44B6FF, light #8EEBFF, highlight #E0F9FF | Each facet one flat color (vertex colors), deep low and away from the light, bright high and toward it; a soft inner glow |
| 100–300 triangles | 348 (the nub's 80 can come down) |

## Rebuild

```sh
blender --background --python-exit-code 1 --python art/spirits/water/build.py    # water-spirit.blend (reads sheet.json)
blender --background --python-exit-code 1 --python art/spirits/water/render.py   # renders/
uv run --with pillow art/spirits/water/compare.py                                # renders/compare.png
uv run --with pillow --with numpy art/spirits/water/sheet.py                     # sheet.json (once per sheet)
uv run --with numpy art/spirits/water/fit.py                                     # the front view's turn, the eyes
uv run --with pillow --with numpy art/spirits/water/overlay.py                   # renders on the sheet, scored
blender --background --python-exit-code 1 --python art/spirits/water/export.py   # water-spirit.glb
```
