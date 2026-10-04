# Sparring Dummy

A variation of the wooden Training Dummy with red padded guards and an
articulated striking bar. Its shoulder is embedded in the torso, and a
bone-weighted sleeve keeps the bar connected during the sweep. The simulation's
existing slow, harmless swing owns its aim, telegraph and contact timing.

One mesh and material, 928 triangles and four bones. The source carries all
eight lifecycle clips; the stationary target uses Idle during knockback.

The shared recipe is [dummy/build.py](../dummy/build.py). Rebuild and finish:

```sh
python3 art/enemies/polish-tools/rebuild.py sparring-dummy
```

`sparring-dummy.blend` is the editable finished source; `sparring-dummy.glb`,
`model-info.json`, `rig-info.json`, `polish-info.json` and `verification.json`
describe the game export. See [the finishing workflow](../polish-tools/README.md).
