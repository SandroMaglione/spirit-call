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
parser.add_argument("--asset", choices=["pillar-large", "paving-plain", "urn-jade"])
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(ROOT / "source/courtyard.blend"))
scene = bpy.context.scene
assets = {o["asset_id"]: o for o in scene.objects if "asset_id" in o}
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
        render("contact-sheet", (5, -9, 7), (0, 0, 0.6), 6.2)
        render("top", (0, -0.001, 10), (0, 0, 0), 6.2, 1400, 700)
    for name, obj in assets.items():
        if args.asset and args.asset != name:
            continue
        for other in assets.values():
            other.hide_render = other != obj
        original = obj.location.copy()
        obj.location = (0, 0, 0.14 if name == "paving-plain" else 0)
        target = (0, 0, 0.8 if name == "pillar-large" else 0.25)
        scale = {"pillar-large": 2.7, "paving-plain": 3.4, "urn-jade": 1.35}[name]
        render(name, (3, -5, 3.5), target, scale, 900, 900)
        obj.location = original
if args.asset:
    raise SystemExit(0)
for obj in assets.values():
    obj.hide_render = False

# Repeated tiles test module seams and give the sample a real ground context.
assets["paving-plain"].hide_render = True
floor.location.z = -0.145
for x in (-1, 1):
    for y in (-1, 1):
        tile = assets["paving-plain"].copy()
        scene.collection.objects.link(tile)
        tile.hide_render = False
        tile.location = (x, y, 0)
assets["pillar-large"].location = (0.65, 0.6, 0)
assets["urn-jade"].location = (1.05, -0.85, 0)
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
render("courtyard-overview", (6, -9, 8), (0, 0, 0.4), 6.5)
# Thirty degrees above the ground, matching the old sprite bake as a reference.
target = Vector((0, 0, 0.3))
eye = target + Vector((4.5, -7.794228634, 5.196152423))
render("phone-scale", eye, target, 12.0, 390, 844)
(preview_dir / "render-info.json").write_text(json.dumps(reference_info, indent=2) + "\n")
print("PREVIEWS_READY", preview_dir)
