"""Validate source shells, GLB round trips, hierarchy, pivots and traversal metadata."""
import json
import math
import struct
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh
import bpy
from mathutils import Vector
from pipeline import ENV, arguments, bounds, digest, meshes, roots, write_json

args = arguments(__doc__)
root = ENV / args.kit
manifest = json.loads((root / 'manifest.json').read_text())
source = root / manifest['source']
assert digest(source) == manifest['source_sha256'], 'Re-export the edited source'
bpy.ops.wm.open_mainfile(filepath=str(source))
source_roots = {o['asset_id']: o for o in roots(bpy.context.scene)}
assert set(source_roots) == {a['id'] for a in manifest['assets']}
source_info = {}
for name, asset in source_roots.items():
    children = {}
    for obj in meshes(asset):
        assert not obj.modifiers
        assert all(abs(x - 1) < 1e-6 for x in obj.scale)
        assert all(abs(x) < 1e-6 for x in obj.rotation_euler)
        assert all(math.isfinite(c) for v in obj.data.vertices for c in v.co)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        assert all(e.is_manifold for e in bm.edges), f'Open shell: {name}/{obj.name}'
        assert all(f.calc_area() > 1e-10 for f in bm.faces), f'Degenerate face: {name}/{obj.name}'
        # Check every disconnected shell, so an inverted detail cannot hide in a large mesh.
        unseen = set(bm.verts)
        while unseen:
            pending = [next(iter(unseen))]
            component = set()
            while pending:
                v = pending.pop()
                if v in component:
                    continue
                component.add(v)
                pending.extend(e.other_vert(v) for e in v.link_edges if e.other_vert(v) not in component)
            unseen -= component
            faces = set(f for v in component for f in v.link_faces)
            volume = sum(f.verts[0].co.dot(f.verts[1].co.cross(f.verts[2].co)) / 6 for f in faces)
            assert volume > 1e-10, f'Inverted/flat component: {name}/{obj.name}: {volume}'
        bm.free()
        obj.data.calc_loop_triangles()
        children[obj.name] = {'triangles': len(obj.data.loop_triangles), 'translation': list(obj.location)}
    source_info[name] = {'bounds': bounds(asset), 'children': children}
    if asset['recipe'] == 'floor-grate':
        from mathutils.bvhtree import BVHTree
        obj = meshes(asset)[0]
        tree = BVHTree.FromPolygons([v.co for v in obj.data.vertices], [list(p.vertices) for p in obj.data.polygons])
        assert tree.ray_cast(Vector((.1, .1, 1)), Vector((0, 0, -1)))[0] is None, 'Grate holes must be open'
        assert tree.ray_cast(Vector((0, .1, 1)), Vector((0, 0, -1)))[0] is not None, 'Grate bar missing'

