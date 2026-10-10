"""Audit animation channels, hierarchy, palette, scale, and the static source."""
import hashlib
import json
import struct
from pathlib import Path

import bmesh
import bpy

HERE = Path(__file__).resolve().parent
metadata = json.loads((HERE/"animation.json").read_text())
static = json.loads((HERE/"export.json").read_text())
assert hashlib.sha256((HERE/"water-crescent.blend").read_bytes()).hexdigest() == metadata["static_source_sha256"]
assert hashlib.sha256((HERE/"water-crescent.glb").read_bytes()).hexdigest() == static["sha256"]
raw = (HERE/"water-crescent-animated.glb").read_bytes()
assert hashlib.sha256(raw).hexdigest() == metadata["sha256"]
magic,version,length = struct.unpack_from("<4sII",raw)
assert magic == b"glTF" and version == 2 and length == len(raw)
size,kind = struct.unpack_from("<II",raw,12)
assert kind == 0x4E4F534A
gltf = json.loads(raw[20:20+size])
assert {a["name"] for a in gltf["animations"]} == set(metadata["clips"])
assert len(gltf["animations"]) == 10
for animation in gltf["animations"]:
    # Constant tracks keep Run's stretch and restore open eyes after a blink.
    assert len(animation["channels"]) == 24
    targets = {gltf["nodes"][c["target"]["node"]]["name"] for c in animation["channels"]}
    assert {"WaterCore","Shell.Main","Shell.Right","Fin.Upper","Fin.Tail","Fin.Lower"} <= targets
    for sampler in animation["samplers"]:
        # The exporter represents unchanged channels as STEP; motion stays linear.
        interpolation = sampler.get("interpolation","LINEAR")
        assert interpolation in ("LINEAR","STEP")
        if interpolation == "STEP":
            assert gltf["accessors"][sampler["output"]]["count"] == 2
        accessor = gltf["accessors"][sampler["input"]]
        assert abs(accessor["max"][0]-metadata["clips"][animation["name"]]["lastKeySeconds"]) < 1e-6
for key in ("skins","textures","images","cameras"):
    assert not gltf.get(key),key
assert len(gltf["meshes"]) == 8 and len(gltf["materials"]) == 2
for mesh in gltf["meshes"]:
    for primitive in mesh["primitives"]:
        assert primitive.get("mode",4) == 4
        assert "TEXCOORD_0" not in primitive["attributes"]
        if mesh["name"].startswith(("Water","Shell","Fin")):
            assert "COLOR_0" in primitive["attributes"]
assert "KHR_draco_mesh_compression" not in gltf.get("extensionsUsed",[])
assert "KHR_lights_punctual" not in gltf.get("extensionsUsed",[])
body = next(n for n in gltf["nodes"] if n["name"] == "WaterCore")
assert len(body["children"]) == 7
triangles = sum(gltf["accessors"][p["indices"]]["count"]//3 for m in gltf["meshes"] for p in m["primitives"])
assert triangles == static["triangles"] == 1798
bpy.ops.wm.open_mainfile(filepath=str(HERE/"water-crescent-animated.blend"))
bpy.context.view_layer.update()
assert len(bpy.context.scene.objects) == 8
for obj in bpy.context.scene.objects:
    assert obj.type == "MESH"
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    assert all(e.is_manifold for e in bm.edges),obj.name
    assert all(f.calc_area()>1e-12 and not f.smooth for f in bm.faces),obj.name
    assert all(v.link_faces for v in bm.verts),obj.name
    bm.free()
    assert len(obj.animation_data.nla_tracks) == 10
points = [o.matrix_world@v.co for o in bpy.context.scene.objects for v in o.data.vertices]
dimensions = [max(p[k] for p in points)-min(p[k] for p in points) for k in range(3)]
assert all(abs(actual-expected)<1e-5 for actual,expected in zip(dimensions,(static["dimensions_m"][k] for k in ("width","depth","height"))))
result = {"passed":True,"clips":10,"triangles":triangles,"meshes":8,"materials":2,
          "channels_per_clip":{a["name"]:len(a["channels"]) for a in gltf["animations"]},
          "static_source_preserved":True,"native_dimensions_m":dimensions,
          "sha256":metadata["sha256"]}
(HERE/"verification-animated.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,indent=2))
