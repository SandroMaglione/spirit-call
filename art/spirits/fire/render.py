"""Renders the fire spirit like its sheet: front, side, back, and top views, and the three-quarter hero view, on the sheet's dark navy.

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
BACKGROUND = (0.0080, 0.0144, 0.0262)  # #17212F, linear

bpy.ops.wm.open_mainfile(filepath=str(HERE / "fire-spirit.blend"))
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
sun.data.energy = 0.5
sun.data.color = (1.0, 0.95, 0.85)
sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
scene.collection.objects.link(sun)
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
fill.data.energy = 0.15
fill.data.color = (1.0, 0.7, 0.45)
fill.rotation_euler = (math.radians(70), 0, math.radians(150))
scene.collection.objects.link(fill)
# A cyan rim from behind and below, like the sheet's lower edge.
rim = bpy.data.objects.new("Rim", bpy.data.lights.new("Rim", "SUN"))
rim.data.energy = 0.8
rim.data.color = (1.0, 0.6, 0.3)
rim.rotation_euler = (math.radians(-110), 0, math.radians(20))
scene.collection.objects.link(rim)

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
camera.data.ortho_scale = 0.8
scene.collection.objects.link(camera)
scene.camera = camera
target = Vector((0, 0, 0.36))

import json
import os


def from_turn(degrees, elevation=0.0):
    """The camera's direction from the spirit: `degrees` round from its front (negative: toward its right), `elevation` up."""
    t, e = math.radians(degrees), math.radians(elevation)
    return Vector((math.sin(t) * math.cos(e), -math.cos(t) * math.cos(e), math.sin(e)))


CAMERA = json.loads((HERE / "sheet.json").read_text()).get("hero", {"turn": 25, "elevation": 15})
VIEWS = {
    "front": Vector((0, -1, 0)),
    "back": Vector((0, 1, 0)),
    "left": Vector((-1, 0, 0)),  # its front on the image's right, as the sheet's LEFT view
    "right": Vector((1, 0, 0)),  # its front on the image's left, as the sheet's RIGHT view
    "top": Vector((0, 0.0001, 1)),  # its front at the bottom
    "bottom": Vector((0, 0.0001, -1)),
    # The sheet's isometric render (its camera fit by sweep_score.py).
    "hero": from_turn(CAMERA["turn"], CAMERA["elevation"]),
    # The game's camera: 30° down, the same turn.
    "game": from_turn(CAMERA["turn"], 30),
}
if os.environ.get("SWEEP"):
    # Hero views at many turns, for fitting the sheet's (overlay.py --sweep).
    VIEWS = {f"sweep{d}_{e}": from_turn(d, e) for d in range(-50, 51, 5) for e in (5, 10, 15, 20, 25, 30)}
    OUT = Path(os.environ["SWEEP"])
for name, direction in VIEWS.items():
    direction = direction.normalized()
    camera.location = target + direction * 4
    if name == "top":
        camera.rotation_euler = (0, 0, 0)
    elif name == "bottom":
        camera.rotation_euler = (math.pi, 0, 0)
    else:
        camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)
if os.environ.get("SWEEP"):
    raise SystemExit
# At game size: about 22 px tall (a spirit a third of a character's height), on the arena floor's color.
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.25, 0.2, 1)
scene.render.resolution_x = 30
scene.render.resolution_y = 32
camera.data.ortho_scale = 0.9
direction = from_turn(CAMERA["turn"], 30).normalized()
camera.location = target + direction * 4
camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = str(OUT / "game-size.png")
bpy.ops.render.render(write_still=True)
print("rendered", ", ".join(VIEWS), "and game-size")
