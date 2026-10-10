"""Audit native topology and the GLB, then round-trip the export in Blender."""
import hashlib
import json
import struct
from pathlib import Path

import bmesh
import bpy

HERE=Path(__file__).resolve().parent
expected=json.loads((HERE/"export.json").read_text())
bpy.ops.wm.open_mainfile(filepath=str(HERE/"sparkfist-spirit.blend"))
bpy.context.view_layer.update()
native=[]
native_points=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=="MESH" for v in o.data.vertices]
tip=min(native_points,key=lambda p:p.z)
assert tip.length<.00001,"Ground tip must be at world origin"
body=bpy.data.objects["IceSpirit"]
recess_vertices=[body.matrix_world@body.data.vertices[i].co for p in body.data.polygons if p.material_index==1 for i in p.vertices]
recess_depth=max(p.y for p in recess_vertices)-min(p.y for p in recess_vertices)
assert recess_depth>.02,"The face must have geometric depth"
for obj in bpy.context.scene.objects:
    assert obj.type=="MESH",f"Unexpected helper {obj.name}"
    bm=bmesh.new();bm.from_mesh(obj.data)
    errors={"nonmanifold_edges":sum(not e.is_manifold for e in bm.edges),
            "degenerate_faces":sum(f.calc_area()<1e-12 for f in bm.faces),
            "loose_vertices":sum(not v.link_faces for v in bm.verts),
            "smooth_faces":sum(f.smooth for f in bm.faces)}
    native.append({"name":obj.name,"triangles":len(bm.faces),**errors})
    bm.free()
    assert not any(errors.values()),(obj.name,errors)
    assert not obj.animation_data,f"Unexpected animation on {obj.name}"
    assert all(len(p.vertices)==3 for p in obj.data.polygons)
assert len(native)==8
# Compare against the accepted source rather than relying on matching bounds.
adapted={o.name:o for o in bpy.context.scene.objects}
with bpy.data.libraries.load(str(HERE.parent/"ice"/"ice-spirit.blend")) as (source,loaded):
    source_names=tuple(source.objects)
    loaded.objects=list(source_names)
for name,original in zip(source_names,loaded.objects):
    current=adapted[name]
    assert (original.location-current.location).length<1e-7,(name,"pivot changed")
    assert len(current.data.vertices)>=len(original.data.vertices)
    for a,b in zip(original.data.vertices,current.data.vertices):
        assert (a.co-b.co).length<1e-7,(name,"source vertex changed")
    if name!="IceSpirit":
        assert len(original.data.vertices)==len(current.data.vertices)
raw=(HERE/"sparkfist-spirit.glb").read_bytes()
magic,version,length=struct.unpack_from("<4sII",raw)
assert magic==b"glTF" and version==2 and length==len(raw)
json_length,kind=struct.unpack_from("<II",raw,12)
assert kind==0x4E4F534A
gltf=json.loads(raw[20:20+json_length])
for key in ("animations","skins","cameras","textures","images"):
    assert not gltf.get(key),f"Unexpected {key}"
assert "KHR_lights_punctual" not in gltf.get("extensionsUsed",[])
assert "KHR_draco_mesh_compression" not in gltf.get("extensionsUsed",[])
assert len(gltf["meshes"])==8 and len(gltf["materials"])==3
tris=0
for mesh in gltf["meshes"]:
    for p in mesh["primitives"]:
        assert p.get("mode",4)==4
        assert "TEXCOORD_0" not in p["attributes"]
        tris+=gltf["accessors"][p["indices"]]["count"]//3
        if mesh["name"].startswith(("Ice","Shard")):
            assert "COLOR_0" in p["attributes"]
assert tris==expected["triangles"]
assert 800<=tris<=1500
assert hashlib.sha256(raw).hexdigest()==expected["sha256"]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(HERE/"sparkfist-spirit.glb"))
bpy.context.view_layer.update()
objects=[o for o in bpy.context.scene.objects if o.type=="MESH"]
points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
lo=[min(p[k] for p in points) for k in range(3)]
hi=[max(p[k] for p in points) for k in range(3)]
dimensions=[hi[k]-lo[k] for k in range(3)]
for actual,target in zip(dimensions,(.55,.35,.8)):
    assert abs(actual-target)<.00001,(dimensions,target)
assert abs(lo[2])<.00001
eye_y=[o.matrix_world.translation.y for o in objects if o.name.startswith("Eye")]
assert len(eye_y)==2 and all(y<-.05 for y in eye_y),"GLB must face +Z, imported as Blender -Y"
result={"passed":True,"triangles":tris,"materials":len(gltf["materials"]),
        "named_meshes":len(gltf["meshes"]),"primitives":sum(len(m["primitives"]) for m in gltf["meshes"]),
        "dimensions_m":expected["dimensions_m"],"grounded":True,
        "native_topology":native,"round_trip_bounds_native_z_up":{"min":lo,"max":hi},
        "animations":0,"skins":0,"textures":0,"helpers":0,
        "source_vertices_preserved":True,"source_node_names_and_pivots_preserved":True,
        "face_recess_depth_m":recess_depth,"glb_faces_positive_z":True,"sha256":expected["sha256"]}
(HERE/"verification.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,indent=2))
