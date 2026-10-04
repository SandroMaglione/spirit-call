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

Motion revision on 2026-10-04:

Gale Caster now floats through a 2.4-second cycle with 0.20 meters of vertical
travel in the source model. Idle and movement share that clock, so backing
away does not reverse the hover. Its gust has a deeper pullback, a 30-degree
forward lean at release, and wider scarf motion. The staff and hand stay
bound together.

Juggernaut's stride covers 90 world units instead of 60. Each foot stays
planted for 62 percent of its cycle, then lifts up to 0.11 meters. The torso
settles into each step and the arms counter-swing. Sweep and quake build up
with a held charge, then lean forward through the strike. Quake raises both
fists before bringing them down; the head counters the torso lean to keep
the face visible.

The curves ease through their endpoints. Longer loops have more baked
samples. These two enemies also opt into short pose blends at locomotion
boundaries: 0.18 seconds for Gale Caster and 0.14 seconds for Juggernaut.
The shader blends shared atlas poses in the existing instance batch.
Windup, active and recovery contacts remain exact; hit-stop and stun freeze
the blend. Other enemies keep their existing playback settings.

The approved static sources, geometry budgets and simulation content are
unchanged. Both updated exports passed Blender reimport, loop closure,
fixed-root, ground and phase-contact audits. The largest reimport error was
0.00000036 meters. `pnpm check` passed typecheck, lint and all 407 tests;
`pnpm build` passed. Four new tests cover transitions, freezing, exact
contacts and the hover clock when reversing direction.

The network browser exercised the revised attacks and compiled both atlas
shaders. Twelve observed active-phase samples all had a completed blend.
A desktop gameplay recording was saved for review. The 390 by 844 viewport
also accepted synthetic touch movement and a dash, spending one charge.
The preview host disconnected during the final phone recording, so that
recording could not be retrieved. Physical phone performance was not measured.
