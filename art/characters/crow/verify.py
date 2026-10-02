"""Check the saved character and its portable export, including a GLB import.

blender --background --python-exit-code 1 --python art/characters/crow/verify.py
"""
import json
import math
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT / "crow.blend"))
objects = [o for o in bpy.data.collections["CROW | editable character"].objects if o.type == "MESH"]


def bounds(meshes):
    points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    return [min(p[i] for p in points) for i in range(3)] + [max(p[i] for p in points) for i in range(3)]


def triangles(meshes):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)


for obj in objects:
    assert all(math.isfinite(c) for v in obj.data.vertices for c in v.co), obj.name
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    assert all(e.is_manifold for e in bm.edges), f"Open or nonmanifold shell: {obj.name}"
    assert all(f.calc_area() > 1e-10 for f in bm.faces), f"Zero-area face: {obj.name}"
    bm.free()
palette = next(i for i in bpy.data.images if i.name.startswith("Crow palette"))
assert palette.packed_file is not None, "Blend must carry its own texture"
assert tuple(palette.size) == (512, 512)
before = {"meshes": len(objects), "triangles": triangles(objects), "bounds": bounds(objects)}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / "crow.glb"))
objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
after = {"meshes": len(objects), "triangles": triangles(objects), "bounds": bounds(objects)}
assert before["meshes"] == after["meshes"], (before, after)
assert before["triangles"] == after["triangles"], (before, after)
assert max(abs(a - b) for a, b in zip(before["bounds"], after["bounds"])) < 1e-5, (before, after)
assert not any(o.type in {"LIGHT", "CAMERA", "ARMATURE"} for o in bpy.context.scene.objects)
assert any(tuple(i.size) == (512, 512) for i in bpy.data.images), "GLB texture missing"
print("ARTIFACT_VERIFIED", json.dumps(after))
