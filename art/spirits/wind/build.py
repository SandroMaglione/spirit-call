"""The wind spirit: a faceted, near-white ball with dark eyes, two leaves on top, a curling tendril on each side, and two leaves hanging under it.

Everything comes from its production sheet (reference/), measured by
sheet.py into sheet.json:

- The body is a faceted ball through the fitted ellipses: its width from
  the front view, its depth from the left view, its height from both.
- Each leaf is a faceted crystal blade from its base to its tip: across
  and height from the front view, front to back from the left view (the
  right view is drawn as its mirror image), as wide as the views draw it
  at each point. Seen from the front it is as wide as the front view, from
  the side as wide as the side view: its blade is turned between the two.
- Each tendril is a tapering faceted tube along its middle line: across
  from the front view, front to back from the left view's, height halfway
  between theirs, matched point by point from base to tip; rooted in the body's side
  (both views lose it where it crosses the body), thickest there, and
  narrowing to a point over its last half; a crescent blade, broad in the
  plane it curls in (as wide as the wider view draws it), thin across it.
- The eyes are dark ellipses laid on its surface (their own objects,
  `Eye.L` and `Eye.R`, to blink and look later), mirrored: the front view's
  two eyes averaged, about the body's middle.
- Every part is its own object with its origin at its base, to sway on its
  own. Colors are the sheet's swatches, one per facet: the body pale aqua
  to white, the leaves mint to teal.

    blender --background --python-exit-code 1 --python art/spirits/wind/build.py

Writes `wind-spirit.blend`. Blender axes: it faces -Y, its left is +X, up is
+Z; meters; its origin on the floor under it (it hovers).
"""
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
SHEET = json.loads((HERE / "sheet.json").read_text())
FRONT, SIDE = SHEET["front"], SHEET["left"]

UNIT = 0.60  # the whole figure, top leaf to the lowest leaf's tip (the sheet's H)
HOVER = 0.04  # the lowest leaf's tip above the floor at rest
BODY_SEGMENTS = 14
BODY_RINGS = 9
JITTER = 0.025
LEAF_RINGS = (0.1, 0.28, 0.46, 0.64, 0.8, 0.92)  # where a leaf's rings lie, from base to tip
TUBE_SIDES = 6
BLADE = 0.75  # a tendril's thickness across the plane it curls in, of its width
TAPER = 0.5  # a tendril narrows to its point over this share of its length
THICKNESS = 0.3  # a leaf's thickness, of its width
SINK = 0.12  # how far a leaf's base reaches into the body (share of its radius)
EYE_LIFT = 0.002
EYE_GROW = 1.0

COLORS = {"mint": "#8EE3C1", "teal": "#4CC7A7", "aqua": "#BFEFDF", "white": "#FFFFFF", "eye": "#2B3A36"}
LIGHT = Vector((-0.45, -0.6, 0.65)).normalized()  # the sheet's key light: upper left front

# The body: an ellipsoid round (0, 0, CENTER) with these half extents (m).
CENTER = (FRONT["body"]["height"] + SIDE["body"]["height"]) / 2 * UNIT + HOVER
HALF = Vector((FRONT["body"]["half_wide"], SIDE["body"]["half_wide"], (FRONT["body"]["half_tall"] + SIDE["body"]["half_tall"]) / 2)) * UNIT


def at(front_point, side_point):
    """A point from the front view's (across, height) and the side view's (forward, height), in meters: height from the front view."""
    return Vector((front_point[0] * UNIT, -side_point[0] * UNIT, front_point[1] * UNIT + HOVER))


def inside(p):
    """Where `p` lies against the body: below 1 inside it."""
    q = p - Vector((0, 0, CENTER))
    return (q.x / HALF.x) ** 2 + (q.y / HALF.y) ** 2 + (q.z / HALF.z) ** 2


def into_body(p, depth):
    """`p` moved straight toward the body's middle until it is `depth` (share of the radius) inside its surface."""
    center = Vector((0, 0, CENTER))
    q = p - center
    return center + q * ((1 - depth) / math.sqrt(inside(p)))


def linear(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]


def mix(a, b, t):
    return [x + (y - x) * t for x, y in zip(a, b)]


def lit(normal):
    return 0.5 + 0.5 * normal.dot(LIGHT)


