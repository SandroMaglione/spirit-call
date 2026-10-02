"""Check saved sources and freshly imported GLBs, without saving either."""
import hashlib
import json
import math
import struct
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "manifest.json").read_text())
source = ROOT / manifest["source"]
assert hashlib.sha256(source.read_bytes()).hexdigest() == manifest["source_sha256"], "Re-export edited source"
bpy.ops.wm.open_mainfile(filepath=str(source))
sources = {}
for obj in bpy.context.scene.objects:
    if "asset_id" not in obj:
        continue
    assert obj.type == "MESH" and not obj.modifiers, "Apply modifiers before export"
    assert all(abs(s - 1) < 1e-6 for s in obj.scale), "Apply source scale"
    assert all(abs(a) < 1e-6 for a in obj.rotation_euler), "Apply source rotation"
    assert all(math.isfinite(c) for v in obj.data.vertices for c in v.co)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    assert all(e.is_manifold for e in bm.edges), f"Open/nonmanifold shell: {obj.name}"
    assert all(f.calc_area() > 1e-10 for f in bm.faces), f"Zero-area face: {obj.name}"
    assert bm.calc_volume(signed=True) > 0, f"Inverted mesh: {obj.name}"
    bm.free()
    obj.data.calc_loop_triangles()
    sources[obj["asset_id"]] = {
        "triangles": len(obj.data.loop_triangles),
        "bounds": [[min(v.co[i] for v in obj.data.vertices) for i in range(3)],
                   [max(v.co[i] for v in obj.data.vertices) for i in range(3)]],
    }


def glb_json(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    assert magic == b"glTF" and version == 2 and length == len(data)
    size, kind = struct.unpack_from("<I4s", data, 12)
    assert kind == b"JSON"
    return json.loads(data[20:20 + size])


reports = []
assert set(sources) == {a["id"] for a in manifest["assets"]}
for asset in manifest["assets"]:
    path = ROOT / asset["file"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"]
    gltf = glb_json(path)
    assert not gltf.get("extensionsRequired")
    assert not gltf.get("images") and not gltf.get("textures")
    assert all("uri" not in b for b in gltf.get("buffers", []))
    assert not gltf.get("animations") and not gltf.get("cameras") and not gltf.get("skins")
    assert len(gltf["meshes"]) == 1 and len(gltf["materials"]) == 1
    assert len(gltf["meshes"][0]["primitives"]) == 1
    primitive = gltf["meshes"][0]["primitives"][0]
    assert "COLOR_0" in primitive["attributes"] and "NORMAL" in primitive["attributes"]
    assert gltf["materials"][0].get("alphaMode", "OPAQUE") == "OPAQUE"
    assert not gltf["materials"][0].get("doubleSided", False)
    position = gltf["accessors"][primitive["attributes"]["POSITION"]]
    for key in ("min", "max"):
        assert max(abs(a - b) for a, b in zip(position[key], asset["bounds_m"][key])) < 1e-5
    for node in gltf["nodes"]:
        assert node.get("translation", [0, 0, 0]) == [0, 0, 0]
        assert node.get("rotation", [0, 0, 0, 1]) == [0, 0, 0, 1]
        assert node.get("scale", [1, 1, 1]) == [1, 1, 1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = list(bpy.context.scene.objects)
    assert len(objects) == 1 and objects[0].type == "MESH"
    obj = objects[0]
    obj.data.calc_loop_triangles()
    assert len(obj.data.loop_triangles) == asset["triangles"] == sources[asset["id"]]["triangles"]
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    imported = [[min(v[i] for v in points) for i in range(3)], [max(v[i] for v in points) for i in range(3)]]
    assert max(abs(a - b) for row, expected in zip(imported, sources[asset["id"]]["bounds"])
               for a, b in zip(row, expected)) < 1e-5
    if asset["purpose"] == "solid-obstacle":
        assert asset["dimensions_m"][0] == asset["collision"]["size_xz_m"][0]
        assert asset["dimensions_m"][2] == asset["collision"]["size_xz_m"][1]
        assert abs(asset["bounds_m"]["min"][1]) < 1e-5
    if asset["purpose"] == "ground-decoration":
        assert abs(asset["bounds_m"]["max"][1]) < 1e-5
    reports.append({"id": asset["id"], "triangles": asset["triangles"], "bytes": path.stat().st_size,
                    "material_primitives": 1, "fresh_import_bounds_match": True,
                    "sha256": asset["sha256"]})
(ROOT / "verification.json").write_text(json.dumps({"blender": bpy.app.version_string,
    "source_sha256": manifest["source_sha256"], "assets": reports}, indent=2) + "\n")
print("VERIFIED", json.dumps(reports))
