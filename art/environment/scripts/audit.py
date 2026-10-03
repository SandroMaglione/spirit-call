"""Audit delivered files and review coverage using only Python's standard library."""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--kit', required=True)
args = p.parse_args()
root = Path(__file__).resolve().parents[1] / args.kit


def read(name):
    return json.loads((root / name).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


manifest, verification, validator, render = [read(name) for name in
    ('manifest.json', 'verification.json', 'gltf-validation.json', 'previews/render-info.json')]
kit = read('kit.json')
beta = kit.get('batch') == 'beta-arenas'
source_hash = sha(root / manifest['source'])
assert source_hash == manifest['source_sha256'] == verification['source_sha256'] == render['source_sha256']
assert sha(root / 'source/examples.blend') == render['examples_sha256']
assets = {a['id']: a for a in manifest['assets']}
assert set(assets) == {a['id'] for a in read('kit.json')['assets']}
for report in (verification, validator):
    assert set(assets) == {a['id'] for a in report['assets']}
    for asset in report['assets']:
        assert asset['sha256'] == assets[asset['id']]['sha256']
for a in validator['assets']:
    assert all(a['issues'][key] == 0 for key in ('numErrors', 'numWarnings', 'numInfos', 'numHints')), a['id']
for a in assets.values():
    assert sha(root / a['file']) == a['sha256']
    assert (root / a['file']).stat().st_size == a['bytes']
    assert (root / 'previews' / (a['id'] + '.png')).is_file(), a['id']
    if a['moving_parts']:
        assert (root / 'previews' / (a['id'] + '-open.png')).is_file()
overview_names = ['contact-sheet', 'top', 'phone-scale'] + ([n for title in kit['examples'] for n in (title, title + '-top')]
                  if beta else ['terrace', 'crossing', 'enclosure', 'terrace-top'])
for name in overview_names:
    data = (root / 'previews' / (name + '.png')).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    width, height = struct.unpack_from('>II', data, 16)
    assert width >= 390 and height >= 720
    if name == 'phone-scale':
        assert (width, height) == (390, 844)
layouts = read('layouts.json')['layouts']
expected_layouts = kit['examples'] if beta else ['terrace', 'crossing', 'enclosure']
assert [x['name'] for x in layouts] == expected_layouts
if beta:
    used = {p['asset'] for layout in layouts for p in layout['placements']}
    assert set(kit['signature_props']) <= used, 'Each themed prop must appear in an assembled example'
libraries = {args.kit: assets}
joined_stairs = 0
clear_areas_checked = 0
for layout in layouts:
    assert layout['placements']
    for placement in layout['placements']:
        source = root.parent / placement['kit'] / 'models' / (placement['asset'] + '.glb')
        assert source.is_file(), source
        if placement['kit'] not in libraries:
            other = json.loads((root.parent / placement['kit'] / 'manifest.json').read_text())
            libraries[placement['kit']] = {a['id']: a for a in other['assets']}
    for area in layout.get('reserved_clear_areas', []):
        ax0, az0, ax1, az1 = area['bounds_xz_m']
        assert ax1 > ax0 and az1 > az0
        for placement in layout['placements']:
            item = libraries[placement['kit']][placement['asset']]
            if item['category'] == 'floor':
                continue
            boxes = item['collision']
            if item['category'] == 'prop' or item['walk_surfaces']:
                b = item['bounds_m']
                boxes = [{'center_m': [(x + y) / 2 for x, y in zip(b['min'], b['max'])],
                          'size_m': item['dimensions_m']}]
            ox, oy, oz = placement['position_m']
            c, s = math.cos(math.radians(placement['yaw_degrees'])), math.sin(math.radians(placement['yaw_degrees']))
            for box in boxes:
                x, y, z = box['center_m']
                w, h, d = box['size_m']
                if oy + y + h / 2 < area['height_m'] + .05 or oy + y - h / 2 > area['height_m'] + 1.5:
                    continue
                cx, cz = ox + c * x + s * z, oz - s * x + c * z
                rx, rz = (abs(c) * w + abs(s) * d) / 2, (abs(s) * w + abs(c) * d) / 2
                overlap = min(cx + rx, ax1) - max(cx - rx, ax0) > .001 and min(cz + rz, az1) - max(cz - rz, az0) > .001
                assert not overlap, f'{layout["name"]}: {item["id"]} intrudes into {area["name"]}'
        clear_areas_checked += 1
    def supports(point, placement):
        item = libraries[placement['kit']][placement['asset']]
        surfaces = item.get('walk_surfaces', [])
        if item.get('purpose') == 'ground-decoration':
            b = item['bounds_m']
            surfaces = [{'kind': 'plane', 'height_m': 0, 'bounds_xz_m': [b['min'][0], b['min'][2], b['max'][0], b['max'][2]]}]
        ox, oy, oz = placement['position_m']
        c, s = math.cos(math.radians(placement['yaw_degrees'])), math.sin(math.radians(placement['yaw_degrees']))
        x, z = c * (point[0] - ox) - s * (point[2] - oz), s * (point[0] - ox) + c * (point[2] - oz)
        for surface in surfaces:
            if surface['kind'] != 'plane' or abs(point[1] - oy - surface['height_m']) > 1e-5:
                continue
            cx, cz = surface.get('center_xz_m', [0, 0])
            x0, z0, x1, z1 = surface['bounds_xz_m']
            if x0 - 1e-5 <= x - cx <= x1 + 1e-5 and z0 - 1e-5 <= z - cz <= z1 + 1e-5:
                return True
        return False
    for placement in layout['placements']:
        item = libraries[placement['kit']][placement['asset']]
        for surface in item.get('walk_surfaces', []):
            if surface['kind'] != 'ramp':
                continue
            c, s = math.cos(math.radians(placement['yaw_degrees'])), math.sin(math.radians(placement['yaw_degrees']))
            ox, oy, oz = placement['position_m']
            for key in ('bottom_m', 'top_m'):
                x, y, z = surface[key]
                endpoint = [ox + c * x + s * z, oy + y, oz - s * x + c * z]
                assert any(supports(endpoint, other) for other in layout['placements'] if other is not placement), f'Unconnected stair {key}: {layout["name"]}'
            joined_stairs += 1
assert (root / 'README.md').is_file()
result = {'kit': args.kit, 'assets': len(assets), 'triangles': sum(a['triangles'] for a in assets.values()),
          'glb_bytes': sum(a['bytes'] for a in assets.values()), 'pngs': len(list((root / 'previews').glob('*.png'))),
          'source_sha256': source_hash, 'stair_flights_connected_in_examples': joined_stairs, 'status': 'pass'}
if beta:
    assert clear_areas_checked == 4 and joined_stairs == 2
    result['reserved_combat_areas_checked'] = clear_areas_checked
    result['layouts'] = len(layouts)
(root / 'delivery-audit.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
