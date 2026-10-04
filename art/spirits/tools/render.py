"""Renders a spirit like its sheet: the front, back, left, right, top, and bottom views, its isometric render's camera, and the game's camera.

    blender --background --python-exit-code 1 --python art/spirits/tools/render.py -- <spirit>
    SWEEP=/tmp/sweep blender --background --python art/spirits/tools/render.py -- <spirit>   # isometric camera candidates

Reads `<spirit>/spirit.json` (its Blender file, the sheet's background,
the lights) and `<spirit>/sheet.json` ("hero": the isometric camera, from
sweep_score.py). Writes `<spirit>/renders/<view>.png` (orthographic, on the
sheet's background), `game.png` (the game's 30° camera, the isometric
render's turn) and `game-size.png` (about the size the arena draws it).
"""
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SPIRIT = sys.argv[sys.argv.index("--") + 1]
HERE = Path(__file__).resolve().parent.parent / SPIRIT
CONFIG = json.loads((HERE / "spirit.json").read_text())
OUT = Path(os.environ["SWEEP"]) if os.environ.get("SWEEP") else HERE / "renders"
OUT.mkdir(parents=True, exist_ok=True)


def linear(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)


def from_turn(degrees, elevation=0.0):
    """The camera's direction from the spirit: `degrees` round from its front (negative: toward its right), `elevation` up."""
    t, e = math.radians(degrees), math.radians(elevation)
    return Vector((math.sin(t) * math.cos(e), -math.cos(t) * math.cos(e), math.sin(e)))


bpy.ops.wm.open_mainfile(filepath=str(HERE / CONFIG["blend"]))
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 470
scene.render.resolution_y = 500
if not os.environ.get("SWEEP") and "resolution" in CONFIG:
    scene.render.resolution_x, scene.render.resolution_y = CONFIG["resolution"]
world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (*linear(CONFIG["background"]), 1)
scene.world = world
if "ambient" in CONFIG:
    # Light sheets should not turn into an equally bright environment
    # light. Keep the camera background while lighting with a dim world.
    nodes, links = world.node_tree.nodes, world.node_tree.links
    backdrop = nodes["Background"]
    ambient = nodes.new("ShaderNodeBackground")
    ambient.inputs["Color"].default_value = backdrop.inputs["Color"].default_value
    ambient.inputs["Strength"].default_value = CONFIG["ambient"]
    rays = nodes.new("ShaderNodeLightPath")
    mixed = nodes.new("ShaderNodeMixShader")
    links.new(rays.outputs["Is Camera Ray"], mixed.inputs[0])
    links.new(ambient.outputs["Background"], mixed.inputs[1])
    links.new(backdrop.outputs["Background"], mixed.inputs[2])
    links.new(mixed.outputs[0], nodes["World Output"].inputs["Surface"])
# A key from the upper left front, a fill from behind, a rim from behind and below.
for name, rotation in (("sun", (40, 0, -35)), ("fill", (70, 0, 150)), ("rim", (-110, 0, 20))):
    energy, color = CONFIG["lights"][name]
    light = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
    light.data.energy = energy
    light.data.color = color
    light.rotation_euler = tuple(math.radians(a) for a in rotation)
    scene.collection.objects.link(light)
# A soft glow round what glows (the sheets draw one).
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
camera.data.ortho_scale = CONFIG["ortho"]
scene.collection.objects.link(camera)
scene.camera = camera
target = Vector((0, 0, 0.36))
hero = json.loads((HERE / "sheet.json").read_text()).get("hero", {"turn": -35, "elevation": 15})

if os.environ.get("SWEEP"):
    start, stop, step = CONFIG["sweep"]["turns"]
    VIEWS = {f"sweep{d}_{e}": from_turn(d, e) for d in range(start, stop + 1, step) for e in CONFIG["sweep"]["elevations"]}
else:
    VIEWS = {
        "front": Vector((0, -1, 0)),
        "back": Vector((0, 1, 0)),
        "left": Vector((-1, 0, 0)),  # its front on the image's right, as the sheet's LEFT view
        "right": Vector((1, 0, 0)),  # its front on the image's left, as the sheet's RIGHT view
        "top": Vector((0, 0.0001, 1)),  # its front at the bottom
        "bottom": Vector((0, 0.0001, -1)),
        "hero": from_turn(hero["turn"], hero["elevation"]),
        "game": from_turn(hero["turn"], 30),
    }
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

if not os.environ.get("SWEEP"):
    # About the size the arena draws it, on the floor's color.
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.25, 0.2, 1)
    scene.render.resolution_x = 30
    scene.render.resolution_y = 32
    camera.data.ortho_scale = 0.9
    direction = from_turn(hero["turn"], 30).normalized()
    camera.location = target + direction * 4
    camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(OUT / "game-size.png")
    bpy.ops.render.render(write_still=True)
print("rendered", ", ".join(VIEWS))
