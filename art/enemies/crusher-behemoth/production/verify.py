"""Check the export and round-trip every named part against the saved source."""
import hashlib
import json
import struct
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
data=(HERE/'crusher-behemoth-model.glb').read_bytes()
assert data[:4]==b'glTF'
version,length=struct.unpack_from('<II',data,4)
assert version==2 and length==len(data)
n,tag=struct.unpack_from('<I4s',data,12)
assert tag==b'JSON'
document=json.loads(data[20:20+n])
assert len(document['materials'])==2
for field in ('animations','skins','cameras','images','textures'):
    assert not document.get(field),field
assert not any(x in document.get('extensionsUsed',[]) for x in ('KHR_draco_mesh_compression','KHR_lights_punctual'))
triangles=0
for mesh in document['meshes']:
    for p in mesh['primitives']:
        assert p.get('mode',4)==4
        material=document['materials'][p['material']]
        assert 'COLOR_0' in p['attributes'] or material['name']=='Amber luminous insets'
        triangles+=document['accessors'][p['indices']]['count']//3
audit=json.loads((HERE/'audit.json').read_text())
assert triangles==audit['triangles'] and triangles<3500


def parts():
    bpy.context.view_layer.update()
    return {o.name: sorted(tuple(round(c,5) for c in o.matrix_world@v.co) for v in o.data.vertices)
            for o in bpy.data.objects if o.type=='MESH'}


bpy.ops.wm.open_mainfile(filepath=str(HERE/'crusher-behemoth-model.blend'))
source=parts()
assert not bpy.data.actions
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(HERE/'crusher-behemoth-model.glb'))
imported=parts()
assert source.keys()==imported.keys()
# Flat normals and per-facet colors duplicate vertices in glTF. Compare unique world positions.
for name in source:
    assert set(source[name])==set(imported[name]),name
assert not bpy.data.actions
assert not any(o.type in ('ARMATURE','LIGHT','CAMERA') for o in bpy.data.objects)
points=[p for values in imported.values() for p in values]
bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
assert abs(bounds[2][0])<.00002 and abs(bounds[2][1]-8.5)<.00002
for prefix in ('Pauldron','WristArmor','FistShell','Eye','Thigh','Shin','Foot','Knee','ShinGuard','KneeBinding'):
    reflected={(-p[0],p[1],p[2]) for p in imported[prefix+'.L']}
    assert reflected==set(imported[prefix+'.R']),prefix
report={'result':'passed','sha256':hashlib.sha256(data).hexdigest(),'triangles':triangles,
        'materials':2,'animations':0,'skins':0,'cameras':0,'lights':0,'named_parts':len(source),
        'source_world_vertices_preserved':True,'paired_parts_symmetric':True,
        'bounds_blender_m':bounds,'height_m':8.5,'ground_clearance_m':0,
        'axes_glb':'meters, +Y up, +Z forward'}
for side in ('L','R'):
    assert min(p[2] for p in imported[f'Foot.{side}'])==0
assert not any(name.startswith(('Finger.','Thumb')) for name in imported)
report['single_rock_per_fist_without_fingers']=True
report['both_flat_soles_on_floor']=True
(HERE/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
