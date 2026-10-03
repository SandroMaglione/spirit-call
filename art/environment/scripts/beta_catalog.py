"""Write beta kit galleries from the actual delivered inventory and validation."""
import argparse
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--kit', required=True)
args = p.parse_args()
root = Path(__file__).resolve().parents[1] / args.kit
kit, manifest, verification, validation = [json.loads((root / f).read_text()) for f in
    ('kit.json', 'manifest.json', 'verification.json', 'gltf-validation.json')]
assert kit['batch'] == 'beta-arenas'
hashes = {a['id']: a['sha256'] for a in manifest['assets']}
for report in (verification, validation):
    assert {a['id']: a['sha256'] for a in report['assets']} == hashes
assert all(a['issues']['numErrors'] == a['issues']['numWarnings'] == 0 for a in validation['assets'])
assert verification['source_sha256'] == manifest['source_sha256']
assert all((root / 'previews' / (a['id'] + '.png')).is_file() for a in manifest['assets'])
assert (root / 'source/examples.blend').is_file()
scenes = '\n'.join(f"| {role} | [{name}](previews/{name}.png) | [Top view](previews/{name}-top.png) |" for role, name in zip(kit['roles'], kit['examples']))
rows = []
for a in manifest['assets']:
    dims = ' × '.join(f'{x:.3f}'.rstrip('0').rstrip('.') for x in a['dimensions_m'])
    rows.append(f"| [{a['id']}](previews/{a['id']}.png) | [GLB]({a['file']}) | {dims} | {a['triangles']} |")
size = sum(a['bytes'] for a in manifest['assets'])
tris = sum(a['triangles'] for a in manifest['assets'])
text = f'''# {kit['title']}

{kit['description']}

![Quest arena composition](previews/{kit['examples'][0]}.png)

## Review and edit

- [Labeled contact sheet](previews/contact-sheet.png), [library top view](previews/top.png), and [phone-scale review](previews/phone-scale.png).
- [Editable model library](source/{args.kit}.blend) and [four editable assemblies](source/examples.blend).
- [Manifest](manifest.json), [layout placements and reserved areas](layouts.json), and [full authoring inventory](kit.json).
- [Door open](previews/doorway-open.png), [gate open](previews/gate-wide-open.png), [open cache](previews/supply-cache-open.png), and [active beacon](previews/beacon-active.png).

| Intended use | Assembly | Plan |
| --- | --- | --- |
{scenes}

The assemblies propose spaces for future quests and dungeon rooms. They are
editable art scenes, not shipped gameplay levels. The crow is a read-only size
reference in PNGs and is excluded from the saved assemblies and model exports.
Tall props belong at boundaries; review occlusion under the actual game camera.

## Models

{len(manifest['assets'])} GLBs, {tris:,} triangles combined, {size:,} bytes combined.
These totals describe the library, not one arena's draw cost. Every static asset
has one mesh and one opaque vertex-color material. Each hinged door has a frame
and two leaves. No textures, required glTF extensions, or animation clips.

| Model preview | Export | Dimensions in XYZ meters | Triangles |
| --- | --- | --- | ---: |
''' + '\n'.join(rows) + f'''

## Handoff

Read the [beta arena plan](../BETA-ARENAS.md) for role coverage and reference
choices, and the [shared guide](../README.md) for origins, axes and runtime
integration. Use `{args.kit}/<asset-id>` as the library key. These are art IDs,
not persistent gameplay-content IDs.

Floors connect on the 2 m grid at Y=0. The narrow stair is 1 m wide; full and
wide flights are 2 m and 4 m wide, all rising 1.2 m over 2.4 m. The wide bridge
is 4 × 4 m; the wide platform is 4 × 2 m and rises 1.2 m. Walk planes, stair
ramps, static collision suggestions and door pivots are in the manifest.
Cache and beacon states are separate static assets for presentation to swap.
They define no interaction, reward, elemental effect or gameplay timer.

[Source and import checks](verification.json), [Khronos validation](gltf-validation.json),
and [delivery audit](delivery-audit.json) accompany the files. The audit also
checks that both sample stairs meet supporting surfaces and that all four
reserved combat areas are free of modeled props and suggested solid bounds.
This is not an enemy-navigation test or phone performance measurement.

```sh
python3 art/environment/scripts/run.py --kit {args.kit} --render --crow art/characters/crow/crow.glb
python3 art/environment/scripts/beta_catalog.py --kit {args.kit}
python3 art/environment/scripts/audit.py --kit {args.kit}
```

Export uses the saved source, including manual edits. Rebuilding with
`--build --replace-generated` deliberately replaces those edits.

## Reference links

''' + '\n'.join(f'- {url}' for url in kit['references']) + '\n'
(root / 'README.md').write_text(text)
print(args.kit, len(manifest['assets']), tris, size)
