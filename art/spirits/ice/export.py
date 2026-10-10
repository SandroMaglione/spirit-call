"""Export static meshes only, converting native +Y facing to glTF +Z.

Blender's glTF axis conversion maps -Y to +Z. Temporarily rotate the model
180 degrees about native Z first, preserving the requested +Y-facing .blend.
"""
import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE/"ice-spirit.blend"))
bpy.context.view_layer.update()
objects=[o for o in bpy.context.scene.objects if o.type=="MESH"]
points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
lo=[min(p[k] for p in points) for k in range(3)]
hi=[max(p[k] for p in points) for k in range(3)]
info={"name":"Ice Spirit","stage":"static","height_m":hi[2],
      "dimensions_m":{"width":hi[0]-lo[0],"depth":hi[1]-lo[1],"height":hi[2]-lo[2]},
      "native_axes":"meters, +Z up, +Y forward", "glb_axes":"meters, +Y up, +Z forward",
      "origin":"world (0,0,0), at lowest central crystal tip",
      "height_basis":"ground origin to highest rest mesh vertex, including crown",
      "triangles":sum(len(o.data.polygons) for o in objects),
      "materials":[m.name for m in bpy.data.materials if m.users],
      "objects":[{"name":o.name,"triangles":len(o.data.polygons),"native_pivot_m":list(o.location)} for o in objects],
      "clips":{},"reference_policy":"sheet.json"}
bpy.ops.object.select_all(action="DESELECT")
rotation=Matrix.Rotation(math.pi,4,"Z")
for o in objects:
    o.matrix_world=rotation@o.matrix_world
    o.select_set(True)
path=HERE/"ice-spirit.glb"
bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,
    export_animations=False,export_cameras=False,export_lights=False,
    export_texcoords=False,export_normals=True,export_yup=True,export_extras=True,
    export_materials="EXPORT",export_attributes=True,export_all_vertex_colors=True)
info["sha256"]=hashlib.sha256(path.read_bytes()).hexdigest()
info["bytes"]=path.stat().st_size
(HERE/"export.json").write_text(json.dumps(info,indent=2)+"\n")
print(json.dumps(info,indent=2))
