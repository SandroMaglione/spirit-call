"""The water spirit: a faceted, low-poly water droplet with two glowing eyes and a floating nub.

Everything comes from its orthographic sheet (reference/, the crops of
`sheet.png`), measured by sheet.py into sheet.json:

- The body is lofted through the sheet's outlines: each ring takes its four
  extents at its height, left and right from the front and back views,
  front and back from the left and right views (each pair averaged), so its
  shape, the uneven taper and the back curving in toward the nub included,
  is the sheet's own.
- The eyes are thin glowing ellipses laid on its surface like stickers:
  dense discs whose every point is snapped onto the body (2 mm above it)
  along the eye's outward direction, where and as big as the front view
  draws them. They bend with the facets, so they read as drawn on, and
  they are their own objects (`Eye.L`, `Eye.R`, origin at the eye's
  center) so they can blink (scale) and look around (move) later.
- The nub floats where the views put it; colors are the sheet's swatches.

    blender --background --python-exit-code 1 --python art/spirits/water/build.py

Writes `water-spirit.blend`. Blender axes: it faces -Y, its
left is +X, up is +Z; meters; its origin on the floor under it (it hovers).
"""
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
SHEET = json.loads((HERE / "sheet.json").read_text())

# About 0.6 m tall with its nub (the sheet's scale reference).
BODY = 0.6 / (SHEET["front"]["nub"]["height"] + SHEET["front"]["nub"]["radius"])
HOVER = 0.06  # the body's underside above the floor at rest
RINGS = [0.02, 0.07, 0.14, 0.23, 0.33, 0.44, 0.54, 0.63, 0.71, 0.79, 0.87, 0.94]
UNDERSIDE = 0.04  # the underside's middle, above its rim (concave, as the bottom view shows)
SEGMENTS = 12
JITTER = 0.015  # a little unevenness, for facets that look cut, not turned

# The sheet's swatches (and one deeper blue, which its shadowed facets reach).
COLORS = {"deep": "#1A5CE6", "base": "#2E7BFF", "mid": "#4486FF", "light": "#8EEBFF", "eye": "#FFFFFF"}
EYE_GLOW = 4.0  # emission strength of the eyes
EYE_LIFT = 0.002  # how far above the surface the eyes lie (m)
EYE_RAISE = 0.014  # renders measure the eyes this much lower than the sheet (body heights; the render's base reads lower)


def edges(view, z):
    """The outline's two edges in `view` at height `z`, as the image shows them (body heights from its base's middle)."""
    rows = SHEET[view]["outline"]
    zs = np.array([r[0] for r in rows])
    order = np.argsort(zs)
    return (float(np.interp(z, zs[order], np.array([r[1] for r in rows])[order])),
            float(np.interp(z, zs[order], np.array([r[2] for r in rows])[order])))


def extents(z):
    """Its four extents at height `z`: (left, right, front, back), each a distance from its middle."""
    f_lo, f_hi = edges("front", z)  # facing the camera: image right is its left
    b_lo, b_hi = edges("back", z)  # from behind: image left is its left
    l_lo, l_hi = edges("left", z)  # its front on the image's right
    r_lo, r_hi = edges("right", z)  # its front on the image's left
    left = (f_hi - b_lo) / 2
    right = (-f_lo + b_hi) / 2
    front = (l_hi - r_lo) / 2
    back = (-l_lo + r_hi) / 2
    return left, right, front, back


def ring_point(z, a):
    """The surface at height `z`, `a` radians round from its front toward its left: quarter-ellipses through its extents."""
    left, right, front, back = extents(z)
    x = math.sin(a) * (left if math.sin(a) > 0 else right)
    y = -math.cos(a) * (front if math.cos(a) > 0 else back)
    return Vector((x, y, z))


def linear(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]


def mix(a, b, t):
    return [x + (y - x) * t for x, y in zip(a, b)]


