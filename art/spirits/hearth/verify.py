"""Audit native geometry and the actual GLB, then compare round-trip bounds."""
import hashlib
import json
import struct
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
expected = json.loads((HERE/'export.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(HERE/'hearth-spirit.blend'))
bpy.context.view_layer.update()
native = []
for o in bpy.context.scene.objects:
    assert o.type=='MESH',f'Unexpected helper: {o.name}'
    assert not o.animation_data, f'Unexpected animation: {o.name}'
    assert all(len(p.vertices)==3 and not p.use_smooth for p in o.data.polygons)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    counts = {'boundary_edges':sum(e.is_boundary for e in bm.edges),
              'nonmanifold_interior_edges':sum(not e.is_manifold and not e.is_boundary for e in bm.edges),
              'degenerate_faces':sum(f.calc_area()<1e-12 for f in bm.faces),
              'loose_vertices':sum(not v.link_faces for v in bm.verts)}
    bm.free()
    assert counts['nonmanifold_interior_edges']==counts['degenerate_faces']==counts['loose_vertices']==0,(o.name,counts)
    if not o.get('surface_detail'):
        assert counts['boundary_edges']==0,(o.name,counts)
    native.append({'name':o.name,'surface_detail':bool(o.get('surface_detail')),**counts})
body = bpy.data.objects['HearthBody']
world_verts = [body.matrix_world@v.co for v in body.data.vertices]
tree = BVHTree.FromPolygons(world_verts,[p.vertices for p in body.data.polygons])
eyes = [bpy.data.objects[n].matrix_world.translation for n in ('Eye.L','Eye.R')]
for eye in eyes:
    hit,_,_,_ = tree.ray_cast(Vector((eye.x,-1,eye.z)),Vector((0,1,0)))
    assert hit is not None and 0< hit.y-eye.y <.005,'Eye must lie just above the inset backing'
assert abs(eyes[0].x+eyes[1].x)<1e-6
assert abs(eyes[0].z-eyes[1].z)<1e-6
raw = (HERE/'hearth-spirit.glb').read_bytes()
magic,version,length = struct.unpack_from('<4sII',raw)
assert magic==b'glTF' and version==2 and length==len(raw)
jlen,kind = struct.unpack_from('<II',raw,12)
assert kind==0x4E4F534A
gltf = json.loads(raw[20:20+jlen])
for key in ('animations','skins','cameras','images','textures'):
    assert not gltf.get(key),f'Unexpected {key}'
assert all('mesh' in n for n in gltf['nodes'])
for extension in ('KHR_lights_punctual','KHR_draco_mesh_compression','EXT_meshopt_compression'):
    assert extension not in gltf.get('extensionsUsed',[])
assert len(gltf['materials'])==4 and len(gltf['meshes'])==7
triangles = 0
for m in gltf['meshes']:
    for p in m['primitives']:
        assert p.get('mode',4)==4
        assert 'NORMAL' in p['attributes']
        assert 'TEXCOORD_0' not in p['attributes']
        triangles += gltf['accessors'][p['indices']]['count']//3
        if not m['name'].startswith('Eye'):
            assert 'COLOR_0' in p['attributes']
assert triangles==expected['triangles'] and triangles<5000
assert hashlib.sha256(raw).hexdigest()==expected['sha256']
for m in gltf['materials']:
    if m['name'] in ('Hearth flame and molten seams','Hearth warm eyes'):
        assert 'KHR_materials_unlit' in m.get('extensions',{})
for n in gltf['nodes']:
    if n['name'].startswith('Eye'):
        assert n['translation'][2]>.20,'GLB face must point +Z'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(HERE/'hearth-spirit.glb'))
bpy.context.view_layer.update()
points = [o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
lo = [min(p[k] for p in points) for k in range(3)]
hi = [max(p[k] for p in points) for k in range(3)]
for kind,actual in (('min',lo),('max',hi)):
    for a,b in zip(actual,expected['native_bounds_m'][kind]):
        assert abs(a-b)<1e-5,(kind,actual,expected['native_bounds_m'][kind])
assert abs(lo[2]-.08)<1e-6 and abs(hi[2]-.88)<1e-6
result = {'passed':True,'triangles':triangles,'materials':4,'meshes':7,
          'primitives':expected['primitives'],'native_topology':native,
          'round_trip_native_bounds_m':{'min':lo,'max':hi},
          'hover_gap_m':lo[2],'height_m':hi[2],
          'animations':0,'skins':0,'textures':0,'helpers':0,
          'eyes_on_recessed_backing':True,'export_faces_positive_z':True,
          'colored_unlit_flame':True,'sha256':expected['sha256']}
(HERE/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
print('PASS:',triangles,'triangles;',expected['primitives'],'primitives; seven static meshes')
