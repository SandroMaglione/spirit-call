# Shooter, Brute and Swarmer review

The three attached sheets have static Blender sources and GLBs under
`art/enemies/<kind>/production/`. They were modeled in Shooter, Brute,
Swarmer order. The current game assets remain in use. No animation, rig or
game registration was added.

Open `/art/enemies/production-review.html` with the repository's network dev
server for an interactive review. It provides camera presets, rotation,
wireframe, source downloads, sheet comparisons and silhouette overlays.
`models.png` is a compact board of the saved neutral models from a 30 degree
camera. Each is framed separately, so it is not a relative arena-size check.

| Model | Triangles | Material count | Source |
| --- | ---: | ---: | --- |
| Shooter | 1,180 | 1 | `shooter/production/shooter-model.blend` |
| Brute | 1,539 | 1 | `brute/production/brute-model.blend` |
| Swarmer | 984 | 1 | `swarmer/production/swarmer-model.blend` |

Each folder has the original sheet, seven reference crops, measured region
renders, per-view overlays, the camera sweep, approximate phone-size studies,
an audit and a hash-pinned GLB verification report. The exports use meters,
Y-up and Z-forward, stand on the ground origin and have vertex colors. A
fresh Blender import preserves their mesh names and world bounds.

The sheets disagree in places. Shooter's side mouth sits higher than its
front mouth. Brute's sides and hero raise its fists while its front/back
lower them. Swarmer's hero has different proportions from its orthographic
views. Each model's notes state which view defines a shape and all overlap
scores remain in `renders/overlap.json`. Several scores are below the spirit
pipeline's 90% target. These are review candidates, not approved matches.

The separate art page was exercised on the network address at 1280x800 and
390x844. All three GLBs loaded with one shared material and zero clips.
Synthetic touch pointer events rotated the phone-sized view; this is not
physical-device or live gameplay evidence. An existing dev server stopped
during inspection; a restarted server restored all model and image loads.

Typecheck and lint passed. The standard `pnpm check` completed all 369 tests
once, but on other runs its 40-second deterministic replay exceeded the
existing five-second test timeout under concurrent machine load. That test
passed in isolation. The final test run uses one worker and is recorded in
`validation.json`. No simulation or test files were changed for these models.

After review, the meshes need rigid skinning, simulation-timed clips and
single-mesh exports for the existing enemy animation atlas before game use.
