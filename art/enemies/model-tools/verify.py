"""Verify a saved static source against its exported GLB, without rebuilding.

Blender --background --python-exit-code 1 --python verify.py -- <kind>.
Checks geometry, bounds, palette, axes and the absence of rigs or animation.
"""
import hashlib
import json
import struct
import sys
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[1]
kind=sys.argv[sys.argv.index('--')+1]
HERE=ROOT/kind/'production'
config=json.loads((HERE/'spirit.json').read_text())
path=HERE/f'{kind}-model.glb'
raw=path.read_bytes()
magic,version,length=struct.unpack_from('<4sII',raw)
assert magic==b'glTF' and version==2 and length==len(raw)
chunk_length,chunk_kind=struct.unpack_from('<I4s',raw,12)
assert chunk_kind==b'JSON'
gltf=json.loads(raw[20:20+chunk_length])
assert not gltf.get('animations') and not gltf.get('skins') and not gltf.get('cameras')
assert not gltf.get('images') and len(gltf['materials'])==1
assert not any('KHR_draco_mesh_compression' in p.get('extensions',{}) for mesh in gltf['meshes'] for p in mesh['primitives'])
assert all('COLOR_0' in p['attributes'] and p.get('mode',4)==4 for mesh in gltf['meshes'] for p in mesh['primitives'])
assert all(not n.get('extensions',{}).get('KHR_lights_punctual') for n in gltf['nodes'])

def snapshot():
    bpy.context.view_layer.update()
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
    return {'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),'bounds':bounds,
        'eyes':sorted(o.name for o in meshes if o.name in ('Eye.L','Eye.R')),
        'materials':len({slot.material for o in meshes for slot in o.material_slots}),
        'armatures':sum(o.type=='ARMATURE' for o in bpy.context.scene.objects),'actions':len(bpy.data.actions)}

bpy.ops.wm.open_mainfile(filepath=str(HERE/config['blend']))
source=snapshot()
assert source['triangles']<2000 and source['materials']==1
assert source['armatures']==0 and source['actions']==0 and len(source['eyes'])==2
assert abs(source['bounds'][2][0])<1e-5
review_checks={}
if kind=='volatile':
    def world_points(name):
        obj=bpy.data.objects[name]
        return [obj.matrix_world@v.co for v in obj.data.vertices]
    errors={}
    for part in ('Eye','EyeSocket','Foot','Foot root','Side rock'):
        left=world_points(part+'.L');right=world_points(part+'.R')
        assert len(left)==len(right)
        errors[part]=max(min(((p.x+q.x)**2+(p.y-q.y)**2+(p.z-q.z)**2)**.5 for q in right) for p in left)
        assert errors[part]<1e-6,(part,errors[part])
    eyes=world_points('Eye.R');rim=world_points('EyeSocket.R')[:5]
    depth=sum(p.y for p in eyes)/len(eyes)-sum(p.y for p in rim)/len(rim)
    assert depth>.02,depth
    review_checks={'mirrored_parts_error_m':errors,'eye_depth_behind_rim_m':depth}
elif kind=='stalker':
    assert not any(o.name.startswith('Back crystal') for o in bpy.context.scene.objects)
    joints=[o.name for o in bpy.context.scene.objects if o.name.startswith('Limb connection.')]
    assert len(joints)==12 and bpy.data.objects.get('Waist connection')
    review_checks={'floating_crests':0,'limb_connections':len(joints),'waist_connection':True}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))
loaded=snapshot()
assert loaded['triangles']==source['triangles'],(source,loaded)
error=max(abs(a-b) for aa,bb in zip(source['bounds'],loaded['bounds']) for a,b in zip(aa,bb))
assert error<1e-5,error
assert loaded['armatures']==0 and loaded['actions']==0 and loaded['materials']==1
assert len(loaded['eyes'])==2
result={'kind':kind,'passed':True,'glb_sha256':hashlib.sha256(raw).hexdigest(),
    'blend_sha256':hashlib.sha256((HERE/config['blend']).read_bytes()).hexdigest(),
    'sheet_sha256':hashlib.sha256((HERE/'reference/sheet.png').read_bytes()).hexdigest(),
    'triangles':loaded['triangles'],'materials':1,'animations':0,'armatures':0,
    'max_roundtrip_bounds_error_m':error,'rest_height_m':source['bounds'][2][1],
    'axes':'Blender Z-up/-Y forward exports as glTF +Y up/+Z forward',
    'model_review_checks':review_checks,
    'checks':['embedded vertex colors','no lights/cameras/helpers','no textures/decoders',
        'two named eyes','source/GLB triangle and bounds agreement','ground origin','under 2000 triangles']}
(HERE/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
