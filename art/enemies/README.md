# Enemy models

The complete roster has fifteen content kinds: twelve combat enemies and three
training targets. Each has a distinct batched animated model. Editable Blender
sources, GLBs, metadata and audits live beside the corresponding recipes.

| Content ID | Finished source | Triangles / bones |
|---|---|---|
| dummy | [Wooden target](dummy/) | 740 / 3 |
| sparringDummy | [Padded target with a striking arm](sparring-dummy/) | 928 / 4 |
| heavyDummy | [Reinforced target](heavy-dummy/) | 1,064 / 3 |
| chaser | [Hook creature](chaser/production/) | 1,950 / 12 |
| shooter | [Bell-mouth creature](shooter/production/) | 1,244 / 8 |
| brute | [Stone heavyweight](brute/production/) | 1,652 / 7 |
| swarmer | [Red-shell pest](swarmer/production/) | 1,016 / 7 |
| charger | [Firebomber](charger/production/) | 1,954 / 9 |
| sniper | [Precision shooter](sniper/production/) | 1,448 / 11 |
| guardian | [Shield and mace guard](guardian/production/) | 1,974 / 7 |
| warden | [Staff and ward caster](warden/production/) | 1,807 / 10 |
| stalker | [Hooded blade hunter](stalker/production/) | 1,884 / 7 |
| volatile | [Cracked lava creature](volatile/production/) | 1,768 / 5 |
| galeCaster | [Floating wind caster](gale-caster/production/) | 1,974 / 9 |
| juggernaut | [Armored heavyweight](juggernaut/production/) | 1,891 / 7 |

The final exports receive a finishing pass over their base geometry and animation
recipes. Use [the finishing workflow](polish-tools/README.md) to rebuild, verify
and inspect them. Static production sources preserve the reference-fitting base;
the animated sources and game exports contain the connected joints, luminous
regions and final silhouette changes. The dummy variations share
[dummy/build.py](dummy/build.py) and export into their own folders.

```sh
python3 art/enemies/polish-tools/rebuild.py
```

Append names to rebuild a subset, for example `sparring-dummy heavy-dummy`.
The recipe explicitly replaces generated sources; preserve manual Blender work
before rebuilding. Blender 4.5 LTS defaults to
`/Applications/Blender.app/Contents/MacOS/Blender`.

Every model has Idle, Run, Windup, Active, Recovery, Hurt, Spawn and Death clips.
Attack variants and Warden's Buff add their own clips. The stationary dummies
use Idle during knockback; only Sparring Dummy uses its attack clips in play.
The simulation owns timing, aim, movement and hitboxes. Death clips remain in
the assets; kills remove the live body and produce the existing particle burst.

Each model has one mesh, one vertex-color material and at most twelve bones.
The GLB uses meters, +Y up, +Z forward, a ground origin and no root motion.
Joint sleeves follow their adjoining bones, including the independently aimed
Guardian shield. Authored `_GLOW` masks add eyes, gems and fire cores through the
same crowd shader. Dummies and Swarmer have zero luminous masks.

The game bakes each model's actions into a shared bone texture once. Instances
sample that atlas, so a kind costs one body draw call regardless of population.
No per-enemy animation mixer runs during play. `?stress=300,2000,mixed` exercises
the full roster; the tuning panel can spawn individual kinds and elites.

Blender audits compare exported frames with fresh imports, verify loop seams,
floor clearance, root motion and attack contact continuity. Runtime tests compare
the atlas with Three.js skinning. Coverage tests require a batched animated model
for every content kind and distinct assets for all three training roles.

See [the per-enemy changes and review evidence](../../docs/enemy-roster-polish.md).
