"""The water spirit: a faceted, low-poly water droplet with two glowing eyes and a floating nub.

Everything is measured from its character sheet (reference/, the crops of
`sheet.png`): the body's profile is the front view's silhouette, row by row
(widths ÷ the body's height), its depth the side view's; the eyes' size,
height, and spacing from their white pixels; colors from the sheet's
swatches.

    blender --background --python-exit-code 1 --python art/spirits/water/build.py

Writes `water-spirit.blend`. Blender axes: it faces -Y, its left is +X, up
is +Z; meters; its origin on the floor under it (it hovers).
"""
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent

# The sheet: about 0.6 m tall with its nub; the body alone is 157 of those 190 pixels.
BODY = 0.6 * 157 / 190
HOVER = 0.06  # the body's underside above the floor at rest
DEPTH = 153 / 159  # the side view's widest over the front view's

# The body's profile, from its underside to its tip: (height, radius), both
# in body heights. Measured from the front view: widest a third of the way
# up, shoulders staying wide to the middle, then a taper to the tip; the
# underside is slightly concave (its middle higher than its rim).
PROFILE = [
    (0.0, 0.13), (0.03, 0.22), (0.075, 0.31), (0.14, 0.4), (0.22, 0.46), (0.32, 0.505),
    (0.43, 0.482), (0.54, 0.442), (0.645, 0.372), (0.74, 0.29), (0.83, 0.2), (0.915, 0.115),
]
TIP = 1.0
UNDERSIDE = 0.025  # the underside's middle, above its rim
SEGMENTS = 12
JITTER = 0.035  # random radial unevenness, for facets that look cut, not turned

# Eyes: tall ovals, 36° apart round its front, at 29% of its height.
EYE_HEIGHT = 0.29
EYE_APART = math.radians(36)
EYE_SIZE = (0.088, 0.19)  # width, height (body heights)
NUB_RADIUS = 0.098
NUB_HEIGHT = 1.134  # its center, above the body's underside

# The sheet's swatches.
COLORS = {"deep": "#1A5CE6", "base": "#2E7BFF", "mid": "#44B6FF", "light": "#8EEBFF", "highlight": "#E0F9FF", "eye": "#FFFFFF"}


def linear(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]


def mix(a, b, t):
    return [x + (y - x) * t for x, y in zip(a, b)]


def facet_color(normal, height, rng):
    """A facet's color: lighter facing up and toward the upper left front, deeper low down, each facet a little different."""
    light = Vector((-0.45, -0.55, 0.7)).normalized()
    t = 0.5 + 0.5 * normal.dot(light)
    # Strong contrast, like the sheet: deep blue low and away from the light, bright cyan high and toward it.
    t = 0.75 * t + 0.5 * height + rng.uniform(-0.12, 0.12) - 0.32
    t = max(0.0, min(1.0, t))
    deep, base, mid, bright = (linear(COLORS[k]) for k in ("deep", "base", "mid", "light"))
    if t < 0.3:
        return mix(deep, base, t / 0.3)
    return mix(base, mid, (t - 0.3) / 0.4) if t < 0.7 else mix(mid, bright, (t - 0.7) / 0.3)


def lathe(bm, rng):
    """The body: rings of the profile, each turned half a segment from the last (triangular facets), unevenly."""
    rings = []
    for i, (z, r) in enumerate(PROFILE):
        turn = (i % 2) * math.pi / SEGMENTS
        ring = []
        for k in range(SEGMENTS):
            a = 2 * math.pi * k / SEGMENTS + turn
            rr = r * (1 + rng.uniform(-JITTER, JITTER))
            zz = z + rng.uniform(-JITTER, JITTER) * 0.25 * (0.3 if i == 0 else 1)
            ring.append(bm.verts.new((rr * math.sin(a) * BODY, -rr * math.cos(a) * BODY * DEPTH, zz * BODY + HOVER)))
        rings.append(ring)
    # Bands between rings: two triangles per step, zigzagging with the half turn.
    for i in range(len(rings) - 1):
        lower, upper = rings[i], rings[i + 1]
        shifted = i % 2 == 0  # the upper ring sits half a step ahead
        for k in range(SEGMENTS):
            j = (k + 1) % SEGMENTS
            if shifted:
                bm.faces.new((lower[k], lower[j], upper[k]))
                bm.faces.new((upper[k], lower[j], upper[j]))
            else:
                bm.faces.new((lower[k], lower[j], upper[j]))
                bm.faces.new((lower[k], upper[j], upper[k]))
    tip = bm.verts.new((0, 0, TIP * BODY + HOVER))
    for k in range(SEGMENTS):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % SEGMENTS], tip))
    bottom = bm.verts.new((0, 0, UNDERSIDE * BODY + HOVER))
    for k in range(SEGMENTS):
        bm.faces.new((rings[0][(k + 1) % SEGMENTS], rings[0][k], bottom))


