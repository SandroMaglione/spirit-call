# Enemy model and animation tools

These tools adapt the measured spirit workflow to pale enemy sheets with
several touching materials. Static review files stay in Shooter, Brute and
Swarmer's `production/` folders. Approved animated copies live separately
in `production/animated/`, with generated runtime specs in
`src/presentation/assets/enemies/`.

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
the game entry point imports only the approved animated copies.

`review/refinements.png` compares the initial Brute face and Swarmer side
profile with their revisions. `refinement-board.py` rebuilds this board
from the preserved before renders and current saved-model renders.

The static exports intentionally have no skeleton. After model approval,
`animate-approved.py` reads the saved source, asserts that joining its parts
preserves every rest vertex, and creates one rigidly weighted mesh with
one material. It reuses the existing enemy action writer, keeps the root
stationary and generates the runtime spec directly from the exported file.
Run each kind in order:

```sh
blender --background --python-exit-code 1 --python art/enemies/production-tools/animate-approved.py -- shooter build-export
blender --background --python-exit-code 1 --python art/enemies/production-tools/verify-approved-animation.py -- shooter
blender --background --python-exit-code 1 --python art/enemies/production-tools/render-approved-animation.py -- shooter
```

Replace `shooter` with `brute` or `swarmer` for the other saved sources.
Verification compares every exported frame in a fresh import, checks the
unchanged rest bounds and height, floor clearance, closed loops and the
windup/contact/recovery endpoints. Runtime atlas skinning is independently
covered by `test/enemy-assets.test.ts`. Attack-specific phase clips belong
to the enemy look, with simulation timings still determining their progress.

## In-game verification

`review/in-game-desktop.png` and `review/in-game-phone.png` show the approved
models in the game. `review/in-game-verification.json` records loaded URLs,
mesh budgets, atlas clips, observed attack phases and the 300-enemy mixed
load. Each of the three models keeps one instanced body draw call, one
material and no per-enemy skeleton in the live scene.

The phone layout was checked at 390×844: synthetic touch moved the player,
and the mouse-driven touch dash and team buttons worked. Review enemies
were positioned and held still in that browser session to compare their
sizes; no gameplay content or movement rule was changed.

In the original shared checkout, typecheck, lint, export verification,
skinning checks and the production build passed. Its full 372-test suite
passed with one worker and a 20-second
timeout. The default parallel `pnpm check` run hits the existing five-second
replay/fairness timeouts under concurrent machine load. Test configuration
is unchanged. These browser checks do not measure a physical phone.

For publication, the seven model and integration commits were isolated in
`art/shooter-brute-swarmer`, based on `origin/main` at `e47184a`. The shared
checkout and other agents' changes were preserved. A scope audit and
range-diff confirmed only these models, their tools and review evidence,
and their presentation wiring were carried over. The approved sources and
exports are byte-for-byte unchanged. All three Blender export checks pass
again; the isolated branch passes default `pnpm check` (400 tests in 50
files) and `pnpm build`. A fresh network preview loads all three animated
models with one body draw call each, and synthetic touch movement works
at 390×844.
