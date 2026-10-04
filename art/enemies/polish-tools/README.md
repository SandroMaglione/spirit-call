# Roster finishing pass

The animated `.blend` and `.glb` files are the finished game assets. The static
production sources remain the reference-fitting base. This pass follows their
animation recipes and deliberately changes the finished geometry for the game
camera. `rig-info.json` records the base binding; `polish-info.json` records the
finished counts, luminous vertices and joint sleeves.

Rebuild every enemy with ordinary Python:

```sh
python3 art/enemies/polish-tools/rebuild.py
```

Append enemy names to rebuild a subset. `rebuild.py` first runs its existing
family recipe, then `polish.py`. Polishing an already finished source is refused
so repeated builds cannot accumulate geometry or pose offsets. Blender defaults
to `/Applications/Blender.app/Contents/MacOS/Blender`.

Verify all source/export frames, loop seams, contact boundaries, floor clearance,
rig budgets and the single mesh/material contract:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 \
  --python art/enemies/polish-tools/verify.py -- \
  dummy sparring-dummy heavy-dummy chaser shooter brute swarmer charger sniper guardian warden stalker volatile gale-caster juggernaut
pnpm check
pnpm build
```

Open `/art/enemies/polish-tools/review.html` on the Vite server to inspect the
finished exports. It uses the actual animation atlas and crowd shader. Clip,
facing, scrubber, small-scale view and hit flash controls cover all 15 models.
Unsupported attack variants hold Idle. Models are normalized to a common height
for anatomy comparisons; in-game sizes are set by `view.enemies`.

Joint sleeves have four sides and cost eight triangles each. Their two rings
are embedded in adjoining parts and follow those parts' respective bones. This
keeps independently planted legs and moving shoulders joined, while armor stays
rigid. Existing Stalker/Volatile leg bridges remain. Scarves, ribbons and flames
retain their attached authored pivots. Guardian's sleeve endpoints also follow
the independently aimed shield through the existing shield shader transform.

`_GLOW` is a scalar vertex mask for eyes, gems, lava and fire cores. It introduces
no textures, extra lights or per-enemy meshes. The dummy and Swarmer have a zero
mask, as do the Sparring and Heavy Dummy variations. Body flashes use a separate instance attribute; multiplying white into
the palette cannot create a visible flash.

Simulation retains attack timing, telegraphs, movement, collisions and damage.
Only loop boundaries blend. Aimed attack poses snap to the simulation's facing,
and shield compensation preserves the actual blocking direction during turns.
Spawn scales the whole rig from the ground. The floor pass runs on posed meshes
and keeps living keyframes within 1 mm of the floor; Death may sink.
