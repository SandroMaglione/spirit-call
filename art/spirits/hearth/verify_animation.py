"""Audit the exported clips and their actual animated vertices, including subframes."""
import hashlib
import json
import math
import struct
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
info = json.loads((HERE/'animation.json').read_text())


def read_glb(filename):
    raw = (HERE/filename).read_bytes()
    magic, version, length = struct.unpack_from('<4sII', raw)
    assert magic == b'glTF' and version == 2 and length == len(raw)
    jlen, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(raw[20:20+jlen])
    blen, bkind = struct.unpack_from('<II', raw, 20+jlen)
    assert bkind == 0x004E4942
    return doc, raw[28+jlen:28+jlen+blen], raw


def accessor(doc, binary, index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    dtype = {5126:'<f4', 5125:'<u4', 5123:'<u2', 5121:'u1'}[a['componentType']]
    width = dict(SCALAR=1, VEC2=2, VEC3=3, VEC4=4)[a['type']]
    offset = view.get('byteOffset', 0)+a.get('byteOffset', 0)
    result = np.frombuffer(binary, dtype=dtype, count=a['count']*width, offset=offset).reshape(-1, width).astype(float)
    if a.get('normalized'):
        result /= {5121:255, 5123:65535}[a['componentType']]
    return result


def rotation(q):
    x, y, z, w = q / np.linalg.norm(q)
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])


def sample(doc, binary, clip=None, time=0.):
    transforms = [dict(translation=np.array(n.get('translation', [0,0,0]), dtype=float),
        rotation=np.array(n.get('rotation', [0,0,0,1]), dtype=float),
        scale=np.array(n.get('scale', [1,1,1]), dtype=float)) for n in doc['nodes']]
    if clip:
        timing = info['clips'][clip['name']]
        for channel in clip['channels']:
            sampler = clip['samplers'][channel['sampler']]
            assert sampler.get('interpolation', 'LINEAR') == 'LINEAR'
            ts = accessor(doc, binary, sampler['input']).ravel()
            values = accessor(doc, binary, sampler['output'])
            if timing['loopSeconds'] is not None:
                ts = np.append(ts, timing['loopSeconds'])
                values = np.vstack((values, values[0]))
            k = min(max(np.searchsorted(ts, time, side='right')-1, 0), len(ts)-2)
            t = np.clip((time-ts[k])/(ts[k+1]-ts[k]), 0, 1)
            a, b = values[k], values[k+1]
            path = channel['target']['path']
            if path == 'rotation':
                dot = float(np.dot(a, b))
                if dot < 0:
                    b = -b; dot = -dot
                if dot < .9995:
                    angle = math.acos(np.clip(dot, -1, 1))
                    value = (math.sin((1-t)*angle)*a+math.sin(t*angle)*b)/math.sin(angle)
                else:
                    value = a*(1-t)+b*t
                value /= np.linalg.norm(value)
            else:
                value = a*(1-t)+b*t
            transforms[channel['target']['node']][path] = value
    worlds = {}
    def visit(index, parent):
        p = transforms[index]
        matrix = np.eye(4)
        matrix[:3,:3] = rotation(p['rotation']) @ np.diag(p['scale'])
        matrix[:3,3] = p['translation']
        worlds[index] = parent @ matrix
        for child in doc['nodes'][index].get('children', []):
            visit(child, worlds[index])
    for root in doc['scenes'][doc.get('scene', 0)]['nodes']:
        visit(root, np.eye(4))
    vertices = {}
    for i, node in enumerate(doc['nodes']):
        for j, primitive in enumerate(doc['meshes'][node['mesh']]['primitives']):
            points = accessor(doc, binary, primitive['attributes']['POSITION'])
            indices = accessor(doc, binary, primitive['indices']).astype(int).ravel()
            points = points[indices]
            vertices[(node['name'], j)] = (worlds[i] @ np.column_stack((points, np.ones(len(points)))).T).T[:,:3]
    return transforms, worlds, vertices


gltf, binary, raw = read_glb('hearth-animated.glb')
static, static_binary, static_raw = read_glb('hearth-spirit.glb')
assert hashlib.sha256(raw).hexdigest() == info['sha256']
assert hashlib.sha256(static_raw).hexdigest() == info['static_reference_sha256']
assert info['static_reference_sha256'] == '0c26ed80097107c60a16d4b4edb205191486a70ab184d16d0e21f57393b2e254'
assert len(gltf['nodes']) == len(gltf['meshes']) == 7
assert len(gltf['materials']) == 4
for key in ('skins', 'cameras', 'images', 'textures'):
    assert not gltf.get(key), key
assert all('mesh' in n for n in gltf['nodes'])
assert all(not e.endswith('compression') and e != 'KHR_lights_punctual' for e in gltf.get('extensionsUsed', []))
assert {a['name'] for a in gltf['animations']} == set(info['clips'])
body_index = next(i for i, n in enumerate(gltf['nodes']) if n['name'] == 'HearthBody')
flame_index = next(i for i, n in enumerate(gltf['nodes']) if n['name'] == 'FlameCore')
assert gltf['scenes'][0]['nodes'] == [body_index]
assert len(gltf['nodes'][body_index]['children']) == 6
rest, rest_worlds, rest_vertices = sample(gltf, binary)
_, _, static_vertices = sample(static, static_binary)
max_rest_error = 0.
for key, points in rest_vertices.items():
    error = float(np.max(np.abs(points-static_vertices[key])))
    max_rest_error = max(max_rest_error, error)
    assert error < 1e-6, (key, error)