def body_color(poly, rng):
    """White toward the light, pale aqua, a minty pale aqua away from it (the sheet's body is never grey), each facet a little different."""
    t = max(0.0, min(1.0, lit(poly.normal) + rng.uniform(-0.08, 0.08)))
    shade, aqua, white = mix(linear(COLORS["mint"]), linear(COLORS["aqua"]), 0.5), linear(COLORS["aqua"]), linear(COLORS["white"])
    return mix(shade, aqua, t / 0.45) if t < 0.45 else mix(aqua, white, min(1.0, (t - 0.45) / 0.4))


def leaf_color(poly, rng):
    """Teal facing away from the light, mint toward it, a touch of pale aqua on the brightest facets."""
    t = max(0.0, min(1.0, lit(poly.normal) + rng.uniform(-0.15, 0.15)))
    teal, mint, aqua = linear(COLORS["teal"]), linear(COLORS["mint"]), linear(COLORS["aqua"])
    return mix(teal, mint, t / 0.75) if t < 0.75 else mix(mint, aqua, (t - 0.75) / 0.25 * 0.4)


def color_faces(mesh, rng, color_of):
    attribute = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    for poly in mesh.polygons:
        c = color_of(poly, rng)
        for loop in poly.loop_indices:
            attribute.data[loop].color = (*c, 1.0)


def stitch(bm, rings, closed_start=None, closed_end=None):
    """Faces between rings (each turned half a step from the last), closed by a point at either end."""
    sides = len(rings[0])
    for i in range(len(rings) - 1):
        lower, upper = rings[i], rings[i + 1]
        for k in range(sides):
            j = (k + 1) % sides
            if i % 2 == 0:
                bm.faces.new((lower[k], lower[j], upper[k]))
                bm.faces.new((upper[k], lower[j], upper[j]))
            else:
                bm.faces.new((lower[k], lower[j], upper[j]))
                bm.faces.new((lower[k], upper[j], upper[k]))
    if closed_start is not None:
        for k in range(sides):
            bm.faces.new((rings[0][(k + 1) % sides], rings[0][k], closed_start))
    if closed_end is not None:
        for k in range(sides):
            bm.faces.new((rings[-1][k], rings[-1][(k + 1) % sides], closed_end))


def ball(bm, rng):
    """The body: rings of an ellipsoid from its bottom to its top, a little uneven."""
    rings = []
    for i in range(BODY_RINGS):
        polar = math.pi * (i + 1) / (BODY_RINGS + 1)
        turn = (i % 2) * math.pi / BODY_SEGMENTS
        ring = []
        for k in range(BODY_SEGMENTS):
            a = 2 * math.pi * k / BODY_SEGMENTS + turn
            r = 1 + rng.uniform(-JITTER, JITTER)
            ring.append(bm.verts.new((math.sin(a) * math.sin(polar) * HALF.x * r, -math.cos(a) * math.sin(polar) * HALF.y * r,
                                      CENTER - math.cos(polar) * HALF.z * (1 + rng.uniform(-JITTER, JITTER) / 2))))
        rings.append(ring)
    stitch(bm, rings, bm.verts.new((0, 0, CENTER - HALF.z)), bm.verts.new((0, 0, CENTER + HALF.z)))


def frames(points):
    """Each point's (tangent, normal, binormal), turning as little as they can along the line."""
    tangents = []
    for i in range(len(points)):
        a, b = points[max(0, i - 1)], points[min(len(points) - 1, i + 1)]
        tangents.append((b - a).normalized())
    normal = tangents[0].cross(Vector((0, 0, 1)))
    if normal.length < 1e-4:
        normal = tangents[0].cross(Vector((1, 0, 0)))
    normal.normalize()
    out = []
    for t in tangents:
        normal = (normal - t * normal.dot(t)).normalized()
        out.append((t, normal, t.cross(normal)))
    return out


def smooth(values):
    """Each value averaged with its neighbors (the ends kept)."""
    return [values[0]] + [(a + 2 * b + c) / 4 for a, b, c in zip(values, values[1:], values[2:])] + [values[-1]]


def capped(widths, start, stop):
    """The widths, none wider than the widest between shares `start` and `stop` of the way (where nothing else touches it)."""
    n = len(widths)
    top = max(widths[int(start * (n - 1)):int(stop * (n - 1)) + 1])
    return [min(w, top) for w in widths]


