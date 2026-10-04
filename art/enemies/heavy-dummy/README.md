# Heavy Dummy

A reinforced variation of the wooden Training Dummy: a broader timber torso,
thicker post, iron bands and shoulder weights, a larger weighted base and a
blue bullseye. Its silhouette marks the target used to practice breaking and
combos. Stats, poise and hitboxes remain the existing Heavy Dummy's.

One mesh and material, 1,064 triangles and three bones. The source carries all
eight lifecycle clips; the stationary target uses Idle during knockback.

The shared recipe is [dummy/build.py](../dummy/build.py). Rebuild and finish:

```sh
python3 art/enemies/polish-tools/rebuild.py heavy-dummy
```

`heavy-dummy.blend` is the editable finished source; `heavy-dummy.glb`,
`model-info.json`, `rig-info.json`, `polish-info.json` and `verification.json`
describe the game export. See [the finishing workflow](../polish-tools/README.md).
