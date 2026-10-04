# Gale Caster and Juggernaut integration

The enemy content was confirmed on fetched `origin/main` at `e47184a`.
The branch was then rebased onto `9db5719`, preserving the other agents'
Chaser, Shooter, Brute and Swarmer integrations and reusing their shared
attack-clip selection. It replaces the two capsule looks with approved models and adds
animation. The work lives in a separate worktree; the other agents' changes
in the original checkout were not edited or included.

The static sources and face revisions remain separate from the animated
copies in each enemy's `production/animated/` folder. Rigging preserves their
rest vertices and facet colors. Gale Caster has 1,950 triangles and nine
bones; Juggernaut has 1,995 triangles and seven bones. Each export has one
mesh, one vertex-color material and one bone influence per vertex.

The existing content determines the moves: Gale Caster casts its gust;
Juggernaut uses a sweep and a quake. The quake raises both fists and has
distinct windup, active and recovery clips selected in `looks.ts`. Their
poses follow simulation phase progress, including short active phases.
Locomotion, spawn, hurt and death clips are also exported. All clips keep
the root fixed. Gameplay continues to own movement, damage and hitboxes.

Both enemies use the existing baked animation atlas and instance batches.
The existing death effects remove the body immediately; the exported Death
clip does not delay despawning. Practice respawns join the same batches.

Validation on 2026-10-04:

- `pnpm check`: typecheck, lint and all 403 tests passed after rebasing. The existing asset
  tests now audit both exports and compare baked poses against Three.js skinning.
- `pnpm build`: passed, including both GLBs in the production bundle.
- Blender reimport matched every sampled animation frame within 0.00000024
  meters. Phase endpoints match exactly, loops close and the root stays fixed.
  Each animated folder contains the source hash, rig bindings and audit.
- Network preview at `http://192.168.40.47:5207/`: selected both enemies in
  Extra → Enemy Practice. Desktop 1280 × 800 and phone 390 × 844 layouts were
  inspected. Synthetic touch events moved the player and spent a dash charge.
- After rebasing, both models and all attack phases were exercised again in
  the network preview; the four other agents' model registrations loaded too.
- All nine attack phases were exercised. A further 720 fixed steps in the
  running browser checked 1,743 sampled phase cursors against the actual
  atlas instances, with zero error.
- Each live body has one instance and no separate mesh. Killing one of each
  changed batch sizes from three each to two each; practice restored three
  each with new entity IDs. The player was made immortal only in the browser
  session for observation. Physical phone performance was not measured.

To reproduce from the repository root with Blender 4.5 LTS:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/review-tools/animate.py -- gale-caster
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/review-tools/animate.py -- juggernaut
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/review-tools/verify-animation.py -- gale-caster juggernaut
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/review-tools/render-animation.py -- gale-caster
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/enemies/review-tools/render-animation.py -- juggernaut
pnpm check
pnpm build
```

Animation generation rebuilds the animated copies from the approved static
sources. To preserve manual animation edits, save them separately or update
the animation recipe. `animate.py -- <enemy> export` exports the saved animated
source without regenerating its rig or poses.
