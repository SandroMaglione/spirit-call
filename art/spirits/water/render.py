"""Renders the water spirit like its sheet: front, side, back, and top views, and the three-quarter hero view, on the sheet's dark navy.

    blender --background --python-exit-code 1 --python art/spirits/water/render.py
    uv run --with pillow art/spirits/water/compare.py      # beside the sheet: renders/compare.png
"""
import math
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / "renders"
OUT.mkdir(exist_ok=True)
BACKGROUND = (0.0070, 0.0168, 0.0331)  # #132332, linear

bpy.ops.wm.open_mainfile(filepath=str(HERE / "water-spirit.blend"))
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 470
scene.render.resolution_y = 500
world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (*BACKGROUND, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
scene.world = world
# A soft key from the upper left front, and some fill.
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 1.4
sun.data.color = (0.85, 0.95, 1.0)
sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
scene.collection.objects.link(sun)
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
fill.data.energy = 0.6
fill.data.color = (0.45, 0.7, 1.0)
fill.rotation_euler = (math.radians(70), 0, math.radians(150))
scene.collection.objects.link(fill)

# Glow round the eyes, like the sheet's.
scene.use_nodes = True
tree = scene.node_tree
glare = tree.nodes.new("CompositorNodeGlare")
glare.glare_type = "FOG_GLOW"
glare.threshold = 0.9
glare.size = 7
glare.mix = 0.2
tree.links.new(tree.nodes["Render Layers"].outputs["Image"], glare.inputs["Image"])
tree.links.new(glare.outputs["Image"], tree.nodes["Composite"].inputs["Image"])

camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
camera.data.type = "ORTHO"
camera.data.ortho_scale = 0.84
scene.collection.objects.link(camera)
scene.camera = camera
target = Vector((0, 0, 0.36))

VIEWS = {
    "front": Vector((0, -1, 0)),
    "side": Vector((-1, 0, 0)),  # its front on the right, as the sheet shows it
    "back": Vector((0, 1, 0)),
    "top": Vector((0, 0.0001, 1)),  # its front at the bottom, as the sheet shows it
    "hero": Vector((-0.55, -0.75, 0.45)),
    # The game's camera: 30° down, from 45° round it.
    "game": Vector((-math.sin(math.radians(45)) * math.cos(math.radians(30)), -math.cos(math.radians(45)) * math.cos(math.radians(30)), math.sin(math.radians(30)))),
}
for name, direction in VIEWS.items():
    direction = direction.normalized()
    camera.location = target + direction * 4
    camera.rotation_euler = (0, 0, 0) if name == "top" else (-direction).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)
# At game size: about 22 px tall (a spirit a third of a character's height), on the arena floor's color.
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.25, 0.2, 1)
scene.render.resolution_x = 30
scene.render.resolution_y = 32
camera.data.ortho_scale = 0.9
direction = VIEWS["game"].normalized()
camera.location = target + direction * 4
camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = str(OUT / "game-size.png")
bpy.ops.render.render(write_still=True)
print("rendered", ", ".join(VIEWS), "and game-size")