def leaf(bm, front_leaf, side_leaf, outward):
    """A crystal blade from base to tip, as wide as each view draws it; its blade turned so each view sees its own width. Returns its base."""
    base = into_body(at(front_leaf["base"], side_leaf["base"]), SINK)
    tip = at(front_leaf["tip"], side_leaf["tip"])
    axis = (tip - base).normalized()
    across_front = axis.cross(Vector((0, 1, 0))).normalized()  # across the leaf as the front view sees it
    across_side = axis.cross(Vector((1, 0, 0))).normalized()  # across the leaf as the side view sees it
    facing = Vector((outward, -1, 0)).normalized()
    # The blade's diagonal: the one whose face looks out toward the front and its own side, as the sheet's leaves do.
    candidates = [(across_front + across_side * s).normalized() for s in (1, -1)]
    blade = max(candidates, key=lambda u: abs(axis.cross(u).dot(facing)))
    front_widths = smooth(capped(front_leaf["widths"], 0.35, 0.9))
    side_widths = smooth(capped(side_leaf["widths"], 0.35, 0.9))
    shape = [(1.0, 0.0), (0.45, 0.8), (-0.45, 0.8), (-1.0, 0.0), (-0.45, -0.8), (0.45, -0.8)]
    normal = axis.cross(blade).normalized()
    shares = np.linspace(0, 1, len(front_widths))
    rings = []
    for f in LEAF_RINGS:
        wide = math.hypot(np.interp(f, shares, front_widths), np.interp(f, shares, side_widths)) / 2 * UNIT
        thick = wide * THICKNESS
        center = base + (tip - base) * f
        rings.append([bm.verts.new(center + blade * u * wide + normal * v * thick) for u, v in shape])
    stitch(bm, rings, bm.verts.new(base), bm.verts.new(tip))
    return base


def tendril(bm, front_line, side_line, front_widths, side_widths):
    """A horn along the middle line (front view across, side view depth, height halfway; point by point), rooted in the body's side. Returns its base."""
    points = [at((f[0], (f[1] + s[1]) / 2), s) for f, s in zip(front_line, side_line)]
    # Both views lose its root where it crosses the body: it grows from the body's side, level with its first point.
    side = math.copysign(1, points[0].x)
    root = Vector((side * HALF.x * 0.75, 0, points[0].z))
    base = into_body(root, 0.3)
    points = [base, into_body(root, 0.0)] + points[1:]
    widths = [max(a, b) for a, b in zip(front_widths, side_widths)]
    # Thickest at the body (where the views cannot see it), tapering to a point over its last stretch (where it curls,
    # the views' widths run along it).
    widths = [max(widths[i:]) for i in range(len(widths))]
    count = len(points)
    widths = [widths[0]] + [w * min(1.0, (1 - i / count) / TAPER) for i, w in enumerate(widths)]
    tip = points[-1] + (points[-1] - points[-2]) * 0.8
    # A crescent blade, not a tube: broad in the plane it curls in, thin across it.
    plane = Vector()
    for a, b, c in zip(points, points[1:], points[2:]):
        plane += (b - a).cross(c - b)
    plane.normalize()
    rings = []
    for i, (p, (t, _, _)) in enumerate(zip(points, frames(points))):
        broad = plane.cross(t).normalized()
        thin = t.cross(broad).normalized()
        radius = widths[i] / 2 * UNIT
        turn = (i % 2) * math.pi / TUBE_SIDES
        rings.append([bm.verts.new(p + (broad * math.cos(a) + thin * math.sin(a) * BLADE) * radius)
                      for a in (turn + 2 * math.pi * k / TUBE_SIDES for k in range(TUBE_SIDES))])
    stitch(bm, rings, bm.verts.new(base - (points[1] - base).normalized() * widths[0] / 2 * UNIT * 0.5), bm.verts.new(tip))
    return base


