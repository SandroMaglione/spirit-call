"""Compare every exported pose with the editable source in a fresh Blender import."""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
KINDS = ('dummy', 'chaser', 'shooter', 'brute', 'swarmer', 'charger', 'sniper', 'guardian')

def bounds(mesh):
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    points = [evaluated.matrix_world @ v.co for v in evaluated.data.vertices]
    assert all(math.isfinite(n) for v in points for n in v)
    return [min(v[i] for v in points) for i in range(3)] + [max(v[i] for v in points) for i in range(3)]

def capture(rig, mesh, clips, start):
    result = {}
    for name, spec in clips.items():
        rig.animation_data.action = bpy.data.actions[name]
        frames = round(spec['lastKeySeconds']*30)+1
        poses = []
        for frame in range(frames):
            bpy.context.scene.frame_set(start+frame)
            poses.append(bounds(mesh))
            root = rig.pose.bones['root']
            assert root.location.length < 1e-6 and root.rotation_quaternion.angle < 1e-6
        result[name] = poses
    return result

def verify(kind):
    folder = ROOT/kind
    info = json.loads((folder/'model-info.json').read_text())
    binary = (folder/(kind+'.glb')).read_bytes()
    length = struct.unpack_from('<I', binary, 12)[0]
    gltf = json.loads(binary[20:20+length])
    assert len(gltf['meshes']) == len(gltf['skins']) == len(gltf['materials']) == 1
    assert len(gltf['meshes'][0]['primitives']) == 1
    assert not gltf.get('cameras') and not gltf.get('extensionsRequired')
    assert all('uri' not in image for image in gltf.get('images', []))
    assert set(info['clips']) == {a['name'] for a in gltf['animations']}
    bpy.ops.wm.open_mainfile(filepath=str(folder/(kind+'.blend')))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    source = capture(rig, mesh, info['clips'], 1)
    for name, clip in info['clips'].items():
        if clip['loopSeconds'] is not None:
            rig.animation_data.action = bpy.data.actions[name]
            bpy.context.scene.frame_set(round(clip['loopSeconds']*30)+1)
            assert max(abs(a-b) for a,b in zip(source[name][0], bounds(mesh))) < 1e-5
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=str(folder/(kind+'.glb')))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    imported = capture(rig, mesh, info['clips'], 0)
    errors = {name: max(abs(a-b) for left,right in zip(source[name], imported[name]) for a,b in zip(left,right)) for name in source}
    assert max(errors.values()) < 5e-4, (kind, errors)
    ground = {name: min(pose[2] for pose in poses) for name,poses in source.items()}
    # A dying body folds below its origin as it shrinks; living poses stay on the floor.
    assert min(value for name,value in ground.items() if name != 'Death') > -.025, (kind, ground)
    report = {'sha256': hashlib.sha256(binary).hexdigest(), 'roundTripBoundsError': errors, 'groundMinimum': ground,
              'triangles': info['triangles'], 'bones': info['bones'], 'bytes': len(binary)}
    (folder/'verification.json').write_text(json.dumps(report, indent=2)+'\n')
    print('VERIFIED', kind, json.dumps(report))

args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for kind in args or KINDS:
    verify(kind)
