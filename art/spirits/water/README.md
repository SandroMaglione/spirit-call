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
`measure.py` compares the front silhouettes height by height (within about
3% of the body's height; the base a little fuller on purpose).

## From the sheet

| The sheet | The model |
| --- | --- |
| About 0.6 m tall with its nub (scale reference) | Body 0.5 m (157 of the sheet's 190 pixels), hovering 6 cm, nub on top |
| Front and side silhouettes | The body's profile fitted to the front view row by row: a bottom-heavy bulb (widest under a third of the way up, the base a little fuller than the sheet), shoulders to 60% of its height, then a narrow tip; depth from the side view (96%); a slightly concave underside |
| Side view: the top curves back; uneven taper | The profile's middle curves back toward the tip (0.1 body heights at the tip) and drifts slightly to one side; the nub follows the curve |
| Faceted planes, soft but faceted | A lathe of 10 segments and 10 rings, each ring turned half a segment (large triangular facets), radii a few percent uneven |
| Eyes: separate emissive material, white-cyan | Tall ovals, centered on its face (34° apart) at 40% of its height (where the isometric view shows them, inside its outline from above), lying on the body's smooth curve; emissive white |
| Top droplet nub, same mesh look | A faceted ball (icosphere), its own object so it can bob |
| Colors: base #2E7BFF, mid #44B6FF, light #8EEBFF, highlight #E0F9FF | Each facet one flat color (vertex colors), deep blue low and away from the light, bright cyan high and toward it, a little random; a soft inner glow (each facet emits a little of its own color) |
| 100–300 triangles | 348: the body 200, the nub 80, the eyes 68 |

## Rebuild

```sh
blender --background --python-exit-code 1 --python art/spirits/water/build.py    # water-spirit.blend
blender --background --python-exit-code 1 --python art/spirits/water/render.py   # renders/
uv run --with pillow art/spirits/water/compare.py                                # renders/compare.png
uv run --with pillow --with numpy art/spirits/water/measure.py                   # silhouette vs the sheet
blender --background --python-exit-code 1 --python art/spirits/water/export.py   # water-spirit.glb
```
