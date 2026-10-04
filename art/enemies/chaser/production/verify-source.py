"""Audit the saved source and write a static mesh for the review-only viewer."""
import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
SOURCE=HERE/"chaser-production.blend"
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
objects=[o for o in bpy.context.scene.objects if o.type=="MESH"]
assert not [o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
assert not bpy.data.actions
assert all(not o.modifiers for o in objects)
assert all(o.data.color_attributes.get("Color") for o in objects)
assert len({m.name for o in objects for m in o.data.materials})==1
assert all(len(o.data.materials)==1 for o in objects)
positions=[];colors=[];parts=[];degenerate=0
for obj in objects:
    data=obj.data;data.calc_loop_triangles();start=len(positions)//3
    for tri in data.loop_triangles:
        points=[obj.matrix_world@data.vertices[i].co for i in tri.vertices]
        if (points[1]-points[0]).cross(points[2]-points[0]).length<1e-9:
            degenerate+=1;continue
        for loop,point in zip(tri.loops,points):
            positions.extend(round(float(v),6) for v in point)
            colors.extend(round(float(v),6) for v in data.color_attributes["Color"].data[loop].color[:3])
    parts.append({"name":obj.name,"start":start,"count":len(positions)//3-start})
assert len(positions)==len(colors)
assert len(positions)//9<2000
# Browser geometry is a review snapshot, not the runtime export contract.
payload={"positions":positions,"colors":colors,"parts":parts,"triangles":len(positions)//9}
(HERE/"review-mesh.json").write_text(json.dumps(payload,separators=(",",":"))+"\n")
audit=json.loads((HERE/"audit.json").read_text())
audit["source_sha256"]=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
audit["review_triangles"]=payload["triangles"]
audit["degenerate_triangles"]=degenerate
audit["source_checks"]={"no_rig":True,"no_actions":True,"no_modifiers":True,"one_material":True,
                        "vertex_colors":True,"ground_origin":abs(audit["bounds_m"][2][0])<1e-6}
(HERE/"audit.json").write_text(json.dumps(audit,indent=2)+"\n")
print(json.dumps({k:audit[k] for k in ("triangles","review_triangles","degenerate_triangles","source_checks")}))
