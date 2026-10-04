"""Exports the water spirit as a GLB for the game (no animation yet): facing +Z, +Y up, its origin on the floor under it.

    blender --background --python-exit-code 1 --python art/spirits/water/export.py
"""
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE / "water-spirit.blend"))
out = HERE / "water-spirit.glb"
bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", export_apply=True, export_vertex_color="ACTIVE", export_attributes=True)
tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
print(f"exported {out.name}: {out.stat().st_size // 1024} KB, {tris} triangles")
