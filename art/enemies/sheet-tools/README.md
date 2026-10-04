# Static enemy sheet pipeline

The three attached sheets are kept beside their editable models under
`art/enemies/{charger,sniper,guardian}/production/`. Firebomber uses the
permanent content id `charger`. These folders stop at model review, before
rigging, clips, glow, or registration in the game.

The pipeline follows `docs/spirits.md` for labeled crops, pixel measurements,
lofted sections, mirrored face features, facet colors, camera sweeps,
silhouette overlays, and game-camera renders. Enemy armor and props use
separate measured parts rather than one spirit's continuous body.

| File | Purpose |
| --- | --- |
| `prepare.py` | Preserves a sheet and writes the pixel-region config |
| `measure.py` | Crops views, measures colored row contours and swatches |
| `geometry.py` | Builds faceted geometry and static Blender/GLB exports |
| `render.py` | Renders saved sources, including camera candidates |
| `review.py` | Scores silhouettes and writes overlays and comparisons |
| `verify.mjs` | Checks the GLB with Three.js, axes, bounds, and triangle count |
| `review.html` | Loads static GLBs for rotation and model review |

The shared geometry and measurement helpers started from the local static
enemy production tools; this directory keeps the three supplied sheets'
work independent of the existing Chaser and Shooter work.

Run the existing network dev server or `pnpm dev --host --port 5199`, then
open `/art/enemies/sheet-tools/review.html`. The viewer is an art review page;
the game does not import it or these static exports.

All export audits require fewer than 2,000 triangles, one shared material,
no clips or skeleton, and a ground origin. The static export retains named
parts for editing. Joining and skinning for the enemy animation batch happens
after model review. The 90% silhouette threshold is a target, not a claim
that every supplied drawing can be matched by one pose. Scores for every
view and fitted camera angles are preserved beside the renders.

Camera fitting searches turn and elevation only. Overlay normalization uses
one uniform scale and centers the full silhouette. It never stretches the
mesh or independently resizes its width. The game-camera render is separate
from fitted sheet cameras and always uses a 30-degree elevation.

Validation of this review stage:

- All three static GLBs pass `verify.mjs` through Three.js.
- The network viewer loads each model at 1280 x 800 and 390 x 844 without
  horizontal overflow. A synthetic touch pointer drag changes the orbit.
  `browser-verification.json` records the observations. No physical phone
  performance test was performed.
- `env VITEST_MAX_WORKERS=2 pnpm check` passes typecheck, lint, and all 369
  tests in 48 files. The default worker count timed out in the existing
  40-second simulation replay test during concurrent rendering; limiting
  workers leaves its 5-second test timeout unchanged.
- The silhouette overlays remain below the 90% target. Sniper needs the
  closest designer review because its front and hero illustrations differ
  most from the standing side views.
