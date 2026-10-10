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
assert hashlib.sha256((HERE/"sparkfist-spirit.blend").read_bytes()).hexdigest() == metadata["static_source_sha256"]
assert hashlib.sha256((HERE/"sparkfist-spirit.glb").read_bytes()).hexdigest() == static["sha256"]
raw = (HERE/"sparkfist-spirit-animated.glb").read_bytes()
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
    assert {"IceSpirit","Shard.Upper.L","Shard.Upper.R","Shard.Lower.L","Shard.Lower.R"} <= targets
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
assert len(gltf["meshes"]) == 8 and len(gltf["materials"]) == 3
for mesh in gltf["meshes"]:
    for primitive in mesh["primitives"]:
        assert primitive.get("mode",4) == 4
        assert "TEXCOORD_0" not in primitive["attributes"]
        if mesh["name"].startswith(("Ice","Shard")):
            assert "COLOR_0" in primitive["attributes"]
assert "KHR_draco_mesh_compression" not in gltf.get("extensionsUsed",[])
assert "KHR_lights_punctual" not in gltf.get("extensionsUsed",[])
body = next(n for n in gltf["nodes"] if n["name"] == "IceSpirit")
assert len(body["children"]) == 7
triangles = sum(gltf["accessors"][p["indices"]]["count"]//3 for m in gltf["meshes"] for p in m["primitives"])
assert triangles == static["triangles"] == 1218
# Reuse is checked channel by channel, so a later exporter change cannot
# silently alter the accepted motion while preserving the clip names.
source_raw=(HERE.parent/"ice"/"ice-spirit-animated.glb").read_bytes()
source_size,_=struct.unpack_from("<II",source_raw,12)
source=json.loads(source_raw[20:20+source_size])
def channels(document,raw,animation):
    binary_start=20+struct.unpack_from("<I",raw,12)[0]+8
    def data(index):
        accessor=document["accessors"][index]
        view=document["bufferViews"][accessor["bufferView"]]
        start=binary_start+view.get("byteOffset",0)+accessor.get("byteOffset",0)
        count=accessor["count"]*{"SCALAR":1,"VEC3":3,"VEC4":4}[accessor["type"]]
        return raw[start:start+count*4]
    return {(document["nodes"][channel["target"]["node"]]["name"],channel["target"]["path"]):
        (sampler.get("interpolation","LINEAR"),data(sampler["input"]),data(sampler["output"]))
        for channel in animation["channels"] for sampler in [animation["samplers"][channel["sampler"]]]}
for animation in gltf["animations"]:
    original=next(a for a in source["animations"] if a["name"]==animation["name"])
    assert channels(gltf,raw,animation)==channels(source,source_raw,original),animation["name"]
bpy.ops.wm.open_mainfile(filepath=str(HERE/"sparkfist-spirit-animated.blend"))
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
assert all(abs(actual-expected)<1e-5 for actual,expected in zip(dimensions,(.55,.35,.8)))
result = {"passed":True,"clips":10,"triangles":triangles,"meshes":8,"materials":3,
          "channels_per_clip":{a["name"]:len(a["channels"]) for a in gltf["animations"]},
          "static_source_preserved":True,"accepted_ice_animation_channels_identical":True,"native_dimensions_m":dimensions,
          "sha256":metadata["sha256"]}
(HERE/"verification-animated.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,indent=2))
