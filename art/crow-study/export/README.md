# Animated crow handoff

Runtime asset: [`crow-animated.glb`](crow-animated.glb).
Dimensions and clip timing: [`model-info.json`](model-info.json), under
`animated_export`. The top-level geometry fields still describe the static study.
The exporter writes identical copies of both files one directory up, preserving
the requested `art/crow-study/crow-animated.glb` path. Copy this export folder
for the renderer handoff; do not edit the generated copies independently.

Rebuild and verify from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python art/crow-study/export/export-glb.py
```

This reads the committed `crow-animated.blend`, without changing either Blender
source, and calls `attack.py` to add the Attack study in memory. Append
`-- --locomotion-only` to export just Idle and Run. To rebuild the base rig
first, run `animate.py`; it reads `crow.blend`, so
check for intentional local edits before regenerating it.

The GLB uses meters, +Y up and +Z forward. Its origin is on the ground between
the feet. The recorded height is the rest-pose height, not the changing bounds
of a breathing or running pose. The export combines the editable parts into
one mesh with seven material primitives and one armature. It embeds the palette
PNG and uses Principled materials, with emission disabled. No Studio objects,
cameras, lights, constraints, or external texture files are required at runtime.
The leg IK is baked to joint transforms. No Draco or other decoder is required.

Open `/art/crow-study/export/` on the dev server for the Three.js GLB inspector.
It loads Three.js 0.186.1 from jsDelivr, so the inspection page needs internet.
The GLB and loop helper themselves have no CDN dependency. Orbit by dragging,
select Idle/Run/Attack, slow playback, or scrub through the poses. The grid and
lights are added by the viewer and are not part of the GLB.

## Attack study

`Attack` is a single unarmed side slash, 17 samples over 2/3 second at 24 fps.
It winds the torso up, sweeps the right wing across the body, follows through,
and returns to Idle's first pose. Both feet stay planted and the root stays
fixed. It is a pose test on the existing 12-bone rig, not a finished sword
animation: no weapon or grip socket is included. Its pose markers are recorded
in the metadata for inspection, not as approved damage-window timings.

Play this clip with `LoopOnce` and `clampWhenFinished`, then transition back to
locomotion. `prepareCrowClips` leaves its timing untouched. Gameplay integration
should define hit windows and interruptions in the simulation before connecting
this clip. The game now uses the armed export in `../combat/` instead.

## Loop timing

Idle exports source frames 1–48; Run exports 1–12, at 24 fps. Keys begin at time
zero. Their final sample times are 47/24 and 11/24 seconds. The source's closing
keys at frames 49 and 13 are excluded, as requested.

glTF has no cyclic sampler or separate loop-duration field. A default Three.js
clip therefore ends at its last sample and skips the final interpolation interval.
Use `prepareCrowClips` to append the first pose at exactly 2.0 / 0.5 seconds in
memory. This restores that interval without a duplicate-frame pause. Merely
setting `clip.duration` would hold the final pose and is not sufficient.

```js
import { prepareCrowClips } from './prepare-clips.mjs';

const gltf = await loader.loadAsync('/art/crow-study/crow-animated.glb');
const info = await fetch('/art/crow-study/model-info.json').then(r => r.json());
const clips = prepareCrowClips(gltf.animations, info.animated_export);
const mixer = new THREE.AnimationMixer(gltf.scene);
mixer.clipAction(clips.find(clip => clip.name === 'Idle')).play();
```

Advance the mixer with the game's animation clock, respecting hit-stop. The
root stays fixed; the game supplies displacement. Scale the loaded scene using
the recorded height instead of guessing Blender units. Direction +Z means
`rotation.y = Math.atan2(direction.x, direction.z)` for an XZ ground plane.

`verification.json` is generated only after a successful fresh Blender import.
The exporter checks the byte budget, embedded texture, clip sample counts,
normalized weights with at most four influences, stationary root, source loop
closure, rest bounds, and animated bounds at every exported frame.

For a Three.js check, open the inspector and run this in its console:

```js
await (await import('./verify-three.mjs')).verifyCrow(crowPreview)
```

It checks actual skinned vertices, bone weights, root motion, motion in all
clips, loop-boundary continuity, and Attack's recovery pose. It stops playback
to sample deterministically; reload afterwards. Seven glTF material primitives
become seven Three.js SkinnedMeshes sharing the skeleton, not seven armatures.
