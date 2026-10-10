"""Audit closed native meshes and the actual exported, round-tripped GLB."""
import hashlib
import json
import struct
from pathlib import Path
import bmesh
import bpy

HERE=Path(__file__).resolve().parent
expected=json.loads((HERE/"export.json").read_text())
bpy.ops.wm.open_mainfile(filepath=str(HERE/"water-crescent.blend"))
bpy.context.view_layer.update()
native=[]
for obj in bpy.context.scene.objects:
    assert obj.type=="MESH",obj.name
    bm=bmesh.new();bm.from_mesh(obj.data)
    errors={"nonmanifold_edges":sum(not e.is_manifold for e in bm.edges),
            "degenerate_faces":sum(f.calc_area()<1e-12 for f in bm.faces),
            "loose_vertices":sum(not v.link_faces for v in bm.verts),
            "smooth_faces":sum(f.smooth for f in bm.faces)}
    assert not any(errors.values()),(obj.name,errors)
    assert bm.calc_volume(signed=True)>0,(obj.name,"inward normals")
    assert all(len(p.vertices)==3 for p in obj.data.polygons)
    assert not obj.animation_data
    native.append({"name":obj.name,"triangles":len(bm.faces),**errors});bm.free()
assert len(native)==9
raw=(HERE/"water-crescent.glb").read_bytes()
magic,version,length=struct.unpack_from("<4sII",raw)
assert magic==b"glTF" and version==2 and length==len(raw)
size,kind=struct.unpack_from("<II",raw,12)
assert kind==0x4E4F534A
g=json.loads(raw[20:20+size])
for k in ("animations","skins","cameras","textures","images"):
    assert not g.get(k),k
for k in ("KHR_lights_punctual","KHR_draco_mesh_compression"):
    assert k not in g.get("extensionsUsed",[])
assert len(g["meshes"])==9 and len(g["materials"])==2
tris=0
for m in g["meshes"]:
    for p in m["primitives"]:
        assert p.get("mode",4)==4
        assert "TEXCOORD_0" not in p["attributes"]
        if not m["name"].startswith("Eye"):assert "COLOR_0" in p["attributes"]
        tris+=g["accessors"][p["indices"]]["count"]//3
assert tris==expected["triangles"] and tris<5000
assert hashlib.sha256(raw).hexdigest()==expected["sha256"]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(HERE/"water-crescent.glb"))
bpy.context.view_layer.update()
points=[o.matrix_world@v.co for o in bpy.context.scene.objects for v in o.data.vertices]
lo=[min(p[k] for p in points) for k in range(3)]
hi=[max(p[k] for p in points) for k in range(3)]
dimensions=[hi[k]-lo[k] for k in range(3)]
for a,b in zip(dimensions,[expected["dimensions_m"][k] for k in ("width","depth","height")]):
    assert abs(a-b)<.00001,(a,b)
assert abs(hi[2]-.6)<.00001 and abs(lo[2])<.00001
eyes=[o for o in bpy.context.scene.objects if o.name.startswith("Eye")]
assert len(eyes)==2 and all(o.matrix_world.translation.y<-.05 for o in eyes)
result={"passed":True,"triangles":tris,"materials":2,"named_meshes":9,
        "primitives":sum(len(m["primitives"]) for m in g["meshes"]),
        "dimensions_m":expected["dimensions_m"],"native_topology":native,
        "round_trip_bounds_native_z_up":{"min":lo,"max":hi},
        "animations":0,"skins":0,"textures":0,"helpers":0,
        "glb_faces_positive_z":True,"sha256":expected["sha256"]}
(HERE/"verification.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,indent=2))
