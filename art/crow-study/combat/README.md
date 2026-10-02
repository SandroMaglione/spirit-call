# Armed crow motion study

Local asset review for the sword character. Open `/art/crow-study/combat/`
on the Vite dev server (`pnpm dev --host --port 5199`). The inspector uses
Three.js 0.186.1 from jsDelivr, so the first load needs internet access.
The game loads these files directly (`src/presentation/assets/crow.ts`).

Choose Training Blade or Crescendo while any animation plays. Both are
separate rigid GLBs attached to the same `weapon_grip` bone, with no
weapon-specific character animation export. The two swords intentionally
share grip position and blade length. A different weapon class or grip
would need a different moveset or attachment contract.

## Review

- **Idle:** armed guard, breathing and weight shift.
- **Run:** 16 samples at 30 fps, forward lean, compressed contact, toe
  push-off, flight and trailing sword. Moving ground shows the authored
  stride; the game will set playback rate from its movement speed.
- **AttackCombo:** one continuous 2.2-second action: opening diagonal cut,
  rising backhand, driving thrust, then a full-turn finisher and recovery.
- **RunStart / RunStop:** transitions from/to the first run contact pose.
- **Recover1 / Recover2 / Recover3:** stop the combo at its first three
  section boundaries and return to guard.

Use quarter speed and the scrubber to inspect anticipation, contact and
follow-through. The individual hit buttons isolate ranges of the same
combo clip. Blade path traces the equipped weapon's tip. Game camera and
Phone-size character help judge silhouette; they are approximate review
views, not a renderer integration or a performance test on a physical phone.

## Rebuild

From the repository root, with Blender 4.5 LTS:

```sh
blender --background --python-exit-code 1 --python art/crow-study/combat/build.py
blender --background --python-exit-code 1 --python art/crow-study/combat/export.py
```

On macOS, replace `blender` with
`/Applications/Blender.app/Contents/MacOS/Blender` if it is not on PATH.

`build.py` reads the previous `crow-animated.blend`, upgrades the wing and
hip rig, and writes **`../crow-combat.blend`**. It does not rebuild or
overwrite `crow.blend` or `crow-animated.blend`. The editable combat file
contains all eight actions and the two weapon collections. Training Blade
is bone-parented for posing; Crescendo is parked alongside it.

`export.py` writes:

| File | Purpose |
| --- | --- |
| `crow-combat.glb` | Character, one 20-bone skeleton, eight actions |
| `training-blade.glb` | Straight steel sword |
| `crescendo.glb` | Curved blue-steel sword with brass guard |
| `model-info.json` | Dimensions, axes, clip durations, combo sections |
| `verification.json` | Export sizes, weights, ground and fresh-import bounds |

Only character/weapon meshes, their hierarchy and materials are exported.
No studio, camera, light or ground enters the GLBs. Materials use Principled
BSDF colors. Character budget is below 500,000 bytes; weapons below 100,000
bytes each. Weights are normalized with at most four influences.

## Three.js handoff

Character units are meters, Y-up, facing +Z, with ground at Y=0 and a
stationary root. The reference height is recorded in `model-info.json`;
scale the actor container to the game's chosen world dimensions.

```js
const crow = await loader.loadAsync('crow-combat.glb');
const sword = await loader.loadAsync('training-blade.glb');
crow.scene.getObjectByName('weapon_grip').add(sword.scene);
const clips = prepareCrowClips(crow.animations, metadata);
```

Use `prepareCrowClips` from `../export/prepare-clips.mjs`. Loop exports omit
the duplicate closing key; this helper restores the final interpolation
interval in memory. Idle exports 1–60 and Run 1–16 at 30 fps. Their periods
are 2.0 and 0.533333 seconds, rather than the last key's timestamp. The other
actions are non-looping and include their final pose.

Weapon local +Y points along the blade, +Z is the blade face, and origin
is the grip center. Attach the whole loaded scene with identity local
transform. Marker nodes are `<weaponId>_blade_base` and
`<weaponId>_blade_tip`. No additional weapon rotation is required.

`model-info.json.combo` partitions the continuous clip into four sections
with proposed active windows and recovery clip names. The runtime can play
one range per accepted input and continue across the boundary when another
attack is queued. Stopping at a section end uses its recovery clip. A dash
cancel between these boundaries needs a runtime crossfade/cancel policy.
Hit windows here are art metadata, not authority for simulation damage.

Root displacement, lunge distance, hit-stop, damage, input buffering and
cancel rules stay game-owned. RunStart/RunStop only match phase zero exactly;
blend from another gait phase rather than snapping to these clips. Set run
playback rate to `speed / (scale * stride / loopDuration)`, using
`run_stride_meters` from metadata. This inspector changes no gameplay rules.

## Verification

The exporter checks weights, ground, stationary root, loop seam, GLB contents,
budgets and all sampled bounds after importing into a clean Blender scene.
For the browser-side check, run this in the inspector console:

```js
await (await import('./verify-three.mjs')).verifyCombat(combatPreview)
```

It samples deformed vertices, loops, transition endpoints and both equipped
swords through all clips, including grip attachment and ground clearance.
It stops playback; reload afterwards. Neither test replaces visual review
of pose quality, blade/body intersections or final game-scale readability.
