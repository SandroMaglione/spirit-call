# Juggernaut model review

Static model of the attached sheet for a design iteration before rigging.
The hunched back, small helmet, angular yellow eyes, broad gold-bordered
shoulders, heavy gauntlets, segmented knuckles and short legs are editable
named parts. Fine cracks, individual fingers, toes and layered armor seams
are simplified to keep the enemy within its triangle budget.

`juggernaut-model.blend` is the source. `juggernaut-model.glb` is a static
review export with 1,984 triangles and one vertex-color material. It has no
armature or clips and is not registered in the game. Parts remain separate
for design edits; joining and skinning belong to the later animation step.

The original attachment and seven view crops are in `reference/`.
`spirit.json` labels the touching parts, and `sheet.json` records their row
outlines, swatches and eye blobs. Front/back measurements supply widths;
the side views supply depths. The yellow eyes use their measured polygon
outline, mirrored and snapped above the helmet surface. Hidden neck and hip
connections join the measured shells without adding surface detail.

The sheet's size 32 is a game size, not meters. This source uses a nominal
1.4-meter scale, measured from ground to the highest rest-pose vertex.
`audit.json` and `verification.json` record the actual height, bounds,
triangle count and export hash. Future game integration must use the
existing enemy's scale rather than treating 32 as a model dimension.

Review `renders/compare.png`, `renders/overlay-all.png`, `renders/game.png`
and `renders/review-game-size.png`. The phone study contains a native
48-pixel render canvas and a nearest-neighbor enlargement. The hero camera
is selected by a scored sweep; the game render is 30 degrees above ground.

The model remains below the spirits pipeline's 90% silhouette target.
The shoulder/back mass, leg stance and hand pose still differ from the
sheet, especially in the hero view. This is an unapproved simplified model
for iteration, not a claim of an exact match. The sheet also varies the
back peak and near/far arm positions between views; orthographic contours
take priority over the more crouched hero pose. The gold gauntlet borders
are broad colored facets rather than extra raised strips.

From the repository root:

```sh
uv run --with pillow --with numpy art/enemies/juggernaut/production/sheet.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/juggernaut/production/build.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/review-tools/render.py -- juggernaut sweep
uv run --with pillow --with numpy art/enemies/review-tools/review.py juggernaut sweep
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/review-tools/render.py -- juggernaut
uv run --with pillow --with numpy art/enemies/review-tools/review.py juggernaut
node art/enemies/review-tools/verify.mjs juggernaut
```

Building replaces generated files. Preserve manual edits in a separate
Blender source or update the recipe. Rendering reads the saved model.

Open `/art/enemies/gale-juggernaut-review.html?kind=juggernaut` on the dev
server to rotate the loaded GLB and compare it with the sheet. This review
page is separate from the game.