for name in {m['name'] for m in gltf['meshes']}:
    new = next(m for m in gltf['meshes'] if m['name'] == name)
    old = next(m for m in static['meshes'] if m['name'] == name)
    for a, b in zip(new['primitives'], old['primitives']):
        assert gltf['materials'][a['material']] == static['materials'][b['material']]
        if 'COLOR_0' in a['attributes']:
            ai = accessor(gltf, binary, a['indices']).astype(int).ravel()
            bi = accessor(static, static_binary, b['indices']).astype(int).ravel()
            assert np.array_equal(accessor(gltf, binary, a['attributes']['COLOR_0'])[ai], accessor(static, static_binary, b['attributes']['COLOR_0'])[bi])
triangles = sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
assert triangles == info['triangles'] == 2982
results = {}
for clip in gltf['animations']:
    name = clip['name']; timing = info['clips'][name]
    for sampler in clip['samplers']:
        ts = accessor(gltf, binary, sampler['input']).ravel()
        assert abs(ts[0]) < 1e-6 and abs(ts[-1]-timing['lastKeySeconds']) < 1e-6, (name, ts)
        assert np.all(np.diff(ts) > 0)
    end = timing['loopSeconds'] or timing['lastKeySeconds']
    lows = []; highs = []
    for time in np.linspace(0, end, round(end*120)+1):
        local, worlds, points = sample(gltf, binary, clip, time)
        assert np.allclose(local[body_index]['translation'][[0,2]], rest[body_index]['translation'][[0,2]], atol=1e-7), name
        assert np.allclose(local[body_index]['scale'], [1,1,1], atol=1e-7), name
        assert all(np.all(np.isfinite(p)) for p in points.values()), name
        all_points = np.concatenate(list(points.values()))
        lows.append(float(all_points[:,1].min()))
        highs.append(float(all_points[:,1].max()))
        # Each eye's center stays fixed in the bowl's local space even while blinking.
        for i, node in enumerate(gltf['nodes']):
            if node['name'].startswith('Eye'):
                assert np.allclose(local[i]['translation'], rest[i]['translation'], atol=1e-7), name
    assert min(lows) > .035, (name, min(lows))
    start_pose = sample(gltf, binary, clip, 0)[2]
    end_pose = sample(gltf, binary, clip, end)[2]
    target = start_pose if timing['loopSeconds'] else rest_vertices
    closing_error = max(float(np.max(np.abs(end_pose[k]-target[k]))) for k in target)
    assert closing_error < 1e-6, (name, closing_error)
    if timing['loopSeconds'] is None:
        assert max(float(np.max(np.abs(start_pose[k]-rest_vertices[k]))) for k in target) < 1e-6, name
    results[name] = dict(**timing, sampled_at_hz=120, minimum_clearance_m=min(lows),
        maximum_height_m=max(highs), closing_error_m=closing_error,
        rigid_bowl=True, no_horizontal_root_motion=True, eyes_attached=True)
    if name in info['contact_frames']:
        contact = info['contact_frames'][name]/info['fps']
        peak = sample(gltf, binary, clip, contact)[0][flame_index]['scale'][1]
        all_scales = [sample(gltf, binary, clip, t)[0][flame_index]['scale'][1]
                      for t in np.linspace(0, end, round(end*30)+1)]
        assert peak >= max(all_scales)-1e-6, name
        results[name].update(contact_seconds=contact, flare_peaks_at_contact=True)

# The saved Blender source must contain the same complete set of editable NLA clips.
bpy.ops.wm.open_mainfile(filepath=str(HERE/'hearth-animated.blend'))
assert len(bpy.context.scene.objects) == 7
for obj in bpy.context.scene.objects:
    assert obj.type == 'MESH'
    assert obj.animation_data.action is None
    assert {t.name for t in obj.animation_data.nla_tracks} == set(info['clips'])
    assert all(t.mute for t in obj.animation_data.nla_tracks)
    assert len(obj.animation_data.nla_tracks) == 10
    if obj.name != 'HearthBody':
        assert obj.parent.name == 'HearthBody'
result = dict(passed=True, triangles=triangles, meshes=7, materials=4, clips=results,
    helpers=0, skins=0, textures=0, contact_frames=info['contact_frames'],
    preserved_static_geometry=True, preserved_vertex_colors_and_materials=True,
    maximum_rest_vertex_error_m=max_rest_error, static_sha256=info['static_reference_sha256'],
    sha256=info['sha256'])
(HERE/'animation-verification.json').write_text(json.dumps(result, indent=2)+'\n')
print('PASS: ten clips; rest geometry and palette preserved; rigid bowl; in place; sampled at 120 Hz')
print(json.dumps({k:round(v['minimum_clearance_m'], 4) for k, v in results.items()}))
