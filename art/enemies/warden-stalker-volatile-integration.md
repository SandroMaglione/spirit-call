# Warden, Stalker and Volatile game integration

The three approved models replace their existing capsules. This branch starts
from `origin/main` at `9db5719` and was rebased onto current `main`, retaining
the Gale Caster and Juggernaut models, animation blending and arena dressing. The enemy
definitions and mechanics already exist there. No content ids, stats, elemental affinities, hitboxes, attacks,
movement, or challenge waves change.

The approved static sources and review GLBs remain in each enemy's
`production/` folder. Its `animated/` folder holds the editable rig, game GLB,
clip and binding metadata, frame verification, and game-camera pose renders.
`model-tools/animate.py` rigs the saved static sources without rebuilding
their geometry. The rest-vertex error is below 0.000001 meters.

| Enemy | Triangles | Bones | Meshes / materials | Clips |
| --- | ---: | ---: | --- | --- |
| Warden | 1,775 | 10 | 1 / 1 | Eight lifecycle clips and Buff |
| Stalker | 1,860 | 7 | 1 / 1 | Eight lifecycle clips and three Blink phase clips |
| Volatile | 1,768 | 5 | 1 / 1 | Eight lifecycle clips |

`src/presentation/assets/enemies.ts` registers the generated modules, and
`looks.ts` selects their shared enemy batches. Clips have no root motion:
windup, active and recovery poses follow the simulation's phase durations.
Stalker's blink uses its own phase clips; slash uses the standard set.
Its connecting joint rings follow the armor pieces at both endpoints.
Warden's staff stays bound to its hand, and four ribbon bones provide cloth
motion. Its Buff pose follows `Ward.formed / WardSpec.link` and holds while
linked; attack poses take priority and stun prevents the ward pose.
Volatile's face remains part of the body's rig, preserving the approved
mirrored eyes and recessed sockets while its feet bounce and flame sways.

## Stronger motion revision

Locomotion now commits the body into its travel direction. Warden pitches
forward into a glide, counters with its head and staff, and trails its four
ribbons. Stalker leans into a low, long stride with its blades carried clear
of the floor and its head aimed ahead. Volatile rocks forward over short,
alternating steps with a compact bounce and a trailing flame. The planted
half of each foot cycle travels backward under the moving body; the lifted
half returns forward. Foot orientation and ground height compensate for
the body lean, keeping Stalker's stance and Volatile's stubby proportions.

Attacks build into a larger anticipation pose, hold it through the warning,
then snap into contact over the final fifth of the windup. Warden retracts
the staff and leans back before driving the orb forward with a torso twist;
its cloth carries the release through recovery. Stalker coils one blade
high and outside, then cuts across its body while the other blade guards.
Its blink has a separate crouch, forward leap pose and landing settle.
Volatile compresses and rocks back before a pronounced forward headbutt,
with the flame lagging behind the impact. Active clips now finish the
Stalker and Volatile swings, and recovery starts on that follow-through.
Warden's zero-duration active phase instead starts recovery at release.

The shared root remains stationary in every sampled frame, and the
approved geometry and rig budgets are preserved. The pose board shows
stride, anticipation, contact and follow-through for all three enemies.
The viewer also plays complete attacks at the simulation's current timing
and allows scrubbing; individual clips remain available for source review.

Death follows the current game rule: the live body disappears with the
existing colored burst. Volatile then leaves the existing 0.75-second fuse
warning and explodes. Death clips are retained in the sources but do not
override that behavior. Spawn and Hurt use the existing presentation path.

## Review

Run `pnpm dev --host --port 5221` from this worktree.

- 3D animation viewer: `/art/enemies/warden-stalker-volatile-review.html?animated`
  (choose an enemy and clip; orbit, zoom, wireframe, or pause).
- Game: `/?play&challenge=strangeCompany&touch`.
- Crowd validation: `/?stress=300,2000,mixed&challenge=strangeCompany&touch`.
- Pose board: `warden-stalker-volatile-animation.png`.

The same pages are reachable from a phone on the Mac's network address.

## Validation

- `pnpm check`: the complete suite passes, including every enemy animation atlas,
  phase timing, ward formation/hold/cut/stun/attack priority, rendering
  cleanup, and the existing simulation fairness and burst tests.
- `pnpm build`: passes; emits all three game GLBs. Vite retains the existing
  warning about the main JavaScript chunk exceeding 500 kB.
- Blender source/GLB round trips pass for all clips: one mesh/material,
  under 2,000 triangles, at most 12 bones, preserved approved rest bounds,
  stationary root, closed loops, and matching contact poses. Detailed
  measurements are in each `animated/verification.json`.
- Network browser review uses the 30-degree game camera and a 390 x 844
  viewport. Touch-pointer movement moves the player and selects touch HUD.
  Stalker's blink and slash phases, Warden's fully formed ward/Buff pose,
  and Volatile's body cleanup, fuse warning and explosion were exercised.
- The stronger-motion revision was also reviewed in a local Chromium
  browser at the network address after the shared browser disconnected.
  All three full attack sequences and the separate blink sequence pass
  the viewer's phase checks. An 844 x 390 mobile touch viewport runs the
  mixed crowd with advancing animation-atlas poses and all attack phases;
  a touch stick gesture moves the player 61.7 world units. No browser
  errors were recorded. Portrait mobile view shows the existing rotation
  prompt, so the playable phone review uses landscape.
- The mixed crowd page held 300 injected enemies plus five training dummies
  and 2,000 projectiles. Warden, Stalker and Volatile each had 20 live copies
  in one animation batch. Its browser console had no errors or warnings.

The browser review is on this Mac, not a physical-phone performance test.
The work was developed and validated in the isolated
`art/warden-stalker-volatile-game` branch and worktree.
