# Guardian model review

Static model from the supplied Guardian sheet, before rigging, animation,
or game registration. `guardian-model.blend` keeps editable named parts;
`guardian-model.glb` is a static review export with one shared vertex-color
material. It is not yet a crowd-ready skinned asset.

The preserved sheet and seven crops live in `reference/`. `spirit.json`
labels their parts in source pixels. `sheet.py` measures contours, eye cores,
and swatches into `sheet.json`; `build.py` lofts the armor and builds the
plank shield with its frame, grip, and raised diamond boss. The mace has a
round faceted core and twelve equal spikes, spaced on a regular icosahedron.
Small bevels and fingers are reduced.

Both labeled side views show much of the shield's front, so they are turned
views rather than strict side projections. Their camera sweep searches nearer
the front. The back view supplies leg widths where the front shield occludes
them. Eyes and the visor are snapped onto the helmet surface. The shield
parts remain separate for a later shield bone; no shield animation is baked
into this model.

The breastplate, helmet and gold crest are centered on the body axis. The
crest's facet colors are mirrored, and each shoulder blade and gold cap is
built once and mirrored as a whole. Elbow trim uses the same mirrored pair.
`renders/armor-front.png` exposes both shoulder caps in a true front view,
with the shield and mace hidden only in that review render.
`renders/weapon.png` shows the round mace and its uniform spike pattern.
The GLB audit checks detail symmetry, equal ball diameters, spike lengths,
and nearest-neighbor angles.

From the repository root, follow the commands in the Sniper README with
`guardian` substituted for `sniper`. Review `renders/compare.png`,
`renders/overlay-all.png`, and the game-camera images. `renders/overlap.json`
records every silhouette score against the 90% target, including misses.
`audit.json` records geometry and rest height; `verification.json` checks the
static GLB through Three.js. The shared `art/enemies/sheet-tools/review.html`
page loads the GLB without changing the game.
