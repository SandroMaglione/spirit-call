"""The wind spirit: a faceted, pale mint ball with dark eyes, two leaves on top, a curling tendril on each side, and two leaves hanging under it.

Everything comes from its production sheet (reference/), measured by
sheet.py into sheet.json:

- The body is a faceted ball through the fitted ellipses: its width from
  the front view, its depth from the left view, its height from both.
- Each leaf is a faceted crystal blade from its base to its tip: across
  and height from the front view, front to back from the left view (the
  right view is drawn as its mirror image), as wide as the views draw it
  at each point. Seen from the front it is as wide as the front view, from
  the side as wide as the side view: its blade is turned between the two.
  The leaves under it bend as the views draw their middle lines; where one
  view loses a bent leaf (its straight line leaves it), the other's widths.
- Each tendril (curl) is a flat crescent blade along its middle line:
  across from the front view, front to back from the left view's, height
  halfway between theirs, matched point by point from base to tip; rooted
  in the body's side (both views lose it where it crosses the body) and
  swept from there in one curve; as wide as both views draw it, its blade
  turned between them and tipped a little face up (toward the game's
  camera), thin across it, drawn to a sharp point over its last stretch.
- The eyes are dark ellipses laid on its surface (their own objects,
  `Eye.L` and `Eye.R`, to blink and look later), mirrored: the front view's
  two eyes averaged, about the body's middle.
- Every part is its own object with its origin at its base, to sway on its
  own. Colors are the sheet's swatches, one per facet: the body pale mint
  (nearly white only toward the light, mint toward its edges and lower
  facets), the leaves mint to teal.

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
CURL_RINGS = 13  # rings along a curl, evenly spaced along its length
CURL_TURN = 0.9  # how far a curl's blade turns from facing the front view toward facing the side view
CURL_LIE = 0.5  # how far a curl's blade is tipped from standing toward lying flat, its face up
CURL_BLADE = 0.32  # a curl's thickness across the plane it curls in, of its width: a flat blade, not a tube
CURL_ROUND = 3  # how often a curl's line is smoothed into one sweep
CURL_ROOT = 0.85  # a curl's width where it leaves the body (the views lose it there), of its widest
CURL_TAPER = 0.4  # a curl is drawn to its sharp point over this last share of its length (before it, as wide as measured)
BLADE_SHAPE = [(1.0, 0.0), (0.45, 0.8), (-0.45, 0.8), (-1.0, 0.0), (-0.45, -0.8), (0.45, -0.8)]  # a blade's section: two sharp edges
THICKNESS = 0.3  # a leaf's thickness, of its width
SINK = 0.12  # how far a leaf's base reaches into the body (share of its radius)
BODY_PALEST = 0.75  # the body's lightest facets: this far from white to the pale aqua swatch
BODY_GREENEST = 1.0  # its greenest facets: this far from pale aqua to the mint swatch
EYE_LIFT = 0.002
EYE_GROW = 1.0

COLORS = {"mint": "#8EE3C1", "teal": "#4CC7A7", "aqua": "#BFEFDF", "white": "#FFFFFF", "eye": "#2B3A36"}
LIGHT = Vector((-0.45, -0.6, 0.65)).normalized()  # the sheet's key light: upper left front

# The body: an ellipsoid round (0, 0, CENTER) with these half extents (m).
CENTER = (FRONT["body"]["height"] + SIDE["body"]["height"]) / 2 * UNIT + HOVER
HALF = Vector((FRONT["body"]["half_wide"], SIDE["body"]["half_wide"], (FRONT["body"]["half_tall"] + SIDE["body"]["half_tall"]) / 2)) * UNIT
# Her eyes, from the sheet's ellipses: the Swordsman is keen (tall, narrow, a slight slant, no lid).
EYE_SHAPE = {"wide": 0.88, "tall": 1.12, "lid": 2.0, "tilt": 0.14}


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
    """Pale mint, as the sheet's body: nearly white only on the facets facing the light, pale aqua round them, and mint
    toward its edges (the facets turned away from the light) and its lower facets; each facet a little different."""
    green = (1 - lit(poly.normal)) * 1.3 + max(0.0, -poly.normal.z) * 0.35 + rng.uniform(-0.1, 0.1)
    green = max(0.0, min(1.0, green))
    white, aqua, mint = linear(COLORS["white"]), linear(COLORS["aqua"]), linear(COLORS["mint"])
    pale = mix(white, aqua, BODY_PALEST)
    return mix(pale, aqua, green / 0.4) if green < 0.4 else mix(aqua, mint, (green - 0.4) / 0.6 * BODY_GREENEST)


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


def whole(widths, other):
    """A leaf's widths in one view, or the other view's where this one lost it: a bent leaf leaves its straight
    base-to-tip line, which then measures nothing (a gap in the middle) though the leaf goes on beside it."""
    gaps = any(w < 0.01 for w in widths[2:-2])
    return list(other) if gaps and not any(w < 0.01 for w in other[2:-2]) else list(widths)


def bends(view_leaf, to_world):
    """How far a leaf's middle lies off its straight base-to-tip line at each of its samples, as its view draws it (m):
    nothing at its tip, at its base (where the leaves run into each other and the body), or where the view lost it."""
    if any(w < 0.01 for w in view_leaf["widths"][2:-2]):
        return [Vector()] * len(view_leaf["shifts"])
    shifts = list(view_leaf["shifts"])
    shifts[:3] = [shifts[3] * i / 3 for i in range(3)]
    return [to_world(view_leaf["across"]) * (shift * UNIT) for shift in smooth(shifts)]


def leaf(bm, front_leaf, side_leaf, outward, bent=False):
    """A crystal blade from base to tip, as wide as each view draws it; its blade turned so each view sees its own width;
    `bent` as the views draw its middle line. Returns its base."""
    base = into_body(at(front_leaf["base"], side_leaf["base"]), SINK)
    tip = at(front_leaf["tip"], side_leaf["tip"])
    axis = (tip - base).normalized()
    across_front = axis.cross(Vector((0, 1, 0))).normalized()  # across the leaf as the front view sees it
    across_side = axis.cross(Vector((1, 0, 0))).normalized()  # across the leaf as the side view sees it
    facing = Vector((outward, -1, 0)).normalized()
    # The blade's diagonal: the one whose face looks out toward the front and its own side, as the sheet's leaves do.
    candidates = [(across_front + across_side * s).normalized() for s in (1, -1)]
    blade = max(candidates, key=lambda u: abs(axis.cross(u).dot(facing)))
    front_widths, side_widths = whole(front_leaf["widths"], side_leaf["widths"]), whole(side_leaf["widths"], front_leaf["widths"])
    front_widths = smooth(capped(front_widths, 0.35, 0.9))
    side_widths = smooth(capped(side_widths, 0.35, 0.9))
    shape = BLADE_SHAPE
    normal = axis.cross(blade).normalized()
    shares = np.linspace(0, 1, len(front_widths))
    bend = [Vector()] * len(shares)
    if bent:
        bend = [a + b for a, b in zip(bends(front_leaf, lambda v: Vector((v[0], 0, v[1]))), bends(side_leaf, lambda v: Vector((0, -v[0], v[1]))))]
    rings = []
    for f in LEAF_RINGS:
        wide = math.hypot(np.interp(f, shares, front_widths), np.interp(f, shares, side_widths)) / 2 * UNIT
        thick = wide * THICKNESS
        center = base + (tip - base) * f + Vector([np.interp(f, shares, [b[k] for b in bend]) for k in range(3)])
        rings.append([bm.verts.new(center + blade * u * wide + normal * v * thick) for u, v in shape])
    stitch(bm, rings, bm.verts.new(base), bm.verts.new(tip))
    return base


def along(points, values, count):
    """`count` points evenly spaced along the smooth line through `points` (its end left out), each with its value
    (from `values`, one per point) and how far along it lies (0 to 1)."""
    dense, carried = [], []
    padded = [points[0]] + list(points) + [points[-1]]
    for i in range(len(points) - 1):
        a, b, c, d = padded[i:i + 4]
        for step in range(8):
            u = step / 8
            dense.append(0.5 * ((2 * b) + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u ** 3))
            carried.append(values[i] + (values[i + 1] - values[i]) * u)
    dense.append(points[-1])
    carried.append(values[-1])
    lengths = [0.0]
    for a, b in zip(dense, dense[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    out = []
    for k in range(count):
        want = lengths[-1] * k / count
        i = max(j for j, l in enumerate(lengths) if l <= want)
        u = (want - lengths[i]) / max(1e-9, lengths[i + 1] - lengths[i])
        out.append((dense[i].lerp(dense[i + 1], u), carried[i] + (carried[i + 1] - carried[i]) * u, k / count))
    return out


def tendril(bm, front_line, side_line, front_widths, side_widths):
    """A curl: a flat crescent blade along the middle line (front view across, side view depth, height halfway; point
    by point), rooted in the body's side, widest in its middle, narrowing to a sharp point. Returns its base."""
    points = [at((f[0], (f[1] + s[1]) / 2), s) for f, s in zip(front_line, side_line)]
    # Both views lose its root where it crosses the body: it grows from the body's side, level with its first point.
    side = math.copysign(1, points[0].x)
    root = Vector((side * HALF.x * 0.75, 0, points[0].z))
    base = into_body(root, 0.3)
    points = [base, into_body(root, 0.0)] + points[1:]
    # One sweep from the body's side to the tip: the corner where it leaves the body for the views' line rounded off.
    # Its curl toward the tip stays as measured.
    half = len(points) // 2
    for _ in range(CURL_ROUND):
        points = smooth(points[:half + 1]) + points[half + 1:]
    # As wide as both views draw it at each point (its blade is turned between them, as a leaf's, so each sees its own
    # width); near the body, where the views cannot see it, nearly as wide as its widest.
    widths = smooth(smooth([math.hypot(a, b) for a, b in zip(front_widths, side_widths)]))
    widest = max(widths)
    crest = widths.index(widest)
    widths = [max(w, widest * CURL_ROOT) if i <= crest else w for i, w in enumerate(widths)]
    widths = [widest * CURL_ROOT] + widths
    tip = points[-1]
    # Its blade is turned between the two views, as a leaf's: across the line as the front view sees it (the front view
    # sees its whole width along the crescent), leaning toward across it as the side view does; its face out toward the
    # front and its own side.
    facing = Vector((side, -1, 0)).normalized()
    spine = along(points, widths, CURL_RINGS)
    centers = [p for p, _, _ in spine]
    rings = []
    broad = None
    for (p, width, share), (t, _, _) in zip(spine, frames(centers + [tip])):
        across_front, across_side = Vector((0, 1, 0)).cross(t), Vector((1, 0, 0)).cross(t)
        candidates = [(across_front + across_side * s * CURL_TURN).normalized() for s in (1, -1)]
        turned = max(candidates, key=lambda u: abs(t.cross(u).dot(facing)))
        # Its face tipped up a little, toward the game's camera (30° down from every side it turns to).
        face = t.cross(turned)
        face = (face if face.dot(facing) >= 0 else -face) + (Vector((0, 0, 1)) - t * t.z) * CURL_LIE
        turned = face.cross(t).normalized()
        broad = turned if broad is None or turned.dot(broad) >= 0 else -turned
        thin = t.cross(broad).normalized()
        # Narrowing to its point: gently at first, then straight to the tip.
        narrow = min(1.0, (1 - share) / CURL_TAPER)
        wide = width / 2 * UNIT * narrow
        thick = wide * CURL_BLADE
        rings.append([bm.verts.new(p + broad * u * wide + thin * v * thick) for u, v in BLADE_SHAPE])
    stitch(bm, rings, bm.verts.new(base - (centers[1] - base).normalized() * widths[0] / 4 * UNIT), bm.verts.new(tip))
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



