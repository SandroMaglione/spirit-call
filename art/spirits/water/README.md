# Water spirit

The water character's spirit, as the game shows it: a faceted low-poly
droplet with two glowing eyes and a floating nub. Built only from its
character sheet (`reference/sheet.png`; the other images in `reference/`
are crops of its views).

![Model beside the sheet](renders/compare.png)

Top row: the sheet's hero render and front, side, back, and top views.
Bottom row: the model, rendered the same way. At the game's camera and size:
[game-views.png](renders/game-views.png).

## From the sheet

| The sheet | The model |
| --- | --- |
| About 0.6 m tall with its nub (scale reference) | Body 0.5 m (157 of the sheet's 190 pixels), hovering 6 cm, nub on top |
| Front and side silhouettes | The body's profile measured row by row from the front view (widest a third of the way up, shoulders wide to the middle, then a taper to the tip), its depth from the side view's widest (96%); a slightly concave underside |
| Faceted planes, soft but faceted | A lathe of 12 segments, each ring turned half a segment (triangular facets), radii a few percent uneven |
| Eyes: separate emissive material, white-cyan | Tall ovals (0.045 × 0.095 m), 36° apart round its front at 29% of its height, measured from their white pixels; upright, on the body's surface; emissive white |
| Top droplet nub, same mesh look | A faceted ball (icosphere), its own object so it can bob |
| Colors: base #2E7BFF, mid #44B6FF, light #8EEBFF, highlight #E0F9FF | Each facet one flat color (vertex colors), deep blue low and away from the light, bright cyan high and toward it, a little random; a soft inner glow (each facet emits a little of its own color) |
| 100–300 triangles | 508: the body is 288, the nub 80, the eyes 140 (they can be much lighter) |

## Rebuild

```sh
blender --background --python-exit-code 1 --python art/spirits/water/build.py    # water-spirit.blend
blender --background --python-exit-code 1 --python art/spirits/water/render.py   # renders/
uv run --with pillow art/spirits/water/compare.py                                # renders/compare.png
blender --background --python-exit-code 1 --python art/spirits/water/export.py   # water-spirit.glb
```
