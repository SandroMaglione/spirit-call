"""The fire spirit: a faceted, low-poly flame with dark eyes, an ember nub hanging under it, and four floating shards.

Everything comes from its production sheet (reference/), measured by
sheet.py into sheet.json:

- The body (with the ember nub under its narrow neck) is lofted through
  the sheet's outlines: each ring takes its four extents at its height,
  left and right from the front and back views (averaged), front and back
  from the left view (the right view is drawn as its mirror image, so it
  adds nothing), so the flame's lean and its tip are the sheet's own.
- The shards are faceted diamonds where the views put them: across and
  height from the front view, front to back from the top and left views;
  their size and lean as drawn.
- The eyes are dark ellipses laid on its surface (their own objects,
  `Eye.L` and `Eye.R`, to blink and look later), where the front view
  draws them.
- Colors are the sheet's swatches: each facet flat, yellow low and in
  front, orange to ember red toward the top; the renders shade the
  silhouette's edges ember red, as the sheet does.

    blender --background --python-exit-code 1 --python art/spirits/fire/build.py

Writes `fire-spirit.blend`. Blender axes: it faces -Y, its left is +X, up is
+Z; meters; its origin on the floor under it (it hovers).
"""
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
SHEET = json.loads((HERE / "sheet.json").read_text())

UNIT = 0.60  # the whole figure, top shard to the nub's bottom (the sheet's H)
HOVER = 0.05  # the nub's bottom above the floor at rest
SEGMENTS = 12
JITTER = 0.02
EYE_LIFT = 0.002
EYE_GROW = 1.6

COLORS = {"orange": "#FF8A3D", "ember": "#E6391F", "yellow": "#FFD54A", "glow": "#FFF176", "eye": "#2A0A06"}


def edges(view, z):
    """The outline's two edges in `view` at height `z` (units), as the image shows them."""
    rows = SHEET[view]["outline"]
    zs = np.array([r[0] for r in rows])
    order = np.argsort(zs)
    return (float(np.interp(z, zs[order], np.array([r[1] for r in rows])[order])),
            float(np.interp(z, zs[order], np.array([r[2] for r in rows])[order])))


def extents(z):
    """Its four extents at height `z`: (left, right, front, back), each a distance from its middle (units)."""
    f_lo, f_hi = edges("front", z)  # facing the camera: image right is its left
    b_lo, b_hi = edges("back", z)  # from behind: image left is its left
    l_lo, l_hi = edges("left", z)  # its front on the image's right
    left = (f_hi - b_lo) / 2
    right = (-f_lo + b_hi) / 2
    return left, right, l_hi, -l_lo


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


def body_color(normal, height, rng):
    """A facet's own color: orange, deepening to ember red toward the flame's tip and on the nub, each facet a little different.

    (The yellow glow in its middle and the ember edges depend on where it is
    seen from: the material adds them, see `fire_material`.)
    """
    neck = SHEET["front"]["neck"]
    if height < neck:
        t = 0.75
    else:
        t = 0.15 + 0.75 * max(0.0, (height - 0.45) / 0.45)
    t = max(0.0, min(1.0, t + rng.uniform(-0.15, 0.15)))
    return mix(linear(COLORS["orange"]), linear(COLORS["ember"]), t)


def loft(bm, rng):
    """The body and nub: rings through the sheet's outlines, each turned half a segment from the last (triangular facets)."""
    rows = SHEET["front"]["outline"]
    lowest, highest = min(r[0] for r in rows), max(r[0] for r in rows)
    neck = SHEET["front"]["neck"]
    # Rings: denser round the nub and its neck, then up the flame.
    heights = [lowest + 0.012, 0.04, 0.075, 0.11, neck, neck + 0.03, neck + 0.08, 0.3, 0.38, 0.46, 0.53, 0.6, 0.66, 0.71, highest - 0.02]
    rings = []
    for i, z in enumerate(heights):
        turn = (i % 2) * math.pi / SEGMENTS
        ring = []
        for k in range(SEGMENTS):
            p = ring_point(z, 2 * math.pi * k / SEGMENTS + turn)
            p.x *= 1 + rng.uniform(-JITTER, JITTER)
            p.y *= 1 + rng.uniform(-JITTER, JITTER)
            ring.append(bm.verts.new((p.x * UNIT, p.y * UNIT, z * UNIT + HOVER)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        lower, upper = rings[i], rings[i + 1]
        for k in range(SEGMENTS):
            j = (k + 1) % SEGMENTS
            if i % 2 == 0:
                bm.faces.new((lower[k], lower[j], upper[k]))
                bm.faces.new((upper[k], lower[j], upper[j]))
            else:
                bm.faces.new((lower[k], lower[j], upper[j]))
                bm.faces.new((lower[k], upper[j], upper[k]))
    left, right, front, back = extents(highest - 0.002)
    tip = bm.verts.new((((left - right) / 2) * UNIT, ((back - front) / 2) * UNIT, highest * UNIT + HOVER))
    for k in range(SEGMENTS):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % SEGMENTS], tip))
    left, right, front, back = extents(lowest + 0.002)
    bottom = bm.verts.new((((left - right) / 2) * UNIT, ((back - front) / 2) * UNIT, lowest * UNIT + HOVER))
    for k in range(SEGMENTS):
        bm.faces.new((rings[0][(k + 1) % SEGMENTS], rings[0][k], bottom))


