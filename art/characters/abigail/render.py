"""Render review views of abigail.blend.

blender --background --python-exit-code 1 --python art/characters/abigail/render.py -- sheet
blender --background --python-exit-code 1 --python art/characters/abigail/render.py -- turn

`sheet`: front, side, and back orthographic views framed exactly like the
reference crops (reference/fetch.py), flat colors, for overlay.py.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from figure import METERS_PER_PIXEL, SHEET  # noqa: E402

mode = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "sheet"
bpy.ops.wm.open_mainfile(filepath=str(HERE / "abigail.blend"))
scene = bpy.context.scene
OUT = HERE / "renders"
OUT.mkdir(exist_ok=True)

# Pose the sheet's stance when the rig has one (arms as drawn).
rig = next((o for o in scene.objects if o.type == "ARMATURE"), None)
if rig is not None and "Sheet" in bpy.data.actions:
    rig.animation_data.action = bpy.data.actions["Sheet"]
    scene.frame_set(1)

scene.render.engine = "BLENDER_WORKBENCH"
shading = scene.display.shading
shading.light = "FLAT"
shading.color_type = "TEXTURE"
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"

camera_data = bpy.data.cameras.new("Review")
camera_data.type = "ORTHO"
camera = bpy.data.objects.new("Review", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera

# Crops from reference/fetch.py: (left, top, right, bottom) on the sheet.
CROPS = {"front": (560, 300, 1380, 2420), "side": (1440, 300, 1990, 2420), "back": (1990, 300, 2870, 2420)}
ground = SHEET["rows"][1]


def view(name, crop, position_of, rotation):
    left, top, right, bottom = crop
    width, height = right - left, bottom - top
    scene.render.resolution_x, scene.render.resolution_y = width // 2, height // 2
    camera_data.ortho_scale = max(width, height) * METERS_PER_PIXEL
    center_column = (left + right) / 2
    z = (ground - (top + bottom) / 2) * METERS_PER_PIXEL
    camera.location = position_of(center_column, z)
    camera.rotation_euler = rotation
    scene.render.filepath = str(OUT / f"sheet-{name}.png")
    bpy.ops.render.render(write_still=True)


if mode == "sheet":
    k = METERS_PER_PIXEL
    view("front", CROPS["front"], lambda c, z: Vector(((c - SHEET["front_center"]) * k, -5, z)), Euler((math.pi / 2, 0, 0)))
    view("side", CROPS["side"], lambda c, z: Vector((5, (c - SHEET["side_center"]) * k, z)), Euler((math.pi / 2, 0, math.pi / 2)))
    view("back", CROPS["back"], lambda c, z: Vector((-(c - SHEET["back_center"]) * k, 5, z)), Euler((math.pi / 2, 0, math.pi)))


def attach_sword(scale):
    """The crow's training blade at Abigail's scale, held in her grip as the game holds it."""
    bpy.ops.import_scene.gltf(filepath=str(HERE.parent / "crow/combat/training-blade.glb"))
    sword = bpy.context.selected_objects[0]
    while sword.parent is not None:
        sword = sword.parent
    sword.scale = (scale, scale, scale)
    sword.parent = rig
    sword.parent_type = "BONE"
    sword.parent_bone = "weapon_grip"
    # Bone parenting starts at the bone's tail; the grip is its head.
    sword.matrix_parent_inverse = Matrix.Translation((0, -rig.data.bones["weapon_grip"].length, 0))
    sword.location = (0, 0, 0)
    sword.rotation_mode = "XYZ"
    sword.rotation_euler = (-math.pi / 2, 0, 0)
    return sword


POSES = [("Idle", 1, "Guard"), ("Run", 1, "Run"), ("Run", 5, "Run"), ("Run", 9, "Run"),
         ("AttackCombo", 2, "Opening cut"), ("AttackCombo", 4, "Follow-through"), ("AttackCombo", 10, "Backhand"),
         ("AttackCombo", 12, "Backhand high"), ("AttackCombo", 17, "Thrust"), ("AttackCombo", 26, "Spin contact"),
         ("AttackCombo", 30, "Spinning"), ("AttackCombo", 40, "Settle"), ("Power", 2, "Power"), ("Dash", 4, "Dash")]

if mode in ("poses", "game"):
    from mathutils import Matrix
    import json as _json
    from figure import SWORD_SCALE
    attach_sword(SWORD_SCALE)
    shading.light = "STUDIO"
    shading.show_object_outline = False
    scene.display.shading.show_cavity = False
    scene.render.resolution_x, scene.render.resolution_y = (400, 520) if mode == "poses" else (220, 220)
    if mode == "poses":
        # A three-quarter view from the front-left, a little above.
        camera_data.ortho_scale = 2.0
        camera.location = (-3.2, -4.0, 2.6)
        direction = Vector((0, 0, 0.85)) - camera.location
    else:
        # The game's camera: 30° down, 45° around (see docs/models.md).
        camera_data.ortho_scale = 2.4
        camera.location = Vector((4, -4, 4 * math.sqrt(2) * math.tan(math.radians(30)))) + Vector((0, 0, 0.8))
        direction = Vector((0, 0, 0.8)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    for index, (action, frame, label) in enumerate(POSES):
        rig.animation_data.action = bpy.data.actions[action]
        scene.frame_set(frame)
        scene.render.filepath = str(OUT / f"pose-{index:02d}.png")
        bpy.ops.render.render(write_still=True)
    (OUT / "poses.json").write_text(_json.dumps([label for _, _, label in POSES]))
