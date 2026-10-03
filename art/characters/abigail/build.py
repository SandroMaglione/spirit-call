"""Build Abigail's editable Blender file: mesh, texture, rig, and actions.

blender --background --python-exit-code 1 --python art/characters/abigail/build.py

Run paint.py first when the palette or the face changes. This regenerates
abigail.blend; manual edits belong in the scripts (see README).
"""
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import figure  # noqa: E402
from shapes import build  # noqa: E402

FPS = 30
MESH_ONLY = "--mesh-only" in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.unit_settings.system = "METRIC"
collection = bpy.data.collections.new("ABIGAIL | editable character")
scene.collection.children.link(collection)

image = bpy.data.images.load(str(HERE / "texture.png"))
image.pack()
material = bpy.data.materials.new("Abigail | atlas")
material.use_nodes = True
nodes = material.node_tree.nodes
shader = nodes.get("Principled BSDF")
texture = nodes.new("ShaderNodeTexImage")
texture.image = image
texture.interpolation = "Linear"
material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
shader.inputs["Roughness"].default_value = 0.8
shader.inputs["Specular IOR Level"].default_value = 0.0

body = build("Abigail body", figure.figure(), material, collection)
# She stands on the floor: her soles' lowest point is the origin's height.
floor = min(v.co.z for v in body.data.vertices)
for v in body.data.vertices:
    v.co.z -= floor
print("ABIGAIL_MESH", len(body.data.polygons), "faces", sum(len(p.vertices) - 2 for p in body.data.polygons), "triangles")

# Her face lights evenly, as in anime models: its normals lean toward the
# front, so the cel shading's edge never crosses her features.
forward = Vector((0, -1, 0.25)).normalized()
uv = body.data.uv_layers["UVMap"].data
body.data.update()
normals = []
for loop in body.data.loops:
    u, v = uv[loop.index].uv
    normal = Vector(body.data.corner_normals[loop.index].vector)
    if u < 0.5 and v > 0.5:
        normal = normal.lerp(forward, 0.75).normalized()
    normals.append(normal)
body.data.normals_split_custom_set(normals)

if not MESH_ONLY:
    import rig  # noqa: E402
    rig.rig_and_animate(body, collection, FPS)

bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "abigail.blend"))
