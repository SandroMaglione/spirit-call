"""Verify static GLB structure and imported bounds against the saved source."""
import hashlib
import json
import struct
import sys
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[1]

def bounds():
    bpy.context.view_layer.update()
    points=[o.matrix_world@v.co for o in bpy.data.objects if o.type=='MESH' for v in o.data.vertices]
    return [[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]

def verify(kind):
    here=ROOT/kind/'production'
    config=json.loads((here/'spirit.json').read_text())
    audit=json.loads((here/'audit.json').read_text())
    glb=here/f'{kind}-model.glb';data=glb.read_bytes()
    assert data[:4]==b'glTF'
    version,length=struct.unpack_from('<II',data,4);assert version==2 and length==len(data)
    n,tag=struct.unpack_from('<I4s',data,12);assert tag==b'JSON'
    document=json.loads(data[20:20+n])
    assert len(document['materials'])==1
    for field in ('animations','skins','cameras','images','textures'):assert not document.get(field),field
    assert 'KHR_draco_mesh_compression' not in document.get('extensionsUsed',[])
    assert 'KHR_lights_punctual' not in document.get('extensionsUsed',[])
    triangles=0
    for mesh in document['meshes']:
        for p in mesh['primitives']:
            assert p.get('mode',4)==4
            assert 'COLOR_0' in p['attributes']
            triangles+=document['accessors'][p['indices']]['count']//3
    assert triangles==audit['triangles'] and triangles<2000
    bpy.ops.wm.open_mainfile(filepath=str(here/config['blend']))
    source=bounds();source_names=sorted(o.name for o in bpy.data.objects if o.type=='MESH')
    assert not bpy.data.actions
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    imported=bounds()
    assert max(abs(a-b) for axis,other in zip(source,imported) for a,b in zip(axis,other))<.00002
    assert sorted(o.name for o in bpy.data.objects if o.type=='MESH')==source_names
    assert not bpy.data.actions
    assert not any(o.type in ('ARMATURE','LIGHT','CAMERA') for o in bpy.data.objects)
    result={'kind':kind,'sha256':hashlib.sha256(data).hexdigest(),'triangles':triangles,
        'material_count':1,'source_bounds_blender_m':source,'imported_bounds_blender_m':imported,
        'animations':0,'skins':0,'cameras':0,'lights':0,'vertex_colors':True,
        'source_parts_preserved':True,'ground_origin':abs(source[2][0])<.00002,'result':'passed'}
    assert result['ground_origin']
    (here/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))

if __name__=='__main__':
    for kind in sys.argv[sys.argv.index('--')+1:]:verify(kind)