def eye_shape(u, v, tall, left):
    """A point of the sheet's eye ellipse as this character wears it (`EYE_SHAPE`): wider or taller, its top cut flat by a lid, tilted (its inner end lower)."""
    u, v = u * EYE_SHAPE["wide"], min(v * EYE_SHAPE["tall"], tall * EYE_SHAPE["lid"])
    tilt = EYE_SHAPE["tilt"] * (1 if left else -1)
    return u * math.cos(tilt) - v * math.sin(tilt), u * math.sin(tilt) + v * math.cos(tilt)


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
        ring = [bm.verts.new(snap(*eye_shape(math.cos(t) * width * f, math.sin(t) * tall * f, tall, x > 0))) for t in (2 * math.pi * k / segments for k in range(segments))]
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
        part(name, lambda bm, f=front_leaf, s=side_leaf, o=outward: leaf(bm, f, s, o, bent=True), rng, wind, body)
    # The tendrils: the front view's (its right first), sweeping back as the side view's.
    side_tendril = SIDE["tendrils"][0]
    for name, front_tendril in zip(("Tendril.R", "Tendril.L"), FRONT["tendrils"]):
        part(name, lambda bm, f=front_tendril: tendril(bm, f["line"], side_tendril["line"], f["widths"], side_tendril["widths"]), rng, wind, body)

    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" and not o.name.startswith("Eye") for p in o.data.polygons)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "wind-spirit.blend"))
    print(f"built: {tris} triangles (without the eyes); body {HALF.x * 2:.3f} x {HALF.y * 2:.3f} x {HALF.z * 2:.3f} m at {CENTER:.3f} m")


build()
