# Water spirit

The water character's spirit, as the game shows it: a faceted low-poly
droplet with two glowing eyes and a floating nub. Built only from its
orthographic model sheet (`reference/sheet.png`; the other images in
`reference/` are its views, cropped; `reference/v1/` is the first sheet).

![The model laid on each of the sheet's views](renders/overlay-all.png)

The model rendered from each of the sheet's cameras and laid on its view
(front, back, left, right, top, bottom, and the isometric render; sheet
outlines yellow, model red). Full size: `renders/overlay-<view>.png`.
Beside the sheet, and at the game's camera and size:

![Front and isometric, beside the sheet; the game's camera; game size](renders/compare.png)

## From the sheet

1. `sheet.py` measures the front, back, left, and right views into
   `sheet.json`: each outline row by row, the nub, the eyes.
2. `build.py` lofts the body through those outlines: each ring takes its
   left and right extents from the front and back views and its front and
   back from the left and right views (each pair averaged), so the bulb,
   the uneven taper, and the back curving in toward the nub are the sheet's
   own. The nub floats where the views put it.
3. The eyes are painted, not modeled: a texture (`eyes.png`) projected
   from the front onto the front facets, the ovals exactly where and as
   big as the front view draws them, glowing (an emissive texture in the
   GLB). They lie on the surface, so they cannot sink into the facets or
   stand out of them.
4. `sweep_score.py` finds the isometric render's camera (35° round, 10° up)
   by rendering many and scoring each against it.
5. `overlay.py` lays each render on the sheet's view and scores the
   overlap: front 96%, back 97%, left and right 96%, isometric 93%, top and
   bottom 87–88% (the sheet's glow widens those).

| The sheet | The model |
| --- | --- |
| About 0.6 m tall with its nub | Body 0.5 m, hovering 6 cm, nub on top |
| Front, back, left, right outlines | Lofted through them (12 rings of 12 facets, each ring turned half a step) |
| Bottom: a concave underside | The underside's middle 4% of its height above its rim |
| Eyes: white glow | Painted on: projected emissive texture, white |
| Base #2E7BFF, mid #4486FF, light #8EEBFF, eye #FFFFFF | Each facet one flat color (vertex colors), deep low and away from the light, light high and toward it |
| Low-poly | 308 triangles, a 51 KB GLB |

## Rebuild

```sh
uv run --with pillow --with numpy art/spirits/water/sheet.py                     # sheet.json (once per sheet)
blender --background --python-exit-code 1 --python art/spirits/water/build.py    # water-spirit.blend, eyes.png
SWEEP=/tmp/sweep blender --background --python art/spirits/water/render.py       # isometric camera candidates
uv run --with pillow --with numpy art/spirits/water/sweep_score.py /tmp/sweep    # its camera, into sheet.json
blender --background --python-exit-code 1 --python art/spirits/water/render.py   # renders/
uv run --with pillow --with numpy art/spirits/water/overlay.py                   # renders on the sheet, scored
blender --background --python-exit-code 1 --python art/spirits/water/export.py   # water-spirit.glb
```