def facet_color(normal, height, rng):
    """A facet's flat color: deep blue low and away from the light, light cyan high and toward it, each a little different."""
    light = Vector((-0.45, -0.55, 0.7)).normalized()
    t = 0.75 * (0.5 + 0.5 * normal.dot(light)) + 0.5 * height + rng.uniform(-0.12, 0.12) - 0.3
    t = max(0.0, min(1.0, t))
    deep, base, mid, bright = (linear(COLORS[k]) for k in ("deep", "base", "mid", "light"))
    if t < 0.3:
        return mix(deep, base, t / 0.3)
    return mix(base, mid, (t - 0.3) / 0.4) if t < 0.7 else mix(mid, bright, (t - 0.7) / 0.3)


def loft(bm, rng):
    """The body: rings through the sheet's outlines, each turned half a segment from the last (triangular facets)."""
    rings = []
    for i, z in enumerate(RINGS):
        turn = (i % 2) * math.pi / SEGMENTS
        ring = []
        for k in range(SEGMENTS):
            p = ring_point(z, 2 * math.pi * k / SEGMENTS + turn)
            p.x *= 1 + rng.uniform(-JITTER, JITTER)
            p.y *= 1 + rng.uniform(-JITTER, JITTER)
            ring.append(bm.verts.new((p.x * BODY, p.y * BODY, (z + rng.uniform(-0.005, 0.005)) * BODY + HOVER)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        lower, upper = rings[i], rings[i + 1]
        for k in range(SEGMENTS):
            j = (k + 1) % SEGMENTS
            if i % 2 == 0:  # the upper ring sits half a step ahead
                bm.faces.new((lower[k], lower[j], upper[k]))
                bm.faces.new((upper[k], lower[j], upper[j]))
            else:
                bm.faces.new((lower[k], lower[j], upper[j]))
                bm.faces.new((lower[k], upper[j], upper[k]))
    # The tip: where the outlines close at the top.
    left, right, front, back = extents(0.995)
    tip = bm.verts.new((((left - right) / 2) * BODY, ((back - front) / 2) * BODY, BODY + HOVER))
    for k in range(SEGMENTS):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % SEGMENTS], tip))
    bottom = bm.verts.new((0, 0, UNDERSIDE * BODY + HOVER))
    for k in range(SEGMENTS):
        bm.faces.new((rings[0][(k + 1) % SEGMENTS], rings[0][k], bottom))


def eye(tree, sheet_eye, material):
    """One eye: a thin ellipse snapped onto the body's surface, its own object with its origin at the eye's center.

    It is laid along the eye's outward direction (the body's horizontal
    normal at its center), and widened by that direction's turn from the
    front so that, seen from the front, it is exactly the sheet's ellipse.
    """
    x, z = sheet_eye["offset"], sheet_eye["height"] + EYE_RAISE  # front view: image right is its left (+X)
    left, right, front, back = extents(z)
    side = left if x > 0 else right
    a = math.asin(max(-0.95, min(0.95, x / side)))
    outward = Vector((math.sin(a) / side, -math.cos(a) / front, 0)).normalized()
    across = Vector((0, 0, 1)).cross(outward).normalized()
    up = Vector((0, 0, 1))
    turn = abs(outward.dot(Vector((0, -1, 0))))
    width, tall = sheet_eye["width"] / 2 / turn * BODY, sheet_eye["tall"] / 2 * BODY
    middle = Vector((x * BODY, 0, z * BODY + HOVER))
    center_hit, _, _, _ = tree.ray_cast(middle + Vector((0, -1, 0)) * 1.0 + across * 0, Vector((0, 1, 0)))
    center = center_hit
    rings, segments = 5, 24

    def snap(u, v):
        """The body's surface under the point (u, v) of the eye's plane, lifted along its normal."""
        point = center + across * u + up * v
        hit, normal, _, _ = tree.ray_cast(point + outward * 0.3, -outward)
        return hit + normal * EYE_LIFT

    bm = bmesh.new()
    middle_vert = bm.verts.new(snap(0, 0))
    previous = None
    for r in range(1, rings + 1):
        f = r / rings
        ring = [bm.verts.new(snap(math.cos(t) * width * f, math.sin(t) * tall * f)) for t in (2 * math.pi * k / segments for k in range(segments))]
        for k in range(segments):
            j = (k + 1) % segments
            if previous is None:
                bm.faces.new((middle_vert, ring[k], ring[j]))
            else:
                bm.faces.new((previous[k], ring[k], ring[j], previous[j]))
        previous = ring
    origin = center + outward * EYE_LIFT
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        v.co -= origin
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Facing out: flip if the disc's normal points into the body.
    bm.normal_update()
    if sum((f.normal.dot(outward) for f in bm.faces)) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    name = "Eye.L" if x > 0 else "Eye.R"
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = origin
    return obj