def color_faces(mesh, rng, height_of):
    """Flat colors per facet, as a corner color attribute (exported as vertex colors)."""
    attribute = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    for poly in mesh.polygons:
        c = facet_color(poly.normal, height_of(poly.center), rng)
        for loop in poly.loop_indices:
            attribute.data[loop].color = (*c, 1.0)


def material(name, color=None, emission=None, strength=1.0, vertex_colors=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.6  # semi-gloss, soft highlights
    bsdf.inputs["Specular IOR Level"].default_value = 0.12
    if vertex_colors:
        attribute = nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = "Color"
        m.node_tree.links.new(attribute.outputs["Color"], bsdf.inputs["Base Color"])
        # A soft inner glow: each facet glows a little in its own color.
        m.node_tree.links.new(attribute.outputs["Color"], bsdf.inputs["Emission Color"])
    elif color is not None:
        bsdf.inputs["Base Color"].default_value = (*linear(color), 1)
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*linear(emission), 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


def eye(bm, tree, side):
    """A tall glowing oval on the body's surface: cast onto the facet at its place, lying along it, standing out a hair."""
    a = side * EYE_APART / 2
    z = EYE_HEIGHT * BODY + HOVER
    out = Vector((math.sin(a), -math.cos(a) * DEPTH, 0)).normalized()
    hit, normal, _, _ = tree.ray_cast(Vector((0, 0, z)) + out * 1.0, -out)
    # Upright, facing straight out (not tilted with the facet it sits on).
    facing = Vector((normal.x, normal.y, 0)).normalized()
    across = Vector((0, 0, 1)).cross(facing).normalized()
    up = Vector((0, 0, 1))
    normal = facing
    center = hit + facing * 0.009
    made = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
    for v in made["verts"]:
        x, y, h = v.co.x, v.co.y, v.co.z
        v.co = center + across * x * EYE_SIZE[0] / 2 * BODY + up * h * EYE_SIZE[1] / 2 * BODY + normal * y * 0.007
    return made["verts"]


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(7)
    collection = bpy.context.scene.collection

    # Body and eyes: one mesh, two materials.
    bm = bmesh.new()
    lathe(bm, rng)
    body_faces = len(bm.faces)
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    for side in (-1, 1):
        eye(bm, tree, side)
    bm.normal_update()
    mesh = bpy.data.meshes.new("WaterSpirit")
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
        poly.material_index = 0 if poly.index < body_faces else 1
    color_faces(mesh, rng, lambda p: (p.z - HOVER) / BODY)
    water = material("Water", vertex_colors=True)
    water.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 0.6
    mesh.materials.append(water)
    mesh.materials.append(material("Eyes", color=COLORS["eye"], emission=COLORS["eye"], strength=6.0))
    body = bpy.data.objects.new("WaterSpirit", mesh)
    collection.objects.link(body)

    # The nub: a small faceted ball over the tip (its own object, to bob on its own).
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=NUB_RADIUS * BODY)
    bm.normal_update()
    nub_mesh = bpy.data.meshes.new("Nub")
    bm.to_mesh(nub_mesh)
    bm.free()
    for poly in nub_mesh.polygons:
        poly.use_smooth = False
    color_faces(nub_mesh, rng, lambda p: 1.05 + p.z / (NUB_RADIUS * BODY) * 0.3)
    nub_mesh.materials.append(mesh.materials[0])
    nub = bpy.data.objects.new("Nub", nub_mesh)
    nub.location = (0, 0, NUB_HEIGHT * BODY + HOVER)
    nub.parent = body
    collection.objects.link(nub)

    tris = sum(len(p.vertices) - 2 for m in (mesh, nub_mesh) for p in m.polygons)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "water-spirit.blend"))
    print(f"built: {tris} triangles, {BODY + HOVER + (NUB_HEIGHT - 1 + NUB_RADIUS) * BODY:.3f} m tall")


build()
