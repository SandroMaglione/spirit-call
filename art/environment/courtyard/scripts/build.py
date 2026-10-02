"""Author the courtyard kit. Existing sources require explicit replacement.

Blender --background --python scripts/build.py [-- --replace-generated]
Manual edits can be exported without running this generator again.
"""
import argparse
import copy
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--replace-generated", action="store_true")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
destination = ROOT / "source/courtyard.blend"
if destination.exists() and not args.replace_generated:
    raise SystemExit("Source exists. Export manual edits directly, or explicitly pass --replace-generated.")
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Courtyard sample | editable sources"
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1


def linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def color(hex_color):
    return tuple(linear(int(hex_color[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1,)


PALETTE = {key: color(value) for key, value in {
    "stone": "A7A497", "light": "BDB8A7", "edge": "CCC3AD", "shadow": "8C9088",
    "moss": "697763", "jade": "6F9690", "clay": "617F7A", "clay_light": "7F9990",
    "clay_dark": "435C5B", "bronze": "B7A17A", "inside": "344344",
    "rock": "858B80", "rock_light": "9CA18F", "rock_dark": "6E786F",
    "crystal": "77BDB4", "crystal_light": "ABDCD0", "crystal_dark": "43877F",
    "gold": "CAA15B", "gold_light": "E3BF7D", "gold_dark": "93713F",
}.items()}
material = bpy.data.materials.new("Courtyard | vertex palette")
material.use_nodes = True
material.use_backface_culling = True
shader = material.node_tree.nodes.get("Principled BSDF")
shader.inputs["Roughness"].default_value = 0.87
shader.inputs["Specular IOR Level"].default_value = 0.25
attribute = material.node_tree.nodes.new("ShaderNodeVertexColor")
attribute.layer_name = "Color"
material.node_tree.links.new(attribute.outputs["Color"], shader.inputs["Base Color"])


class Mesh:
    def __init__(self):
        self.vertices, self.faces, self.colors = [], [], []

    def shell(self, rings, shades, bottom=True, top=True):
        """Closed bevelled courses and turned pottery, with explicit flat faces."""
        start = len(self.vertices)
        count = len(rings[0])
        self.vertices.extend(v for ring in rings for v in ring)
        if bottom:
            self.faces.append(tuple(start + i for i in reversed(range(count))))
            self.colors.append(shades[0])
        for row in range(len(rings) - 1):
            for i in range(count):
                j = (i + 1) % count
                self.faces.append((start + row * count + i, start + row * count + j,
                                   start + (row + 1) * count + j, start + (row + 1) * count + i))
                shade = shades[min(row, len(shades) - 1)]
                self.colors.append(shade)
        if top:
            self.faces.append(tuple(start + (len(rings) - 1) * count + i for i in range(count)))
            self.colors.append(shades[-1])

    def block(self, x, y, width, depth, z, height, bevel, shades, taper=1):
        def ring(w, d, corner, elevation):
            return [(x + px, y + py, elevation) for px, py in [
                (-w / 2 + corner, -d / 2), (w / 2 - corner, -d / 2),
                (w / 2, -d / 2 + corner), (w / 2, d / 2 - corner),
                (w / 2 - corner, d / 2), (-w / 2 + corner, d / 2),
                (-w / 2, d / 2 - corner), (-w / 2, -d / 2 + corner),
            ]]
        self.shell([
            ring(width - bevel, depth - bevel, bevel * 0.6, z),
            ring(width, depth, bevel, z + bevel / 2),
            ring(width * taper, depth * taper, bevel, z + height - bevel / 2),
            ring(width * taper - bevel, depth * taper - bevel, bevel * 0.6, z + height),
        ], shades)

    def lathe(self, profile, shades, count=16):
        rings = [[(radius * math.cos(2 * math.pi * i / count),
                   radius * math.sin(2 * math.pi * i / count), z) for i in range(count)]
                 for radius, z in profile]
        self.shell(rings, shades)

    def finish(self, name, location, purpose, footprint):
        data = bpy.data.meshes.new(name)
        data.from_pydata(self.vertices, [], self.faces)
        data.update()
        data.materials.append(material)
        colors = data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
        for face, shade in zip(data.polygons, self.colors):
            for index in face.loop_indices:
                colors.data[index].color = PALETTE[shade]
        data.color_attributes.active_color = colors
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        obj["asset_id"] = name
        obj["purpose"] = purpose
        obj["footprint_m"] = footprint
        obj["origin_note"] = "Ground center" if name != "paving-plain" else "Top center; walking surface Y=0 in GLB"
        return obj


pillar = Mesh()
pillar.block(0, 0, 1, 1, 0, 0.17, 0.07, ["shadow", "stone", "edge"])
pillar.block(0, 0, 0.85, 0.85, 0.17, 0.13, 0.045, ["stone", "light", "edge"])
pillar.block(0, 0, 0.70, 0.70, 0.30, 0.46, 0.045, ["shadow", "stone", "light"], taper=0.97)
pillar.block(0, 0, 0.68, 0.68, 0.765, 0.47, 0.035, ["shadow", "stone", "light"], taper=0.97)
pillar.block(0, 0, 0.66, 0.66, 1.24, 0.33, 0.04, ["shadow", "stone", "light"])
pillar.block(0, 0, 0.79, 0.79, 1.57, 0.12, 0.045, ["stone", "light", "edge"])
pillar.block(0, 0, 0.98, 0.98, 1.69, 0.17, 0.065, ["shadow", "stone", "edge"])
pillar.block(0, 0, 0.84, 0.84, 1.86, 0.035, 0.018, ["light", "light", "light"])
# A broad inset-shaped jade accent, repeated front/back so rotation remains useful.
for sign in (-1, 1):
    pillar.block(0, sign * 0.341, 0.13, 0.016, 0.88, 0.22, 0.007, ["jade"])
    pillar.block(0, sign * 0.344, 0.035, 0.02, 0.82, 0.04, 0.006, ["bronze"])
# Flat moss islands stay on the cap instead of making the whole stone noisy.
island = [(-0.35, 0.13), (-0.26, 0.10), (-0.13, 0.15), (-0.12, 0.24),
          (-0.04, 0.28), (-0.09, 0.34), (-0.25, 0.36), (-0.35, 0.28)]
pillar.shell([[(x, y, z) for x, y in island] for z in (1.896, 1.899)], ["moss"])
pillar.finish("pillar-large", (-1.65, 0, 0), "solid-obstacle", [1, 1])

paving = Mesh()
# The top lies at zero. The slab sits below the simulation ground plane.
# Four broad flags share a two-meter module; joints do not create raised lips.
paving.block(0, 0, 2, 2, -0.14, 0.10, 0.035, ["shadow"])
for x, y, shade in [(-0.50, -0.50, "stone"), (0.50, -0.50, "light"),
                     (-0.50, 0.50, "light"), (0.50, 0.50, "stone")]:
    paving.block(x, y, 0.98, 0.98, -0.065, 0.065, 0.018, ["shadow", shade, shade])
paving.finish("paving-plain", (0, 0, 0.14), "ground-decoration", [2, 2])

urn = Mesh()
# The profile turns inward over the lip and down to a real interior floor.
# This gives the top-down camera a visible opening without double-sided tricks.
urn.lathe([(0.19, 0), (0.22, 0.045), (0.22, 0.10), (0.20, 0.135),
           (0.30, 0.23), (0.355, 0.40), (0.32, 0.55), (0.23, 0.64),
           (0.20, 0.69), (0.24, 0.705), (0.24, 0.755), (0.205, 0.775),
           (0.175, 0.75), (0.175, 0.71), (0.19, 0.65), (0.27, 0.55),
           (0.30, 0.40), (0.245, 0.245), (0.12, 0.18)],
          ["clay_dark", "bronze", "clay_dark", "clay", "clay", "clay_light",
           "clay", "clay_dark", "bronze", "bronze", "bronze", "bronze",
           "inside", "inside", "inside", "inside", "inside", "inside"])
# Two solid, angular ceramic lugs give the silhouette a recognizable shoulder.
for sign in (-1, 1):
    urn.block(sign * 0.327, 0, 0.115, 0.13, 0.40, 0.16, 0.025, ["clay_dark", "clay", "clay_light"])
# Small front emblem, readable as a mark rather than a separate collectible.
urn.block(0, -0.34, 0.13, 0.035, 0.35, 0.14, 0.012, ["bronze"])
urn.block(0, -0.36, 0.055, 0.008, 0.39, 0.06, 0.003, ["clay_dark"])
urn.finish("urn-jade", (1.65, 0, 0), "edge-decoration", [0.769, 0.719])


def solid(obj, boxes):
    """Footprints are delivery metadata; the renderer never creates simulation walls."""
    obj["collision_json"] = json.dumps({"kind": "boxes", "boxes": boxes})


def box_footprint(width, depth, center=(0, 0)):
    # Blender x/y becomes glTF x/-z.
    return {"center_xz_m": [center[0], -center[1]], "size_xz_m": [width, depth]}


for name, size, chipped in [
    ("pillar-large-chipped", 1, True),
    ("pillar-small", 5 / 7, False),
    ("pillar-small-chipped", 5 / 7, True),
]:
    variant = copy.deepcopy(pillar)
    if chipped:
        # Pinch the outer corner of the capital while keeping every base vertex.
        # The same closed rings survive, so no thin triangles or open holes appear.
        for i, (x, y, z) in enumerate(variant.vertices):
            if z >= 1.69 and x > 0.3 and y < -0.3:
                variant.vertices[i] = (x - 0.10, y + 0.075, z - (0.07 if z > 1.75 else 0))
        for i, face in enumerate(variant.faces):
            if any(variant.vertices[v][0] > 0.25 and variant.vertices[v][1] < -0.25
                   and variant.vertices[v][2] > 1.69 for v in face):
                variant.colors[i] = "shadow"
    variant.vertices = [(x * size, y * size, z * (0.78 if size < 1 else 1))
                        for x, y, z in variant.vertices]
    obj = variant.finish(name, (0, 0, 0), "solid-obstacle", [size, size])
    solid(obj, [box_footprint(size, size)])
solid(scene.objects["pillar-large"], [box_footprint(1, 1)])


def wall_segment(mesh, x, y, width, depth, height):
    mesh.block(x, y, width, depth, 0, 0.12, 0.045, ["shadow", "stone", "light"])
    shaft_width, shaft_depth = max(width - 0.05, 0.1), max(depth - 0.10, 0.1)
    middle = (height - 0.25) / 2
    mesh.block(x, y, shaft_width, shaft_depth, 0.12, middle, 0.035, ["shadow", "stone", "light"])
    mesh.block(x, y, shaft_width, shaft_depth, 0.125 + middle, middle, 0.035, ["shadow", "stone", "light"])
    mesh.block(x, y, width, depth, height - 0.12, 0.12, 0.04, ["stone", "light", "edge"])


wall = Mesh()
wall_segment(wall, 0, 0, 2, 0.50, 0.95)
obj = wall.finish("wall-straight", (0, 0, 0), "boundary-obstacle", [2, 0.5])
solid(obj, [box_footprint(2, 0.5)])

corner = Mesh()
# Each arm is a two-meter module. Caps intersect at the corner, with no open end.
wall_segment(corner, 0, -0.75, 2, 0.5, 0.95)
wall_segment(corner, -0.75, 0.25, 0.5, 1.5, 0.95)
obj = corner.finish("wall-corner", (0, 0, 0), "boundary-obstacle", [2, 2])
solid(obj, [box_footprint(2, 0.5, (0, -0.75)), box_footprint(0.5, 1.5, (-0.75, 0.25))])
obj["origin_note"] = "Bounding-footprint center; L arms at X=-0.75 and Z=+0.75"

end = Mesh()
end.block(0, 0, 0.60, 0.60, 0, 0.14, 0.04, ["shadow", "stone", "edge"])
end.block(0, 0, 0.46, 0.46, 0.14, 0.79, 0.04, ["shadow", "stone", "light"])
end.block(0, 0, 0.60, 0.60, 0.93, 0.14, 0.045, ["stone", "light", "edge"])
end.block(0, -0.234, 0.10, 0.016, 0.57, 0.16, 0.006, ["jade"])
obj = end.finish("wall-end-cap", (0, 0, 0), "boundary-obstacle", [0.6, 0.6])
solid(obj, [box_footprint(0.6, 0.6)])

low = Mesh()
wall_segment(low, 0, 0, 2, 0.5, 0.38)
obj = low.finish("wall-low", (0, 0, 0), "boundary-obstacle", [2, 0.5])
solid(obj, [box_footprint(2, 0.5)])
obj["origin_note"] = "Ground center; lower visual for foreground boundary, not traversable cover"

# Shallow, narrow fissures remain below Y=0 after export. Small raised polygons
# would flicker against the floor; split one stone into two closed flag shapes.
cracked = Mesh()
cracked.block(0, 0, 2, 2, -0.14, 0.10, 0.035, ["shadow"])
for x, y, shade in [(0.50, -0.50, "light"), (-0.50, 0.50, "light"), (0.50, 0.50, "stone")]:
    cracked.block(x, y, 0.98, 0.98, -0.065, 0.065, 0.018, ["shadow", shade, shade])
left_flag = [(-0.98, -0.98), (-0.61, -0.98), (-0.49, -0.70), (-0.61, -0.45),
             (-0.39, -0.02), (-0.98, -0.02)]
right_flag = [(-0.59, -0.98), (-0.02, -0.98), (-0.02, -0.02), (-0.37, -0.02),
              (-0.59, -0.45), (-0.47, -0.70)]
for polygon in (left_flag, right_flag):
    cracked.shell([[(x, y, z) for x, y in polygon] for z in (-0.06, 0)], ["stone"])
obj = cracked.finish("paving-cracked", (0, 0, 0.14), "ground-decoration", [2, 2])
obj["origin_note"] = "Top center; walking surface Y=0 in GLB"

trim = Mesh()
trim.block(0, 0, 2, 0.35, -0.14, 0.14, 0.025, ["shadow", "stone", "edge"])
obj = trim.finish("paving-edge", (0, 0, 0.14), "ground-decoration", [2, 0.35])
obj["origin_note"] = "Top center; 2 m run along X, walking surface Y=0"


def rock(mesh, x, y, width, depth, height, phase):
    count = 7
    rings = []
    for radius, z, twist in [(0.78, 0, 0), (1, height * 0.28, 0), (0.74, height * 0.78, 0.14), (0.40, height, 0.18)]:
        rings.append([(x + width * radius * (1 + 0.09 * math.sin(i * 2.3 + phase)) * math.cos(i * math.tau / count + twist),
                       y + depth * radius * (1 + 0.10 * math.cos(i * 1.7 + phase)) * math.sin(i * math.tau / count + twist), z)
                      for i in range(count)])
    mesh.shell(rings, ["rock_dark", "rock", "rock_light"])


for name, pieces in [
    ("rocks-low", [(-0.20, 0, 0.37, 0.28, 0.30, 0), (0.24, 0.10, 0.23, 0.22, 0.22, 1), (0.30, -0.22, 0.16, 0.12, 0.12, 2)]),
    ("rocks-tall", [(0, 0.08, 0.38, 0.31, 0.73, 3), (-0.28, -0.16, 0.24, 0.20, 0.24, 4)]),
    ("rubble-stones", [(-0.31, -0.16, 0.18, 0.13, 0.16, 5), (0.12, 0.04, 0.24, 0.19, 0.20, 6),
                       (0.33, -0.24, 0.12, 0.12, 0.11, 7), (-0.12, 0.30, 0.15, 0.13, 0.12, 8)]),
]:
    mesh = Mesh()
    for values in pieces:
        rock(mesh, *values)
    width = max(v[0] for v in mesh.vertices) - min(v[0] for v in mesh.vertices)
    depth = max(v[1] for v in mesh.vertices) - min(v[1] for v in mesh.vertices)
    # Center the footprint so arbitrary rotations keep the documented pivot useful.
    cx = (max(v[0] for v in mesh.vertices) + min(v[0] for v in mesh.vertices)) / 2
    cy = (max(v[1] for v in mesh.vertices) + min(v[1] for v in mesh.vertices)) / 2
    mesh.vertices = [(x - cx, y - cy, z) for x, y, z in mesh.vertices]
    mesh.finish(name, (0, 0, 0), "edge-decoration", [width, depth])

brazier = Mesh()
brazier.block(0, 0, 0.48, 0.48, 0, 0.12, 0.04, ["shadow", "stone", "edge"])
brazier.lathe([(0.15, 0.12), (0.11, 0.20), (0.11, 0.64), (0.17, 0.69)], ["clay_dark", "clay_dark", "bronze"], 12)
brazier.lathe([(0.15, 0.65), (0.27, 0.72), (0.34, 0.87), (0.35, 0.91),
              (0.30, 0.92), (0.28, 0.86), (0.22, 0.77), (0.12, 0.73)],
             ["clay_dark", "clay_dark", "bronze", "bronze", "clay_dark", "inside", "inside"], 12)
obj = brazier.finish("brazier", (0, 0, 0), "edge-decoration", [0.7, 0.7])
obj["sockets_json"] = json.dumps({"flame": {"position_m": [0, 0.84, 0], "up": "+Y"}})

crystal = Mesh()
crystal.lathe([(0.06, 0), (0.24, 0.24), (0.22, 0.57), (0.012, 0.86)],
              ["crystal_dark", "crystal", "crystal_light"], 6)
# Alternating facets catch light without transparent sorting or bloom.
for i in range(len(crystal.colors)):
    if i % 4 == 0:
        crystal.colors[i] = "crystal_light"
crystal.finish("currency-crystal", (0, 0, 0), "reward-visual", [0.48, 0.48 * math.sqrt(3) / 2])

gold = Mesh()
# A broad octagonal token stands upright; two stepped faces keep the symbol legible.
gold.lathe([(0.26, 0), (0.29, 0.02), (0.29, 0.075), (0.26, 0.095)], ["gold_dark", "gold", "gold_light"], 8)
gold.lathe([(0.21, 0.095), (0.205, 0.108)], ["gold_light"], 8)
gold.block(0, 0, 0.13, 0.13, 0.108, 0.008, 0.013, ["gold_dark"])
gold.block(0, 0, 0.07, 0.07, 0.116, 0.008, 0.009, ["gold_light"])
# Local cylinder Z becomes depth; the decorated side faces Blender -Y / glTF +Z.
gold.vertices = [(x, -z + 0.062, y + 0.29) for x, y, z in gold.vertices]
gold.finish("currency-gold", (0, 0, 0), "reward-visual", [0.58, 0.124])

# Arrange the editable library as families. These display offsets never export.
order = ["pillar-large", "pillar-large-chipped", "pillar-small", "pillar-small-chipped",
         "wall-straight", "wall-corner", "wall-end-cap", "wall-low",
         "paving-plain", "paving-cracked", "paving-edge", "urn-jade",
         "rocks-low", "rocks-tall", "rubble-stones", "brazier", "currency-crystal", "currency-gold"]
for i, name in enumerate(order):
    obj = scene.objects[name]
    obj.location = ((i % 4 - 1.5) * 3, (2 - i // 4) * 3, 0.14 if obj["purpose"] == "ground-decoration" else 0)

# Save an immediately viewable scene. Studio objects never carry asset_id.
studio = bpy.data.collections.new("STUDIO | inspection only")
scene.collection.children.link(studio)
scene.world = bpy.data.worlds.new("Studio world")
scene.world.use_nodes = True
scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.55, 0.62, 0.70, 1)
scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.35
bpy.ops.mesh.primitive_plane_add(size=200)
ground = bpy.context.object
ground.name = "Studio floor"
scene.collection.objects.unlink(ground)
studio.objects.link(ground)
backdrop = bpy.data.materials.new("Studio | warm grey")
backdrop.use_nodes = True
backdrop.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (0.18, 0.195, 0.185, 1)
backdrop.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.9
ground.data.materials.append(backdrop)
for name, location, energy, size, tint in [
    ("Key", (-3, -4, 7), 850, 5, (1, 0.91, 0.77)),
    ("Fill", (4, -1, 5), 350, 4, (0.76, 0.87, 1)),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size, data.color = energy, "DISK", size, tint
    light = bpy.data.objects.new(name, data)
    studio.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0, 0, 0.5)) - light.location).to_track_quat("-Z", "Y").to_euler()
camera = bpy.data.objects.new("Inspection camera", bpy.data.cameras.new("Inspection camera"))
studio.objects.link(camera)
scene.camera = camera
camera.data.type, camera.data.ortho_scale = "ORTHO", 18
camera.location = (5, -16, 24)
camera.rotation_euler = (Vector((0, 0, 0.6)) - camera.location).to_track_quat("-Z", "Y").to_euler()
scene.render.engine = "CYCLES"
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1600, 1500
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "AgX"
scene.render.filepath = "//../previews/contact-sheet.png"
# Keep the editable objects selected when opening the file.
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if "asset_id" in obj:
        obj.select_set(True)
bpy.context.view_layer.objects.active = scene.objects["pillar-large"]

for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.shading.type = "MATERIAL"
            area.spaces.active.region_3d.view_distance = 20
            area.spaces.active.region_3d.view_location = (0, 0, 0.65)
            area.spaces.active.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
scene["authoring_axes"] = "Z up, -Y forward; glTF exporter converts to Y up, +Z forward"
scene["source_policy"] = "Editable source. export.py preserves manual edits; build.py regenerates only with explicit replacement."
destination.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(destination))
print("SOURCE_READY", destination)
