"""Export static meshes, combining seams with the stone parts they follow."""
import hashlib
import json
import struct
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE/'hearth-spirit.blend'))
bpy.context.view_layer.update()
objects = [o for o in bpy.context.scene.objects if o.type=='MESH']
points = [o.matrix_world@v.co for o in objects for v in o.data.vertices]
lo = [min(p[k] for p in points) for k in range(3)]
hi = [max(p[k] for p in points) for k in range(3)]
# The editable file retains each stone and seam. The GLB keeps the body,
# flame, supports and eyes as seven nodes, with no decal-only draw calls.
groups = {
    'HearthBody': ['HearthBody','BowlRim','EmberBasin','Jaw.L','Jaw.R',
                  'BowlCrack.-1','BowlCrack.1','RimCrack.-1','RimCrack.1',
                  'RearCrack.-1','RearCrack.1','FaceEmberSeam'],
    'FlameCore': ['FlameCore','FlameTongue.L','FlameTongue.Rear'],
    'Support.L': ['Support.L','SupportEmber.0'],
    'Support.R': ['Support.R','SupportEmber.1'],
    'Support.Front': ['Support.Front','SupportEmber.2'],
}
for name,names in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for n in names:
        bpy.data.objects[n].select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects[name]
    bpy.ops.object.join()
bpy.ops.object.select_all(action='SELECT')
path = HERE/'hearth-spirit.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
    export_animations=False,export_cameras=False,export_lights=False,
    export_texcoords=False,export_normals=True,export_yup=True,export_extras=True,
    export_materials='EXPORT',export_attributes=True,export_all_vertex_colors=True)
# Vertex-colored emission is not portable through the Principled exporter.
# Unlit glTF preserves the flame's exact colored facets under every light.
raw = path.read_bytes()
length,kind = struct.unpack_from('<II',raw,12)
gltf = json.loads(raw[20:20+length])
tail = raw[20+length:]
for mat in gltf['materials']:
    if mat['name'] in ('Hearth flame and molten seams','Hearth warm eyes'):
        mat.setdefault('extensions',{})['KHR_materials_unlit'] = {}
        mat.pop('emissiveFactor',None)
        mat['extensions'].pop('KHR_materials_emissive_strength',None)
gltf['extensionsUsed'] = sorted(set(gltf.get('extensionsUsed',[]))|{'KHR_materials_unlit'})
gltf['extras'] = {'character':'Hearth','stage':'static','hover_gap_m':.08,
                 'height_basis':'ground origin to highest rest mesh vertex including flame'}
encoded = json.dumps(gltf,separators=(',',':')).encode()
encoded += b' '*((-len(encoded))%4)
path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+
                 struct.pack('<II',len(encoded),kind)+encoded+tail)
tris = sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
info = {'name':'Hearth','stage':'static','height_m':hi[2],
        'silhouette_height_m':hi[2]-lo[2],'hover_gap_m':lo[2],
        'height_basis':'ground origin to highest rest mesh vertex, including curled flame',
        'native_axes':'meters, +Z up, -Y forward','glb_axes':'meters, +Y up, +Z forward',
        'origin':'ground point under the floating body',
        'dimensions_m':{'width':hi[0]-lo[0],'depth':hi[1]-lo[1],'height':hi[2]-lo[2]},
        'native_bounds_m':{'min':lo,'max':hi},'triangles':tris,
        'materials':[m['name'] for m in gltf['materials']],
        'meshes':[{'name':m['name'],'primitives':len(m['primitives'])} for m in gltf['meshes']],
        'primitives':sum(len(m['primitives']) for m in gltf['meshes']),
        'clips':{},'reference':'reference/sheet.png',
        'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(HERE/'export.json').write_text(json.dumps(info,indent=2)+'\n')
print(json.dumps(info,indent=2))
