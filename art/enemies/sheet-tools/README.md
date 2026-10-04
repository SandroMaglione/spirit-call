# Static enemy sheet pipeline

The three attached sheets are kept beside their editable models under
`art/enemies/{charger,sniper,guardian}/production/`. Firebomber uses the
permanent content id `charger`. The approved static files remain editable;
rigged copies under each `production/animated/` folder are used by the game.

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
| `animate-approved.py` | Rigidly skins approved parts, writes clips, exports and registers the GLB |
| `verify-approved-animation.py` | Checks every clip, phase contacts, rest geometry, floor clearance and GLB round trips |
| `render-approved-animation.py` | Renders saved attack and locomotion poses from the game camera |

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
- `env VITEST_MAX_WORKERS=2 pnpm check` passes typecheck, lint, and all 372
  tests in 48 files. The default worker count timed out in the existing
  40-second simulation replay test during concurrent rendering; limiting
  workers leaves its 5-second test timeout unchanged.
- The silhouette overlays remain below the 90% target. Sniper needs the
  closest designer review because its front and hero illustrations differ
  most from the standing side views.

The face revision replaces round front eyes with angry angular apertures.
One eye is built against the face and mirrored, including its surface
vertices and colors. Guardian's helmet is centered before its visor and
eyes are added. Sniper keeps circular side lens rims with sloped lids on
the exposed crest armor. Surface patches clip the actual body facets to
avoid intersections and gaps across the face.

Firebomber's held bomb uses its measured front diameter in all three axes.
The occluded side drawing no longer flattens it. Its fuse has a collar,
raised lip and wick, and the shell has separate ember patches and a pale
core. `verify.mjs` checks exported eye symmetry within one micrometer and
equal bomb diameters. `review-faces.png` collects the new closeups.

## Approved animation and integration

Run these after approving the static model, substituting `sniper` or `guardian`
for `charger`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/sheet-tools/animate-approved.py -- charger build-export
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/sheet-tools/verify-approved-animation.py -- charger
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/sheet-tools/render-approved-animation.py -- charger
```

`build-export` replaces the animated copy, preserving every approved rest vertex.
`export` alone reads the saved animated Blender source, so manual action edits
can be exported without rebuilding the rig. Export and registration reuse the
existing crowd-ready exporter. The export spec is generated from actual bounds
and clip metadata. Animated assets contain one mesh, one vertex-color material,
one armature, and a single rigid weight per vertex.

Firebomber uses nine bones, Sniper and Guardian seven. The default combat phases
are bomb throw, sniper shot, and Guardian mace swing. Firebomber's `Swipe` and
Guardian's `Thrust` variants are selected by attack id in `looks.ts`. All phase
contacts are continuous, including zero-duration ranged active phases. The held
bomb shrinks out at release and returns during recovery; the projectile remains
simulation-owned. Guardian's root-level `shield` bone keeps the shield and its
gripping hand facing independently through the existing animation atlas shader.

`Idle`, `Run`, `Hurt`, and `Spawn` complete the living lifecycle. `Death` is
included for the asset contract; killed enemies use the game's instant particle
burst. All actions stay in place. Animation adds no movement or hit windows.

`animated-in-game-verification.json` records the loaded assets, every combat
variant, shield angle, hit/death feedback, synthetic touch movement/dash/team
switching, and the 305-enemy / 2,000-projectile mixed stress scene. Network
browser captures are `in-game-desktop.png`, `in-game-phone.png`, and
`in-game-crowd.png`. QA advances the live runtime's fixed and presentation
schedules to inspect phases; it does not measure physical-phone performance.
`env VITEST_MAX_WORKERS=2 pnpm check` passes all 374 tests, typecheck and lint;
`pnpm build` bundles the registered animated exports.

For playable review of only these enemies, open the game with
`?play&challenge=practice&practice=charger,sniper,guardian&team=tidecaller,gunner,swordsman&level=20&enemyLevel=1&touch`.
The existing Enemy Practice mode keeps its field populated and respawns each
enemy after a kill. The URL supplies its picks; no new challenge or content id
is added. The higher player level gives time to inspect attacks and switch kits.