def color_faces(mesh, rng, height_of):
    """Flat colors per facet, as a corner color attribute (exported as vertex colors)."""
    attribute = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    for poly in mesh.polygons:
        c = facet_color(poly.normal, height_of(poly.center), rng)
        for loop in poly.loop_indices:
            attribute.data[loop].color = (*c, 1.0)


def water_material():
    """Its facets' vertex colors, semi-gloss, glowing softly in their own colors."""
    m = bpy.data.materials.new("Water")
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.6
    bsdf.inputs["Specular IOR Level"].default_value = 0.12
    colors = nodes.new("ShaderNodeVertexColor")
    colors.layer_name = "Color"
    links.new(colors.outputs["Color"], bsdf.inputs["Base Color"])
    # A soft inner glow in each facet's own color ("soft inner glow impression, not transparent").
    links.new(colors.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.45
    return m


def eye_material():
    """White glow."""
    m = bpy.data.materials.new("Eyes")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Emission Strength"].default_value = EYE_GLOW
    return m


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(7)
    collection = bpy.context.scene.collection

    bm = bmesh.new()
    loft(bm, rng)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("WaterSpirit")
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    color_faces(mesh, rng, lambda p: (p.z - HOVER) / BODY)
    material = water_material()
    mesh.materials.append(material)
    body = bpy.data.objects.new("WaterSpirit", mesh)
    collection.objects.link(body)

    # The eyes, laid on the body.
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons([tuple(v.co) for v in mesh.vertices], [tuple(p.vertices) for p in mesh.polygons])
    glow = eye_material()
    eye_tris = 0
    for sheet_eye in SHEET["front"]["eyes"]:
        obj = eye(tree, sheet_eye, glow)
        obj.parent = body
        collection.objects.link(obj)
        eye_tris += sum(len(p.vertices) - 2 for p in obj.data.polygons)

    # The nub: a small faceted ball, its own object (to bob on its own), where the views put it.
    nub = SHEET["front"]["nub"]
    radius = np.mean([SHEET[v]["nub"]["radius"] for v in ("front", "back", "left", "right")])
    height = np.mean([SHEET[v]["nub"]["height"] for v in ("front", "back", "left", "right")])
    across = (SHEET["front"]["nub"]["offset"] - SHEET["back"]["nub"]["offset"]) / 2
    forward = (SHEET["left"]["nub"]["offset"] - SHEET["right"]["nub"]["offset"]) / 2
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius * BODY)
    nub_mesh = bpy.data.meshes.new("Nub")
    bm.to_mesh(nub_mesh)
    bm.free()
    for poly in nub_mesh.polygons:
        poly.use_smooth = False
    color_faces(nub_mesh, rng, lambda p: 1.05 + p.z / (radius * BODY) * 0.3)
    nub_mesh.materials.append(material)
    nub_object = bpy.data.objects.new("Nub", nub_mesh)
    nub_object.location = (across * BODY, -forward * BODY, height * BODY + HOVER)
    nub_object.parent = body
    collection.objects.link(nub_object)

    tris = sum(len(p.vertices) - 2 for m in (mesh, nub_mesh) for p in m.polygons)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "water-spirit.blend"))
    print(f"built: {tris} triangles (+{eye_tris} for the eyes), body {BODY:.3f} m, nub at {height:.3f} ({across:+.3f} across, {forward:+.3f} forward)")


build()
