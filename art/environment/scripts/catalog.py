"""Write the review index from verified exports, without touching Blender sources."""
import argparse
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--kit', required=True)
args = p.parse_args()
root = Path(__file__).resolve().parents[1] / args.kit
kit = json.loads((root / 'kit.json').read_text())
manifest = json.loads((root / 'manifest.json').read_text())
verification = json.loads((root / 'verification.json').read_text())
gltf = json.loads((root / 'gltf-validation.json').read_text())
assert len(manifest['assets']) == len(verification['assets']) == len(gltf['assets'])
assert all(not (a['issues']['numErrors'] or a['issues']['numWarnings']) for a in gltf['assets'])
assert verification['source_sha256'] == manifest['source_sha256']
hashes = {a['id']: a['sha256'] for a in manifest['assets']}
for report in (verification, gltf):
    assert {a['id']: a['sha256'] for a in report['assets']} == hashes, 'Revalidate the current exports'
assert all((root / 'previews' / (a['id'] + '.png')).is_file() for a in manifest['assets']), 'Render every model first'
assert (root / 'source/examples.blend').is_file()
descriptions = {
    'courtyard-extension': 'Twenty-five additions preserve the approved warm stone and subdued jade palette. Terraces, hinged doors, grates, railings, paving patterns, and garden furniture extend the original courtyard without editing its eighteen assets.',
    'overgrown-sanctuary': 'Mossy limestone, roots, timber and muted foliage. Root-wrapped supports, a timber arch, shrine fragments, vegetation and hollow stone vessels support forest clearings and terraced ruins.',
    'flooded-cistern': 'Cool grey masonry, teal accents and oxidized bronze. Faceted columns, drainage junctions, open grates, pipes, a liftable sluice and reservoir vessels support dry walkways around water infrastructure. Water itself is a runtime effect.',
    'ember-kilnworks': 'Clay brick, ash-grey iron and restrained amber. Braced masonry, metal doors, catwalks, furnace equipment, storage and workshop props distinguish this area from the stone ruins. Warm inserts are opaque colors, not embedded lights or fire.',
    'frostbound-monastery': 'Blue-grey stone, ivory snow, aged timber and warm brass. Snow-capped supports, terrace stairs, a bell arch, canopy, banners and frozen rock clusters support mountain approaches and ruined cloisters. Ice is opaque; there is no weather or slippery-floor behavior.',
}
rows = []
for a in manifest['assets']:
    dims = ' × '.join(f'{x:.3f}'.rstrip('0').rstrip('.') for x in a['dimensions_m'])
    rows.append(f"| [{a['id']}](previews/{a['id']}.png) | [{a['mesh_count']} mesh{'es' if a['mesh_count'] != 1 else ''}]({a['file']}) | {dims} | {a['triangles']} |")
total_bytes = sum(a['bytes'] for a in manifest['assets'])
total_triangles = sum(a['triangles'] for a in manifest['assets'])
text = f'''# {kit['title']}

{descriptions[args.kit]}

![Assembled terrace](previews/terrace.png)

## View and edit

- [Editable model library](source/{args.kit}.blend), with one named collection per asset.
- [Editable example scenes](source/examples.blend): terrace, crossing, and enclosure.
- [Labeled contact sheet](previews/contact-sheet.png) and [library top view](previews/top.png).
- [Terrace](previews/terrace.png), [crossing](previews/crossing.png), [enclosure](previews/enclosure.png), and [terrace top view](previews/terrace-top.png).
- [Phone-scale art composition](previews/phone-scale.png), 390 × 844.
- [Door open](previews/doorway-open.png) and [gate open](previews/gate-wide-open.png).
- [Manifest](manifest.json), [layout placements](layouts.json), and [authoring inventory](kit.json).

The optional crow is an external scale reference in the PNGs only. The saved
examples contain environment geometry and studio objects. They are art examples,
not game levels or a test of traversal in the running game.

## Models

{len(manifest['assets'])} GLBs, {total_triangles:,} triangles total, {total_bytes:,} bytes combined.
Dimensions are exported X × Y × Z meters. Each model links to its own PNG and GLB.

| Asset and preview | GLB | Dimensions, m | Triangles |
| --- | --- | --- | ---: |
''' + '\n'.join(rows) + f'''

## Handoff and verification

Read the [shared environment guide](../README.md) for axes, origins, connecting
modules, moving parts, collision, walk surfaces, references, and regeneration.
IDs are scoped to this folder; use `{args.kit}/<asset-id>` as a library key.
They are not shipped account-content IDs.

The library has no textures, required glTF extensions, animation clips, lights,
or cameras in its GLBs. Moving doors retain their mesh hierarchy and local pivots.
The manifest describes how to open them; it does not implement interactions.

[Blender verification](verification.json) passed source geometry and fresh-import
checks for every asset, including opening the exported door leaves and checking
passage clearance. [Khronos validation](gltf-validation.json) reports zero errors
and warnings for all {len(manifest['assets'])} exports. Hashes bind these reports to the supplied files.

```sh
python3 art/environment/scripts/run.py --kit {args.kit} --render --crow art/characters/crow/crow.glb
```

This exports the saved source and regenerates the previews. Add `--build` only
to create a source from `kit.json`. Replacing an existing source additionally
requires `--replace-generated` and discards manual edits.

## Selected references

''' + '\n'.join(f'- [Reference {i + 1}]({url})' for i, url in enumerate(kit['references'])) + '\n'
(root / 'README.md').write_text(text)
print(args.kit, len(manifest['assets']), 'assets', total_triangles, 'triangles', total_bytes, 'bytes')
