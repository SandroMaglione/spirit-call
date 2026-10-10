"""Re-import the GLB and verify the delivered geometry and coordinate conversion."""
import json
from pathlib import Path
import bmesh
import bpy

HERE=Path(__file__).resolve().parent
expected=json.loads((HERE/'export.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(HERE/'windwall.glb'))
objects=[o for o in bpy.data.objects if o.type=='MESH']
assert len(objects)==15
assert not [o for o in bpy.context.scene.objects if o.type in ('CAMERA','LIGHT','ARMATURE')]
assert not bpy.data.actions
bpy.context.view_layer.update()
points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
low=[min(v[i] for v in points) for i in range(3)]
high=[max(v[i] for v in points) for i in range(3)]
for key,value in (('min',low),('max',high)):
    assert all(abs(a-b)<1e-6 for a,b in zip(value,expected['bounds_blender'][key]))
triangles=0;closed=[]
for o in objects:
    o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    assert all(e.is_manifold for e in bm.edges),o.name
    closed.append(o.name);bm.free()
assert triangles==expected['triangles']
assert abs(low[2]-.04)<1e-6
info={'passed':True,'blender_round_trip':True,'closed_after_welding_color_seams':closed,
      'triangles':triangles,'bounds_blender':{'min':low,'max':high},'hover_m':low[2],
      'animations':0,'armatures':0,'cameras':0,'lights':0}
(HERE/'verification.json').write_text(json.dumps(info,indent=2)+'\n')
print(json.dumps(info,indent=2))
