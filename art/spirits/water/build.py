"""The water spirit: a faceted, low-poly water droplet with two glowing eyes and a floating nub.

Everything comes from its character sheet (reference/, the crops of
`sheet.png`), measured by sheet.py into sheet.json: each ring of the body
takes its four extents from the sheet's outlines at that height (left and
right from the front view, front and back from the side view), so the
body's asymmetries, the cap's back curving in toward the nub included,
are the sheet's own. The nub and the eyes are where the sheet shows them;
colors are the sheet's swatches.

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

import json

SHEET = json.loads((HERE / "sheet.json").read_text())
# The sheet: about 0.6 m tall with its nub; the body alone is 157 of those 190 pixels.
BODY = 0.6 * 157 / 190
HOVER = 0.06  # the body's underside above the floor at rest
# Rings at these heights (body heights), taking the sheet's outline there.
RINGS = [0.02, 0.06, 0.12, 0.2, 0.3, 0.4, 0.5, 0.59, 0.67, 0.75, 0.83, 0.91]
UNDERSIDE = 0.03  # the underside's middle, above its rim (slightly concave)
SEGMENTS = 10
JITTER = 0.02  # random radial unevenness, for facets that look cut, not turned

# Eyes: the front view's size and spacing, placed symmetric on its face (the
# sheet's front view is turned a little, so one eye sits off to the side).
# Their height follows the isometric hero view, the game's camera: there
# they sit at 31% and 23% of the silhouette's height, which this model only
# shows with the eyes at 41% of the body's height. The sheet's front view
# draws them at 26%: its isometric and front views disagree (see README).
FRONT_EYES = SHEET["front"]["eyes"]
EYE_HEIGHT = 0.41
EYE_SIZE = (sum(e["width"] for e in FRONT_EYES) / len(FRONT_EYES) * 1.05, sum(e["tall"] for e in FRONT_EYES) / len(FRONT_EYES))
EYE_APART = abs(FRONT_EYES[0]["offset"] - FRONT_EYES[1]["offset"])  # between centers, as the front view shows them


def extents(view, z):
    """The sheet's outline at height `z` in `view`: (low edge, high edge), in body heights from its base's middle."""
    rows = SHEET[view]["outline"]
    below = max((r for r in rows if r[0] <= z), key=lambda r: r[0], default=rows[0])
    above = min((r for r in rows if r[0] >= z), key=lambda r: r[0], default=rows[-1])
    t = 0 if above[0] == below[0] else (z - below[0]) / (above[0] - below[0])
    return below[1] + (above[1] - below[1]) * t, below[2] + (above[2] - below[2]) * t


def ring_point(z, a):
    """The body's surface at height `z`, `a` radians round from its front (toward its left): four quarter-ellipses through the sheet's extents."""
    right, left = extents("front", z)  # front view: screen left is its right (-X)
    back, front = extents("side", z)  # side view: its front is on screen right (-Y)
    x = math.sin(a) * (left if math.sin(a) > 0 else -right)
    y = -math.cos(a) * (front if math.cos(a) > 0 else -back)
    return Vector((x, y, z))


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
    t = 0.75 * t + 0.5 * height + rng.uniform(-0.12, 0.12) - 0.27
    t = max(0.0, min(1.0, t))
    deep, base, mid, bright = (linear(COLORS[k]) for k in ("deep", "base", "mid", "light"))
    if t < 0.3:
        return mix(deep, base, t / 0.3)
    return mix(base, mid, (t - 0.3) / 0.4) if t < 0.7 else mix(mid, bright, (t - 0.7) / 0.3)


def loft(bm, rng):
    """The body: rings through the sheet's outlines, each turned half a segment from the last (triangular facets), a little uneven."""
    rings = []
    for i, z in enumerate(RINGS):
        turn = (i % 2) * math.pi / SEGMENTS
        ring = []
        for k in range(SEGMENTS):
            p = ring_point(z, 2 * math.pi * k / SEGMENTS + turn)
            p.x *= 1 + rng.uniform(-JITTER, JITTER)
            p.y *= 1 + rng.uniform(-JITTER, JITTER)
            ring.append(bm.verts.new((p.x * BODY, p.y * BODY, (z + rng.uniform(-0.006, 0.006)) * BODY + HOVER)))
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
    # The tip: where the sheet's outlines close at the top.
    right, left = extents("front", 0.995)
    back, front = extents("side", 0.995)
    tip = bm.verts.new((((right + left) / 2) * BODY, -((back + front) / 2) * BODY, BODY + HOVER))
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
    """A tall glowing oval: a thin flat plate, upright, facing straight ahead (both eyes alike).

    Its front is set just in front of the body's surface at every point of
    its outline (cast from in front), so it never sinks into the facets or
    tilts with them: straight from the front, whole from above.
    """
    facing = Vector((0, -1, 0))
    across = Vector((1, 0, 0))
    up = Vector((0, 0, 1))
    center = Vector((side * EYE_APART / 2 * BODY, 0, EYE_HEIGHT * BODY + HOVER))
    w, h = EYE_SIZE[0] / 2 * BODY, EYE_SIZE[1] / 2 * BODY
    outline = [(math.cos(t) * w, math.sin(t) * h) for t in (2 * math.pi * k / 12 for k in range(12))]
    # How far forward the surface comes anywhere under the oval.
    reach = -1.0
    for x, y in outline + [(0, 0)]:
        found, _, _, _ = tree.ray_cast(center + across * x + up * y + facing * 1.0, -facing)
        if found is not None:
            reach = max(reach, -found.y)
    front = Vector((center.x, -(reach + 0.002), center.z))
    back = front - facing * 0.025
    front_ring = [bm.verts.new(front + across * x + up * y) for x, y in outline]
    back_ring = [bm.verts.new(back + across * x + up * y) for x, y in outline]
    bm.faces.new(front_ring)
    bm.faces.new(back_ring[::-1])
    for k in range(12):
        j = (k + 1) % 12
        bm.faces.new((front_ring[k], front_ring[j], back_ring[j], back_ring[k]))


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(7)
    collection = bpy.context.scene.collection

    # Body and eyes: one mesh, two materials.
    bm = bmesh.new()
    loft(bm, rng)
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
    nub_spec = {"radius": (SHEET["front"]["nub"]["radius"] + SHEET["side"]["nub"]["radius"]) / 2,
                "height": (SHEET["front"]["nub"]["height"] + SHEET["side"]["nub"]["height"]) / 2}
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=nub_spec["radius"] * BODY)
    bm.normal_update()
    nub_mesh = bpy.data.meshes.new("Nub")
    bm.to_mesh(nub_mesh)
    bm.free()
    for poly in nub_mesh.polygons:
        poly.use_smooth = False
    color_faces(nub_mesh, rng, lambda p: 1.05 + p.z / (nub_spec["radius"] * BODY) * 0.3)
    nub_mesh.materials.append(mesh.materials[0])
    nub = bpy.data.objects.new("Nub", nub_mesh)
    # Where the sheet shows it: over the tip, behind it (front view offset to its right, side view offset back).
    nub.location = (SHEET["front"]["nub"]["offset"] * BODY, -SHEET["side"]["nub"]["offset"] * BODY, nub_spec["height"] * BODY + HOVER)
    nub.parent = body
    collection.objects.link(nub)

    tris = sum(len(p.vertices) - 2 for m in (mesh, nub_mesh) for p in m.polygons)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "water-spirit.blend"))
    print(f"built: {tris} triangles; eyes at {EYE_HEIGHT:.3f}, {EYE_APART:.3f} apart, {EYE_SIZE[0]:.3f} × {EYE_SIZE[1]:.3f}")


build()
