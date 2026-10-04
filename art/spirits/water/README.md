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

| The sheet | The model |
| --- | --- |
| About 0.6 m tall with its nub (scale reference) | Body 0.5 m (157 of the sheet's 190 pixels), hovering 6 cm, nub on top |
| A fat body, wider at the sides, with a cap curved on top | A pill (near-vertical sides from 15% to 45% of its height, rounded edges, 4% wider side to side and 8% shallower front to back) under a full, rounded cap that narrows to the tip; a slightly concave underside |
| Side view: the top curves back toward the floating drop | The cap's middle curves back (0.13 body heights at the tip), drifting slightly to one side; the nub sits on the line it points along |
| Faceted planes, soft but faceted | A lathe of 10 segments and 10 rings, each ring turned half a segment (large triangular facets), radii a few percent uneven |
| Eyes: separate emissive material, white-cyan | Tall flat oval plates, upright and facing straight out, centered on its face (34° apart) at 35% of its height; each one's front is set just in front of the surface all round its outline (cast from outside), so they never sink into facets or tilt with them: straight from the front, whole from above; emissive white |
| Top droplet nub, same mesh look | A faceted ball (icosphere), its own object so it can bob |
| Colors: base #2E7BFF, mid #44B6FF, light #8EEBFF, highlight #E0F9FF | Each facet one flat color (vertex colors), deep blue low and away from the light, bright cyan high and toward it, a little random; a soft inner glow (each facet emits a little of its own color) |
| 100–300 triangles | 368 (the nub's 80 can come down) |

## Rebuild

```sh
blender --background --python-exit-code 1 --python art/spirits/water/build.py    # water-spirit.blend
blender --background --python-exit-code 1 --python art/spirits/water/render.py   # renders/
uv run --with pillow art/spirits/water/compare.py                                # renders/compare.png
uv run --with pillow --with numpy art/spirits/water/measure.py                   # silhouette vs the sheet
blender --background --python-exit-code 1 --python art/spirits/water/export.py   # water-spirit.glb
```