def material():
    """Its facets' colors, matte, glowing softly in their own colors."""
    m = bpy.data.materials.new("Wind")
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.8
    bsdf.inputs["Specular IOR Level"].default_value = 0.1
    colors = nodes.new("ShaderNodeVertexColor")
    colors.layer_name = "Color"
    links.new(colors.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(colors.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.3
    return m


def eye_material():
    m = bpy.data.materials.new("Eyes")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*linear(COLORS["eye"]), 1)
    bsdf.inputs["Roughness"].default_value = 0.3
    return m


def eye(tree, sheet_eye, eyes):
    """A dark ellipse snapped onto the body's surface (its own object, origin at the eye's center), as big as the front view draws it."""
    x, z = sheet_eye["offset"] * UNIT, sheet_eye["height"] * UNIT + HOVER
    center, _, _, _ = tree.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
    # Outward: the body's level normal there.
    q = center - Vector((0, 0, CENTER))
    outward = Vector((q.x / HALF.x ** 2, q.y / HALF.y ** 2, 0)).normalized()
    across = Vector((0, 0, 1)).cross(outward).normalized()
    up = Vector((0, 0, 1))
    turn = abs(outward.dot(Vector((0, -1, 0))))
    width, tall = sheet_eye["wide"] / 2 / turn * UNIT * EYE_GROW, sheet_eye["tall"] / 2 * UNIT * EYE_GROW
    rings, segments = 5, 20

    def snap(u, v):
        point = center + across * u + up * v
        hit, normal, _, _ = tree.ray_cast(point + outward * 0.3, -outward)
        return hit + normal * EYE_LIFT

    bm = bmesh.new()
    middle = bm.verts.new(snap(0, 0))
    previous = None
    for r in range(1, rings + 1):
        f = r / rings
        ring = [bm.verts.new(snap(math.cos(t) * width * f, math.sin(t) * tall * f)) for t in (2 * math.pi * k / segments for k in range(segments))]
        for k in range(segments):
            j = (k + 1) % segments
            bm.faces.new((middle, ring[k], ring[j]) if previous is None else (previous[k], ring[k], ring[j], previous[j]))
        previous = ring
    origin = center + outward * EYE_LIFT
    for v in bm.verts:
        v.co -= origin
    bm.normal_update()
    if sum(f.normal.dot(outward) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    name = "Eye.L" if x > 0 else "Eye.R"
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(eyes)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = origin
    return obj


def part(name, make, rng, wind, parent):
    """One part as its own object, its origin at its base."""
    bm = bmesh.new()
    base = make(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for v in bm.verts:
        v.co -= base
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    color_faces(mesh, rng, leaf_color)
    mesh.materials.append(wind)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = base
    obj.parent = parent
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(5)
    collection = bpy.context.scene.collection
    wind = material()

    bm = bmesh.new()
    ball(bm, rng)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("WindSpirit")
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    color_faces(mesh, rng, body_color)
    mesh.materials.append(wind)
    body = bpy.data.objects.new("WindSpirit", mesh)
    collection.objects.link(body)

    tree = BVHTree.FromPolygons([tuple(v.co) for v in mesh.vertices], [tuple(p.vertices) for p in mesh.polygons])
    dark = eye_material()
    # One size and height for both, mirrored about the body's middle.
    eyes = FRONT["eyes"]
    mean = {k: sum(e[k] for e in eyes) / len(eyes) for k in ("height", "wide", "tall")}
    apart = sum(abs(e["offset"]) for e in eyes) / len(eyes)
    for side in (1, -1):
        obj = eye(tree, {**mean, "offset": side * apart}, dark)
        obj.parent = body
        collection.objects.link(obj)

    # The top leaves: the front view's two (its right first), each leaning back as the side view's.
    top = SIDE["top_leaves"][0]
    for name, front_leaf, outward in (("TopLeaf.R", FRONT["top_leaves"][0], -1), ("TopLeaf.L", FRONT["top_leaves"][1], 1)):
        part(name, lambda bm, f=front_leaf, o=outward: leaf(bm, f, top, o), rng, wind, body)
    # The leaves under it: the bigger and the smaller, matched between the views.
    for name, front_leaf, side_leaf in zip(("LowLeaf.Big", "LowLeaf.Small"), FRONT["lower_leaves"], SIDE["lower_leaves"]):
        outward = 1 if front_leaf["tip"][0] > 0 else -1
        part(name, lambda bm, f=front_leaf, s=side_leaf, o=outward: leaf(bm, f, s, o), rng, wind, body)
    # The tendrils: the front view's (its right first), sweeping back as the side view's.
    side_tendril = SIDE["tendrils"][0]
    for name, front_tendril in zip(("Tendril.R", "Tendril.L"), FRONT["tendrils"]):
        part(name, lambda bm, f=front_tendril: tendril(bm, f["line"], side_tendril["line"], f["widths"], side_tendril["widths"]), rng, wind, body)

    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" and not o.name.startswith("Eye") for p in o.data.polygons)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "wind-spirit.blend"))
    print(f"built: {tris} triangles (without the eyes); body {HALF.x * 2:.3f} x {HALF.y * 2:.3f} x {HALF.z * 2:.3f} m at {CENTER:.3f} m")


build()
