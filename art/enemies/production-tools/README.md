# Static enemy review tools

These tools adapt the measured spirit workflow to pale enemy sheets with
several touching materials. They write only the new Shooter, Brute and
Swarmer `production/` folders. The existing animated assets and game looks
stay in use until the models have been reviewed.

`prepare.py` preserves the input sheet, crops the views without rescaling,
and writes the pixel region labels to `spirit.json`. `measure.py` extracts
each labeled surface's row contours, eye blobs and swatch colors into
`sheet.json`. `geometry.py` lofts those contours, projects eyes and visor
patches onto actual facets, builds hollow mouths and exports static GLBs.
The named parts remain separate and editable for review.

`render.py` reads the saved Blender source. Its orthographic directions,
hero camera sweep and 30 degree game camera follow the spirit tools.
`review.py` uses the spirit overlay method of height normalization and
silhouette intersection over union. RGBA render masks replace the spirit
tools' single-color masks so eyes, bone, dark feet and rock are all scored.
On the light sheets, small heading letters and detached shadow specks are
removed by connected-component size. This is a foreground approximation;
measurement-region renders and overlays keep errors visible.

`verify.py` checks one shared material, vertex colors, the triangle budget,
and the absence of animations, skins, cameras, lights and decoder extensions.
It imports each GLB into a fresh Blender scene and compares mesh names and
world bounds with the saved source. It writes a hash-pinned report beside
each export. Run it after rebuilding a model:

```sh
blender --background --python-exit-code 1 --python art/enemies/production-tools/verify.py -- shooter brute swarmer
```

For an interactive review, run `pnpm dev --host --port 5199` and open
`/art/enemies/production-review.html` on the network address. It loads the
static GLBs with Three.js, provides camera presets and orbit controls, and
links each source, reference and overlay. It is a separate art review page;
the game entry point does not import it or any of these models.

The exports intentionally have no skeleton. After model review, the separate
parts must become one mesh with rigid weights and simulation-timed clips
before registration in the existing enemy animation atlas and batches.