reports = []
for asset in manifest['assets']:
    name = asset['id']
    path = root / asset['file']
    data = path.read_bytes()
    assert digest(path) == asset['sha256']
    magic, version, size = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and size == len(data)
    json_size, kind = struct.unpack_from('<I4s', data, 12)
    assert kind == b'JSON'
    gltf = json.loads(data[20:20 + json_size])
    assert not any(gltf.get(k) for k in ('extensionsRequired', 'images', 'textures', 'animations', 'skins', 'cameras'))
    assert all('uri' not in b for b in gltf['buffers'])
    assert len(gltf['materials']) == 1
    assert gltf['materials'][0].get('alphaMode', 'OPAQUE') == 'OPAQUE'
    assert not gltf['materials'][0].get('doubleSided', False)
    for mesh in gltf['meshes']:
        assert len(mesh['primitives']) == 1
        assert {'COLOR_0', 'POSITION', 'NORMAL'} <= mesh['primitives'][0]['attributes'].keys()
    nodes = {node['name']: node for node in gltf['nodes']}
    assert name in nodes and nodes[name].get('translation', [0, 0, 0]) == [0, 0, 0]
    assert nodes[name].get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1]
    for node in nodes.values():
        assert node.get('scale', [1, 1, 1]) == [1, 1, 1]
    for motion in asset['moving_parts']:
        node = nodes[motion['node']]
        expected = motion['pivot_m'] if motion['kind'] == 'hinge' else motion['closed_position_m']
        assert max(abs(a - b) for a, b in zip(node.get('translation', [0, 0, 0]), expected)) < 1e-5
        assert motion['axis'] == '+Y'
    for surface in asset['walk_surfaces']:
        if surface['kind'] == 'ramp':
            assert surface['width_m'] > 0
            bottom, top = surface['bottom_m'], surface['top_m']
            assert top[1] > bottom[1] and top[2] < bottom[2]
            assert abs(top[1] / (bottom[2] - top[2]) - .5) < 1e-6
            assert asset['connections'][0]['position_m'] == bottom
            assert asset['connections'][1]['position_m'] == top
            assert abs(asset['bounds_m']['max'][1] - top[1]) < 1e-5
            assert abs(asset['dimensions_m'][0] - surface['width_m']) < 1e-5
            assert abs(asset['bounds_m']['min'][2] - top[2]) < 1e-5
            assert abs(asset['bounds_m']['max'][2] - bottom[2]) < 1e-5
        else:
            assert surface['kind'] == 'plane' and math.isfinite(surface['height_m'])
    if asset['category'] == 'floor':
        assert abs(asset['bounds_m']['max'][1]) < 1e-5, 'Floor tops must meet at Y=0'
    for box in asset['collision']:
        assert all(x > 0 and math.isfinite(x) for x in box['size_m'])
    for connection in asset['connections'] + asset['sockets']:
        assert len(connection['position_m']) == 3 and all(math.isfinite(x) for x in connection['position_m'])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = bpy.context.scene.objects.get(name)
    assert imported and imported.type == 'EMPTY'
    bpy.context.view_layer.update()
    actual = bounds(imported)
    for edge in ('min', 'max'):
        assert max(abs(a - b) for a, b in zip(actual[edge], source_info[name]['bounds'][edge])) < 1e-5, name
        assert max(abs(a - b) for a, b in zip(actual[edge], asset['bounds_m'][edge])) < 1e-5, name
    total = 0
    for obj in meshes(imported):
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
        expected = source_info[name]['children'][obj.name]
        assert len(obj.data.loop_triangles) == expected['triangles']
        assert max(abs(a - b) for a, b in zip(obj.location, expected['translation'])) < 1e-5
    assert total == asset['triangles'] and len(meshes(imported)) == asset['mesh_count']
    # Exercise both door leaves after reimport and check that the opening clears.
    if asset['moving_parts']:
        for motion in asset['moving_parts']:
            obj = bpy.context.scene.objects[motion['node']]
            if motion['kind'] == 'hinge':
                obj.rotation_mode = 'XYZ'
                obj.rotation_euler.z = math.radians(motion['open_degrees'])
            else:
                x, y, z = motion['open_position_m']
                obj.location = (x, -z, y)
        bpy.context.view_layer.update()
        clear = asset['opening']['clear_width_m'] / 2 - .12
        for motion in asset['moving_parts']:
            obj = bpy.context.scene.objects[motion['node']]
            coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
            if motion['kind'] == 'hinge':
                assert min(abs(v.x) for v in coords) >= clear, f'Door obstructs open passage: {name}'
            else:
                assert min(v.z for v in coords) >= asset['opening']['clear_height_m'] - 1e-5
    reports.append({'id': name, 'sha256': asset['sha256'], 'triangles': total, 'round_trip': 'pass',
                    'closed_shells': 'pass', 'moving_parts_exercised': len(asset['moving_parts'])})
write_json(root / 'verification.json', {'blender': bpy.app.version_string, 'source_sha256': manifest['source_sha256'], 'assets': reports})
print('VERIFIED', args.kit, len(reports))
