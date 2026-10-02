"""Render the saved models. Optional --crow PATH reads a reference without saving it.

No renderer or gameplay dependencies. Studio lighting is only for inspection.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--crow", type=Path)
parser.add_argument("--composition-only", action="store_true")
parser.add_argument("--asset")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(ROOT / "source/courtyard.blend"))
scene = bpy.context.scene
assets = {o["asset_id"]: o for o in scene.objects if "asset_id" in o}
if args.asset and args.asset not in assets:
    raise SystemExit(f"Unknown asset: {args.asset}")
# Recreate the inspection setup in memory, keeping the editable source intact.
for obj in list(scene.objects):
    if "asset_id" not in obj:
        bpy.data.objects.remove(obj, do_unlink=True)
scene.render.engine = "CYCLES"
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.render.image_settings.file_format = "PNG"
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new("Studio world")
scene.world.use_nodes = True
scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.55, 0.62, 0.70, 1)
scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.35
scene.view_settings.view_transform = "AgX"
scene.render.film_transparent = False


def matte(name, rgba):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = rgba
    mat.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.9
    return mat


bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "STUDIO | backdrop, excluded from exports"
floor.data.materials.append(matte("Studio | warm grey", (0.18, 0.195, 0.185, 1)))
for name, location, energy, size, tint in [
    ("Key", (-3, -4, 7), 850, 5, (1, 0.91, 0.77)),
    ("Fill", (4, -1, 5), 350, 4, (0.76, 0.87, 1)),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size, data.color = energy, "DISK", size, tint
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0, 0, 0.5)) - light.location).to_track_quat("-Z", "Y").to_euler()
camera = bpy.data.objects.new("Inspection camera", bpy.data.cameras.new("Inspection camera"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
preview_dir = ROOT / "previews"
preview_dir.mkdir(exist_ok=True)


def render(name, eye, target, scale, width=1400, height=900):
    camera.location = eye
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = scale
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.filepath = str(preview_dir / (name + ".png"))
    bpy.ops.render.render(write_still=True)


# Consistent scale across the lineup. Ground module remains at its actual depth.
if not args.composition_only:
    if not args.asset:
        labels = []
        for name, obj in assets.items():
            text = bpy.data.curves.new(name + " label", "FONT")
            text.body = name.replace("-", " ")
            text.size, text.align_x = 0.15, "CENTER"
            label = bpy.data.objects.new(name + " label", text)
            scene.collection.objects.link(label)
            label.location = (obj.location.x, obj.location.y - 1.25, 0.01)
            label.data.materials.append(matte("Label", (0.55, 0.59, 0.54, 1)))
            labels.append(label)
        render("contact-sheet", (0, -14, 23), (0, 0, 0.3), 16.7, 1700, 1700)
        render("top", (0, -0.001, 20), (0, 0, 0), 16.7, 1700, 1700)
        for label in labels:
            label.hide_render = True
    for name, obj in assets.items():
        if args.asset and args.asset != name:
            continue
        for other in assets.values():
            other.hide_render = other != obj
        original = obj.location.copy()
        obj.location = (0, 0, 0.14 if obj["purpose"] == "ground-decoration" else 0)
        low = min(v.co.z for v in obj.data.vertices)
        high = max(v.co.z for v in obj.data.vertices)
        width = max(v.co.x for v in obj.data.vertices) - min(v.co.x for v in obj.data.vertices)
        depth = max(v.co.y for v in obj.data.vertices) - min(v.co.y for v in obj.data.vertices)
        target = (0, 0, (low + high) / 2 + obj.location.z)
        scale = max(width, depth, high - low) * 1.7
        render(name, (3, -5, 3.5), target, scale, 900, 900)
        obj.location = original
if args.asset:
    raise SystemExit(0)
for obj in assets.values():
    obj.hide_render = True

# Repeated tiles and boundary modules give the kit a real ground context.
floor.location.z = -0.145
for x in (-3, -1, 1, 3):
    for y in (-3, -1, 1, 3):
        tile = assets["paving-cracked" if (x, y) in [(-3, 1), (1, -3)] else "paving-plain"].copy()
        scene.collection.objects.link(tile)
        tile.hide_render = False
        tile.location = (x, y, 0)


def place(name, x, y, rotation=0):
    obj = assets[name].copy()
    scene.collection.objects.link(obj)
    obj.hide_render = False
    obj.location = (x, y, 0)
    obj.rotation_euler.z = rotation
    return obj


for x in (-3, -1, 1, 3):
    if x != -3:
        place("wall-straight", x, 3.75)
    place("wall-low", x, -3.75)
for y in (-3, -1, 1):
    place("wall-straight", -3.75, y, math.pi / 2)
place("wall-corner", -3, 3, -math.pi / 2)
place("pillar-large", -2.2, 1.6)
place("pillar-large-chipped", 2.1, 1.6)
place("pillar-small", -2.2, -1.5)
place("pillar-small-chipped", 2.1, -1.5)
place("urn-jade", 3.0, 0.1)
place("brazier", 0, 3.0)
place("rocks-low", -3.0, 0)
place("rocks-tall", 3.3, 2.8)
place("rubble-stones", 3.2, -2.8)
reference_info = {"crow_included": False, "phone_camera_elevation_degrees": 30,
                  "phone_resolution": [390, 844], "phone_orthographic_scale": 12,
                  "source_sha256": hashlib.sha256((ROOT / "source/courtyard.blend").read_bytes()).hexdigest(),
                  "scope": "Art composition and scale proposal, not the migrated game camera or performance proof"}
if args.crow:
    # A GLB allows reference to the committed study without touching local blend edits.
    if args.crow.suffix.lower() == ".glb":
        before = set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(args.crow.resolve()))
        crow_objects = [obj for obj in scene.objects if obj not in before and obj.type == "MESH"]
    else:
        with bpy.data.libraries.load(str(args.crow.resolve()), link=False) as (available, requested):
            requested.collections = [name for name in available.collections if name == "CROW | editable character"]
        assert requested.collections and requested.collections[0], "Crow model collection not found"
        crow_objects = [obj for obj in requested.collections[0].all_objects if obj.type == "MESH" and not obj.hide_render]
        for obj in crow_objects:
            scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    coordinates = [obj.matrix_world @ v.co for obj in crow_objects for v in obj.data.vertices]
    low = min(v.z for v in coordinates)
    high = max(v.z for v in coordinates)
    scale = 0.95 / (high - low)
    for obj in crow_objects:
        # The study meshes are authored in a shared world coordinate system.
        transform = obj.matrix_world.copy()
        for v in obj.data.vertices:
            p = transform @ v.co
            v.co = ((p.x * scale) - 0.7, (p.y * scale) - 0.55, (p.z - low) * scale)
        obj.matrix_world.identity()
    reference_info.update({"crow_included": True, "crow_height_m": 0.95,
                          "crow_source_sha256": hashlib.sha256(args.crow.read_bytes()).hexdigest(),
                          "crow_source_name": args.crow.name,
                          "source_note": "External read-only crow reference; not included in the asset pack"})
render("courtyard-overview", (10, -15, 14), (0, 0, 0.3), 12.5, 1600, 1200)
# Thirty degrees above the ground, matching the old sprite bake as a reference.
target = Vector((0, 0, 0.3))
eye = target + Vector((4.5, -7.794228634, 5.196152423))
render("phone-scale", eye, target, 12.0, 390, 844)
(preview_dir / "render-info.json").write_text(json.dumps(reference_info, indent=2) + "\n")
print("PREVIEWS_READY", preview_dir)
