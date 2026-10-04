# Gale Caster model review

Static model of the attached sheet, ready for a design iteration before rigging.
The pointed ivory hood, dark face, cyan eyes, mint mantle and four scarf tails,
split robe, gold binding, chest emblem and ring staff are editable named parts.
Tiny cuffs, fingers, cloth pleats and staff carvings are simplified.

The source is `gale-caster-model.blend`. `gale-caster-model.glb` is a portable
static review export with one vertex-color material and 1,950 triangles.
It has no skeleton or animation and is not registered in the game. Keep the
separate parts during design review; joining and skinning for the enemy batch
belongs to the later rigging step.

`reference/sheet.png` preserves the original attachment. `spirit.json` labels
the crops and touching surfaces; `sheet.json` contains measured row outlines,
eye blobs and sampled swatches. Geometry comes from the measured front/back
widths and side depths. Hidden scarf roots continue into the measured mantle.
The sheet gives game size 18, not a meter height; this source uses a nominal
one-meter body scale. Future integration must use the enemy's existing scale.

Review `renders/compare.png`, `renders/overlay-all.png`, `renders/game.png`
and `renders/review-game-size.png`. The last includes a native 32-pixel render
canvas and a nearest-neighbor enlargement, without runtime glow. The hero
camera comes from a scored sweep; the game render uses 30 degrees elevation.

The overlap report deliberately retains every view. This simplified pass has
not reached the spirits pipeline's 90% silhouette target. Its model shape and
cloth pose still differ from the drawing and need the designer's review.
The reference also conflicts between views: the front's lower hanging panels
are ivory while the back shows four mint scarf tails, and the staff ring is
face-on in both front and side views. This model uses four mint tails from the
back and a fixed ring facing forward. The hood face is a dark faceted panel
instead of a detailed hollow hood. These choices are easy to revise in the
source before animation.

The face revision centers the hood on X = 0 and mirrors its facet colors.
The continuous ivory lip, dark cheek planes, shaped cyan eyes and pale eye
cores are editable mirrored pairs. `verification.json` checks exported
positions and colors within one micrometer. `renders/face-front.png` and
`renders/face-three-quarter.png` show the revision; the `-before` images
preserve the preceding model under the same camera and lighting.

From the repository root, use Blender 4.5 LTS and `uv`:

```sh
uv run --with pillow --with numpy art/enemies/gale-caster/production/sheet.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/gale-caster/production/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/review-tools/render.py -- gale-caster sweep
uv run --with pillow --with numpy art/enemies/review-tools/review.py gale-caster sweep
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/review-tools/render.py -- gale-caster
uv run --with pillow --with numpy art/enemies/review-tools/review.py gale-caster
node art/enemies/review-tools/verify.mjs gale-caster
```

`build.py` replaces generated models; manual design edits should be made in
the recipe or preserved in a separate Blender file. Rendering only reads the
saved source. `verification.json` records the Three.js loader checks and hash.

Open `/art/enemies/gale-juggernaut-review.html` on the network dev server
for the 3D review controls and downloadable source files.
