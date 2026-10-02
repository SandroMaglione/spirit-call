"""A character-only Death's Door study. Run with Blender 4.5 LTS.

blender --background --python-exit-code 1 --python art/characters/crow/build.py -- --views
The mesh is authored here; no imported game assets or generated images are used.
Front is -Y, up is +Z. The presentation stage is excluded from the GLB.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
args = argparse.ArgumentParser()
args.add_argument("--views", action="store_true")
args.add_argument("--turntable", action="store_true")
args.add_argument("--draft", action="store_true")
options = args.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
model = bpy.data.collections.new("CROW | editable character")
stage = bpy.data.collections.new("STUDIO | inspection only")
scene.collection.children.link(model)
scene.collection.children.link(stage)


def move_to(obj, collection):
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def material(name, color, roughness=0.8, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Specular IOR Level"].default_value = 0.16
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return mat


coal = material("Feathers | warm charcoal", (0.024, 0.021, 0.028))
wing_mat = material("Wings | charcoal", (0.019, 0.017, 0.022))
hood = material("Hood | slate grey", (0.115, 0.122, 0.145))
belly = material("Breast | muted grey", (0.135, 0.128, 0.139))
beak_mat = material("Beak | graphite", (0.071, 0.068, 0.078), 0.7)
feet_mat = material("Feet | dark graphite", (0.026, 0.023, 0.028))
eye_mat = material("Eyes | ivory", (0.88, 0.87, 0.76), 0.55, 0.18)
socket_mat = material("Eye sockets", (0.011, 0.009, 0.014))


def mesh(name, vertices, faces, mat, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    model.objects.link(obj)
    obj.data.materials.append(mat)
    for face in data.polygons:
        face.use_smooth = smooth
    # All closed authored shells get consistent outward normals.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


# Cross sections give the neck and body a continuous silhouette, without
# seams between stacked spheres. Units are arbitrary character-scale units.
SECTIONS = [
    (0.34, 0.27, 0.25, 0.07),
    (0.45, 0.43, 0.34, 0.06),
    (0.67, 0.53, 0.40, 0.05),
    (0.92, 0.53, 0.40, 0.04),
    (1.15, 0.43, 0.34, 0.02),
    (1.36, 0.32, 0.28, 0.015),
    (1.58, 0.245, 0.235, 0.015),
    (1.80, 0.245, 0.225, 0.0),
    (1.98, 0.285, 0.255, -0.015),
    (2.12, 0.34, 0.285, -0.015),
    (2.27, 0.335, 0.26, 0.0),
    (2.34, 0.24, 0.20, 0.01),
    (2.355, 0.10, 0.105, 0.01),
]
N = 48


vertices = []
for ring, (z, width, depth, center) in enumerate(SECTIONS):
    for i in range(N):
        a = 2 * math.pi * i / N
        zz = z - (0.07 * (0.5 + 0.5 * math.cos(a * 8)) if ring == 0 else 0)
        vertices.append((width * math.sin(a), center - depth * math.cos(a), zz))
faces = []
for ring in range(len(SECTIONS) - 1):
    for i in range(N):
        faces.append((ring * N + i, ring * N + (i + 1) % N,
                      (ring + 1) * N + (i + 1) % N, (ring + 1) * N + i))
faces += [tuple(reversed(range(N))), tuple((len(SECTIONS) - 1) * N + i for i in range(N))]
body = mesh("Body and head | continuous shell", vertices, faces, coal, True)


# Color belongs on the skin. The first draft used thin mesh patches, but
# oblique views exposed intersections. A tiny UV palette avoids that and
# exports to glTF without a Blender-specific shader or extra surface mesh.
uvs = body.data.uv_layers.new(name="Body palette")
z_min, z_max = 0.27, 2.355
for polygon in body.data.polygons:
    indices = [body.data.loops[i].vertex_index for i in polygon.loop_indices]
    seam = any(i % N == 0 for i in indices) and any(i % N == N - 1 for i in indices)
    for loop_index in polygon.loop_indices:
        i = body.data.loops[loop_index].vertex_index
        u = (i % N) / N
        if seam and u == 0:
            u = 1
        uvs.data[loop_index].uv = (u, (body.data.vertices[i].co.z - z_min) / (z_max - z_min))


def in_region(z, angle, rows, center):
    if not rows[0][0] <= z <= rows[-1][0]:
        return False
    distance = abs((angle - center + math.pi) % (2 * math.pi) - math.pi)
    for (za, wa), (zb, wb) in zip(rows, rows[1:]):
        if za <= z <= zb:
            width = wa + (wb - wa) * (z - za) / (zb - za)
            scallop = 0.045 * (0.5 + 0.5 * math.cos(distance / rows[0][1] * math.pi * 5))
            return distance <= width and z >= rows[0][0] + scallop
    return False


breast_rows = [(0.60, 0.50), (0.70, 0.77), (0.90, 0.80),
               (1.12, 0.67), (1.27, 0.36), (1.31, 0.07)]
hood_rows = [(1.19, 0.83), (1.36, 1.60), (1.58, 2.00),
             (1.81, 2.13), (1.98, 1.95), (2.105, 1.10)]
palette = bpy.data.images.new("Crow palette | authored color regions", width=512, height=512)
palette.colorspace_settings.name = "sRGB"


def srgb(linear):
    return 12.92 * linear if linear <= 0.0031308 else 1.055 * linear ** (1 / 2.4) - 0.055


colors = {mat.name: tuple(srgb(c) for c in mat.diffuse_color[:3]) + (1,)
          for mat in (coal, belly, hood)}
pixels = []
for y in range(512):
    z = z_min + (y + 0.5) / 512 * (z_max - z_min)
    for x in range(512):
        angle = (x + 0.5) / 512 * 2 * math.pi
        mat = belly if in_region(z, angle, breast_rows, 0) else (
            hood if in_region(z, angle, hood_rows, math.pi) else coal)
        pixels.extend(colors[mat.name])
palette.pixels.foreach_set(pixels)
palette.filepath_raw = str(ROOT / "body-palette.png")
palette.file_format = "PNG"
palette.save()
palette.pack()
body_material = coal.copy()
body_material.name = "Body | UV palette"
texture = body_material.node_tree.nodes.new("ShaderNodeTexImage")
texture.image = palette
body_material.node_tree.links.new(texture.outputs["Color"],
    body_material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
body.data.materials[0] = body_material


def rounded_outline(points, steps=3):
    # Quadratic corner rounding keeps broad feather lobes, not sharp spikes.
    out = []
    for i, p in enumerate(points):
        before, after = Vector(points[i - 1]), Vector(points[(i + 1) % len(points)])
        p = Vector(p)
        a, b = p.lerp(before, 0.17), p.lerp(after, 0.17)
        for j in range(steps):
            t = j / (steps - 1)
            out.append((1 - t) ** 2 * a + 2 * (1 - t) * t * p + t * t * b)
    return out


for side, label in [(-1, "L"), (1, "R")]:
    # The closed wing is a shallow convex shell. Its lower silhouette is
    # authored as broad overlapping feather tips, not individual cylinders.
    outline = rounded_outline([
        (0.29, 1.52), (0.48, 1.35), (0.62, 1.08), (0.76, 0.66),
        (0.79, 0.39), (0.72, 0.32), (0.64, 0.41), (0.60, 0.31),
        (0.51, 0.30), (0.47, 0.41), (0.40, 0.35), (0.34, 0.43),
        (0.35, 0.69), (0.37, 1.00), (0.26, 1.30),
    ])
    verts = []
    # Front and back surfaces meet at their edge; inset rings create volume.
    center = Vector((0.48, 0.88))
    for k, inset in enumerate([0, 0.52, 0.93]):
        for p in outline:
            q = p.lerp(center, inset)
            y = -0.07 - (0.20 * math.sin(inset * math.pi / 2))
            verts.append((side * q.x, y, q.y))
    count = len(outline)
    fs = []
    for ring in range(2):
        for i in range(count):
            fs.append((ring * count + i, ring * count + (i + 1) % count,
                       (ring + 1) * count + (i + 1) % count, (ring + 1) * count + i))
    fs.append(tuple(2 * count + i for i in range(count)))
    rear_index = len(verts)
    for inset in [0.52, 0.93]:
        for p in outline:
            q = p.lerp(center, inset)
            verts.append((side * q.x, -0.07 + 0.37 * math.sin(inset * math.pi / 2), q.y))
    for i in range(count):
        j = (i + 1) % count
        fs.append((i, rear_index + i, rear_index + j, j))
        fs.append((rear_index + i, rear_index + count + i,
                   rear_index + count + j, rear_index + j))
    fs.append(tuple(rear_index + count + i for i in reversed(range(count))))
    mesh(f"Wing {label} | feather coat", verts, fs, wing_mat, True)

    # A modest rearward head tuft breaks the round skull silhouette.
    mesh(f"Nape feather {label}", [
        (side * 0.23, 0.09, 2.27), (side * 0.27, 0.31, 2.26),
        (side * 0.29, 0.34, 2.15), (side * 0.19, 0.25, 2.13),
        (side * 0.22, 0.19, 2.19),
    ], [(0, 1, 2, 3), (0, 4, 1), (1, 4, 2), (2, 4, 3), (3, 4, 0)], coal)


# A wedge with a gently hooked tip. Upper and lower planes remain readable.
beak_vertices = [
    (-0.18, -0.235, 2.145), (0.18, -0.235, 2.145),
    (-0.17, -0.36, 2.245), (0.17, -0.36, 2.245),
    (-0.115, -0.56, 2.18), (0.115, -0.56, 2.18),
    (0, -0.73, 2.09),
    (-0.12, -0.39, 2.065), (0.12, -0.39, 2.065),
    (0, -0.58, 2.09),
]
mesh("Beak | sculpted wedge", beak_vertices, [
    (0, 2, 3, 1), (2, 4, 5, 3), (4, 6, 5),
    (0, 7, 9, 6, 4, 2), (1, 3, 5, 6, 9, 8),
    (7, 8, 9), (0, 1, 8, 7),
], beak_mat)


def ellipsoid(name, location, scale, mat, normal=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=location)
    obj = move_to(bpy.context.object, model)
    obj.name = name
    obj.data.name = name
    obj.scale = scale
    if normal:
        obj.rotation_euler = Vector(normal).to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.select_set(False)
    return obj


for side, label in [(-1, "L"), (1, "R")]:
    normal = Vector((side * 0.77, -0.62, 0.10)).normalized()
    eye_center = Vector((side * 0.265, -0.187, 2.205))
    ellipsoid(f"Eye socket {label}", eye_center, (0.081, 0.090, 0.013), socket_mat, normal)
    ellipsoid(f"Eye {label} | ivory", eye_center + normal * 0.009,
              (0.067, 0.075, 0.014), eye_mat, normal)


def limb(name, points, radii, mat, sides=8):
    verts = []
    for i, point in enumerate(points):
        tangent = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(0, i - 1)])
        rotation = tangent.to_track_quat("Z", "Y")
        for j in range(sides):
            a = 2 * math.pi * j / sides
            offset = rotation @ Vector((radii[i] * math.cos(a), radii[i] * math.sin(a), 0))
            verts.append(Vector(point) + offset)
    fs = [tuple(reversed(range(sides)))]
    for i in range(len(points) - 1):
        for j in range(sides):
            fs.append((i * sides + j, i * sides + (j + 1) % sides,
                       (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j))
    fs.append(tuple((len(points) - 1) * sides + j for j in range(sides)))
    return mesh(name, verts, fs, mat, True)


for side, label in [(-1, "L"), (1, "R")]:
    x = side * 0.225
    limb(f"Leg {label}", [(x, 0.045, 0.48), (x, 0.08, 0.25), (x, 0.035, 0.075)],
         [0.057, 0.042, 0.038], feet_mat)
    for index, spread in enumerate([-0.105, 0, 0.105]):
        reach = -0.27 if index == 1 else -0.20
        limb(f"Foot {label} | toe {index + 1}",
             [(x, 0.03, 0.075), (x + spread * 0.55, reach * 0.52, 0.049),
              (x + spread, reach, 0.024), (x + spread * 1.06, reach - 0.03, 0.018)],
             [0.037, 0.029, 0.017, 0.003], feet_mat)
    limb(f"Foot {label} | rear toe", [(x, 0.04, 0.07), (x + side * 0.05, 0.17, 0.039),
         (x + side * 0.07, 0.205, 0.022)], [0.028, 0.019, 0.003], feet_mat)

# The short tail is largely hidden from the front but gives the rear volume.
for index, x in enumerate([-0.13, 0, 0.13]):
    limb(f"Tail feather {index + 1}", [(x, 0.27, 0.65), (x, 0.42, 0.47), (x, 0.46, 0.35)],
         [0.085, 0.06, 0.012], coal, 8)

# The first profile render looked too stretched. Compress the upper neck
# while preserving the head shape, feet, and lower body's proportions.
def compact_height(z):
    if z <= 1.35:
        return z
    if z < 1.98:
        return 1.35 + (z - 1.35) * 0.76
    return z - 0.1512


for obj in model.objects:
    if obj.type == "MESH":
        if obj.name.startswith("Eye"):
            obj.location.z = compact_height(obj.location.z)
        else:
            for vertex in obj.data.vertices:
                vertex.co.z = compact_height(vertex.co.z)

# Keep parts independently editable and reserve one root for later rigging.
root = bpy.data.objects.new("Crow | model root", None)
model.objects.link(root)
for obj in list(model.objects):
    if obj != root:
        obj.parent = root
root["reference"] = "Frits Olsen: https://folsen.artstation.com/projects/X1VJEw"
root["scope"] = "Character study only. No rig, weapon, game integration, or imported game mesh."

floor_mat = material("Studio floor | warm parchment", (0.31, 0.285, 0.245))
bpy.ops.mesh.primitive_plane_add(size=200)
floor = move_to(bpy.context.object, stage)
floor.name = "Studio floor"
floor.data.materials.append(floor_mat)
floor.select_set(False)


def aim(obj, at):
    obj.rotation_euler = (Vector(at) - obj.location).to_track_quat("-Z", "Y").to_euler()


def light(name, position, power, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    stage.objects.link(obj)
    obj.location = position
    aim(obj, (0, 0, 1.1))


light("Key | soft upper left", (-3.5, -4.5, 6), 420, 4, (1.0, 0.91, 0.80))
light("Fill | cool", (4, -1, 3.5), 180, 3, (0.75, 0.84, 1.0))
light("Rim | overhead rear", (1, 3, 5), 500, 3, (1.0, 0.91, 0.78))
scene.world = bpy.data.worlds.new("Studio ambient")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.40, 0.43, 0.48, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.35

camera_data = bpy.data.cameras.new("Inspection camera")
camera = bpy.data.objects.new("Inspection camera", camera_data)
stage.objects.link(camera)
scene.camera = camera
camera_data.type = "ORTHO"
camera_data.ortho_scale = 3.20


def camera_view(azimuth, elevation):
    a, e = math.radians(azimuth), math.radians(elevation)
    at = Vector((0, 0, 1.16))
    camera.location = at + Vector((6 * math.sin(a) * math.cos(e),
                                   -6 * math.cos(a) * math.cos(e), 6 * math.sin(e)))
    aim(camera, at)


scene.render.engine = "CYCLES"
scene.cycles.samples = 16 if options.draft else 48
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 640 if options.draft else 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "AgX"
scene.render.fps = 24
camera_view(35, 15)

# Open the blend in a useful material view, with the studio hidden only in
# the working viewport. It remains enabled for the render camera.
for obj in stage.objects:
    if obj.type != "CAMERA":
        obj.hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.shading.type = "MATERIAL"
            space.region_3d.view_distance = 4.7
            space.region_3d.view_location = (0, 0, 1.15)
            space.region_3d.view_rotation = camera.rotation_euler.to_quaternion()

ROOT.joinpath("renders").mkdir(exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
for obj in model.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.export_scene.gltf(filepath=str(ROOT / "crow.glb"), use_selection=True,
                          export_format="GLB", export_animations=False, export_apply=True)
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "crow.blend"))
stats = {
    "blender": bpy.app.version_string,
    "mesh_objects": len([o for o in model.objects if o.type == "MESH"]),
    "vertices": sum(len(o.data.vertices) for o in model.objects if o.type == "MESH"),
    "triangles": sum(sum(len(p.vertices) - 2 for p in o.data.polygons)
                     for o in model.objects if o.type == "MESH"),
    "evaluated_triangles": sum(sum(len(p.vertices) - 2 for p in
        o.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.polygons)
        for o in model.objects if o.type == "MESH"),
    "rigged": False,
    "textured": True,
    "materials": "512px authored body palette; other parts use flat materials",
}
ROOT.joinpath("model-info.json").write_text(json.dumps(stats, indent=2) + "\n")
print("MODEL_STATS", json.dumps(stats))


def render(name):
    scene.render.filepath = str(ROOT / "renders" / (name + ".png"))
    bpy.ops.render.render(write_still=True)


if options.views:
    for name, azimuth, elevation in [
        ("hero", 35, 15), ("front", 0, 0), ("side", 90, 0),
        ("back", 180, 0), ("back-three-quarter", 145, 15), ("game-camera", 45, 30),
    ]:
        camera_view(azimuth, elevation)
        render(name)
elif not options.turntable:
    render("hero")

if options.turntable:
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.cycles.samples = 20
    for frame in range(72):
        # Orbit the camera around an unchanged model and fixed world lights.
        camera_view(35 + frame * 5, 15)
        render(f"turntable-{frame:03d}")