def shard_places():
    """Each shard: across (+ its left), forward (+ its front), height, tall, wide, lean (degrees; + its top toward its left). Units."""
    front = sorted(SHEET["front"]["shards"], key=lambda s: -s["pixels"])
    top = SHEET["top"]["shards"]
    side = SHEET["left"]["shards"]
    # Top view widths are its own: in the front view's units, the body's widest is twice its widest extent.
    width = max(extents(z)[0] + extents(z)[1] for z in np.linspace(0.2, 0.7, 40))
    places = []
    for shard in front:
        # Depth from the top view (the shard on the same side, nearest in size), and the left view's (nearest in height), averaged.
        candidates = [t for t in top if (t["across"] > 0) == (shard["offset"] > 0)]
        depths = []
        if shard["height"] < 0.85 and candidates:
            match = min(candidates, key=lambda t: abs(t["pixels"] - shard["pixels"]))
            depths.append(match["forward"] * width)
        # The left view looks at its right side: shards far on its left are behind the body there.
        near = min(side, key=lambda s: abs(s["height"] - shard["height"]))
        if shard["offset"] < 0.2 and abs(near["height"] - shard["height"]) < 0.1:
            depths.append(near["offset"])
        forward = sum(depths) / len(depths) if depths else 0.0
        places.append({"across": shard["offset"], "forward": forward, "height": shard["height"], "tall": shard["tall"], "wide": shard["wide"], "lean": shard["lean"]})
    return places


def shard(bm, place, rng):
    """A faceted diamond: a six-sided bipyramid, longer above its waist, leaning as drawn, turned a little."""
    center = Vector((place["across"] * UNIT, -place["forward"] * UNIT, place["height"] * UNIT + HOVER))
    tall, wide = place["tall"] * UNIT, place["wide"] * UNIT
    turn = Matrix.Rotation(math.radians(-place["lean"]), 4, "Y") @ Matrix.Rotation(rng.uniform(0, math.pi), 4, "Z")
    waist = 0.42  # the waist sits below its middle: a longer point above
    top = bm.verts.new(center + (turn @ Vector((0, 0, tall * (1 - waist)))))
    bottom = bm.verts.new(center + (turn @ Vector((0, 0, -tall * waist))))
    ring = [bm.verts.new(center + (turn @ Vector((math.cos(a) * wide / 2, math.sin(a) * wide / 2 * 0.8, 0)))) for a in (2 * math.pi * k / 6 for k in range(6))]
    faces = []
    for k in range(6):
        j = (k + 1) % 6
        faces.append(bm.faces.new((ring[k], ring[j], top)))
        faces.append(bm.faces.new((ring[j], ring[k], bottom)))
    return faces


def color_faces(mesh, rng, color_of):
    attribute = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    for poly in mesh.polygons:
        c = color_of(poly, rng)
        for loop in poly.loop_indices:
            attribute.data[loop].color = (*c, 1.0)


def fire_material():
    """Lit from within: yellow where it faces the camera, its facets' orange and ember round it, ember red at the silhouette's edges."""
    m = bpy.data.materials.new("Fire")
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    colors = nodes.new("ShaderNodeVertexColor")
    colors.layer_name = "Color"
    facing = nodes.new("ShaderNodeLayerWeight")
    facing.inputs["Blend"].default_value = 0.5

    def band(low, high):
        node = nodes.new("ShaderNodeMapRange")
        node.interpolation_type = "SMOOTHSTEP"
        node.inputs["From Min"].default_value = low
        node.inputs["From Max"].default_value = high
        links.new(facing.outputs["Facing"], node.inputs["Value"])
        return node

    def mixed(a, b, factor):
        node = nodes.new("ShaderNodeMix")
        node.data_type = "RGBA"
        links.new(factor.outputs["Result"], node.inputs["Factor"])
        for slot, value in (("A", a), ("B", b)):
            if isinstance(value, tuple):
                node.inputs[slot].default_value = value
            else:
                links.new(value, node.inputs[slot])
        return node

    core = mixed((*linear(COLORS["yellow"]), 1), colors.outputs["Color"], band(0.0, 0.42))
    edge = mixed(core.outputs["Result"], (*linear(COLORS["ember"]), 1), band(0.55, 0.95))
    links.new(edge.outputs["Result"], bsdf.inputs["Base Color"])
    links.new(edge.outputs["Result"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    return m


def eye_material():
    m = bpy.data.materials.new("Eyes")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*linear(COLORS["eye"]), 1)
    bsdf.inputs["Roughness"].default_value = 0.4
    return m


def eye(tree, sheet_eye, material):
    """A dark ellipse snapped onto the body's surface (its own object, origin at the eye's center), as big as the front view draws it."""
    x, z = sheet_eye["offset"], sheet_eye["height"]
    left, right, front, back = extents(z)
    side = left if x > 0 else right
    a = math.asin(max(-0.95, min(0.95, x / side)))
    outward = Vector((math.sin(a) / side, -math.cos(a) / front, 0)).normalized()
    across = Vector((0, 0, 1)).cross(outward).normalized()
    up = Vector((0, 0, 1))
    turn = abs(outward.dot(Vector((0, -1, 0))))
    # The sheet's eyes have an orange rim that measures as body: the dark eye is this much larger than its hole.
    width, tall = sheet_eye["wide"] / 2 / turn * UNIT * EYE_GROW, sheet_eye["tall"] / 2 * UNIT * EYE_GROW
    center, _, _, _ = tree.ray_cast(Vector((x * UNIT, -1.0, z * UNIT + HOVER)), Vector((0, 1, 0)))
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
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = origin
    return obj


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(11)
    collection = bpy.context.scene.collection
    material = fire_material()

    bm = bmesh.new()
    loft(bm, rng)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("FireSpirit")
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    color_faces(mesh, rng, lambda poly, r: body_color(poly.normal, (poly.center.z - HOVER) / UNIT, r))
    mesh.materials.append(material)
    body = bpy.data.objects.new("FireSpirit", mesh)
    collection.objects.link(body)

    tree = BVHTree.FromPolygons([tuple(v.co) for v in mesh.vertices], [tuple(p.vertices) for p in mesh.polygons])
    dark = eye_material()
    for sheet_eye in SHEET["front"]["eyes"]:
        obj = eye(tree, sheet_eye, dark)
        obj.parent = body
        collection.objects.link(obj)

    # The shards: one object each, so they can float on their own.
    places = shard_places()
    for index, place in enumerate(sorted(places, key=lambda p: -p["height"])):
        bm = bmesh.new()
        shard(bm, place, rng)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        center = Vector((place["across"] * UNIT, -place["forward"] * UNIT, place["height"] * UNIT + HOVER))
        for v in bm.verts:
            v.co -= center
        shard_mesh = bpy.data.meshes.new(f"Shard{index}")
        bm.to_mesh(shard_mesh)
        bm.free()
        for poly in shard_mesh.polygons:
            poly.use_smooth = False
        color_faces(shard_mesh, rng, lambda poly, r: mix(linear(COLORS["orange"]), linear(COLORS["ember"]), max(0.0, min(1.0, 0.5 - 0.4 * poly.normal.z + r.uniform(-0.2, 0.2)))))
        shard_mesh.materials.append(material)
        obj = bpy.data.objects.new(f"Shard{index}", shard_mesh)
        obj.location = center
        obj.parent = body
        collection.objects.link(obj)
        print(f"shard {index}: across {place['across']:+.3f}, forward {place['forward']:+.3f}, height {place['height']:.3f}")

    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "fire-spirit.blend"))
    print(f"built: {tris} triangles")


build()
