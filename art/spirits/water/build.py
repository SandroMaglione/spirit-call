"""The water spirit: a faceted, low-poly water droplet with two glowing eyes and a floating nub.

Everything comes from its orthographic sheet (reference/, the crops of
`sheet.png`), measured by sheet.py into sheet.json:

- The body is lofted through the sheet's outlines: each ring takes its four
  extents at its height, left and right from the front and back views,
  front and back from the left and right views (each pair averaged), so its
  shape, the uneven taper and the back curving in toward the nub included,
  is the sheet's own.
- The eyes are painted on its surface, not modeled: a texture projected
  from the front onto its front facets, the ovals exactly where and as big
  as the front view draws them. Glowing (emission), they cannot sink into
  the facets or stand out from them.
- The nub floats where the views put it; colors are the sheet's swatches.

    blender --background --python-exit-code 1 --python art/spirits/water/build.py

Writes `water-spirit.blend` and `eyes.png`. Blender axes: it faces -Y, its
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
EYE_GLOW = 3.0  # emission strength of the painted eyes
BODY_GLOW = (0.004, 0.03, 0.12)  # a soft inner glow everywhere else (emission color, linear, before strength)


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


# The eye texture: the front view's frame, in body heights (x from -SPAN to SPAN, z from 0 to 2 × SPAN).
SPAN = 0.6
TEXTURE = 512


def eyes_image():
    """Black, with the front view's two eye ovals in white, where and as big as the sheet draws them."""
    pixels = np.zeros((TEXTURE, TEXTURE, 4), dtype=np.float32)
    pixels[..., 3] = 1
    ys, xs = np.mgrid[0:TEXTURE, 0:TEXTURE] + 0.5
    # Texture rows run bottom-up, like Blender's UVs.
    x = (xs / TEXTURE) * 2 * SPAN - SPAN
    z = (ys / TEXTURE) * 2 * SPAN
    for eye in SHEET["front"]["eyes"]:
        # Image right is its left (+X).
        cx, cz = eye["offset"], eye["height"]
        rx, rz = eye["width"] / 2, eye["tall"] / 2
        inside = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2
        # A soft edge a pixel or two wide.
        value = np.clip((1 - inside) / 0.15, 0, 1)
        pixels[..., :3] = np.maximum(pixels[..., :3], value[..., None])
    image = bpy.data.images.new("Eyes", TEXTURE, TEXTURE, alpha=False)
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(HERE / "eyes.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def project_eyes(mesh):
    """UVs projecting the eye texture from the front onto its front facets; every other facet maps to the texture's black corner."""
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        front = poly.normal.y < -0.3
        for loop in poly.loop_indices:
            if front:
                p = mesh.vertices[mesh.loops[loop].vertex_index].co
                uv.data[loop].uv = ((p.x / BODY + SPAN) / (2 * SPAN), ((p.z - HOVER) / BODY) / (2 * SPAN))
            else:
                uv.data[loop].uv = (0.002, 0.998)


def color_faces(mesh, rng, height_of):
    """Flat colors per facet, as a corner color attribute (exported as vertex colors)."""
    attribute = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    for poly in mesh.polygons:
        c = facet_color(poly.normal, height_of(poly.center), rng)
        for loop in poly.loop_indices:
            attribute.data[loop].color = (*c, 1.0)


def water_material(eyes):
    """Vertex colors for its facets; glowing where the eye texture is white, softly blue elsewhere."""
    m = bpy.data.materials.new("Water")
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.6
    bsdf.inputs["Specular IOR Level"].default_value = 0.12
    colors = nodes.new("ShaderNodeVertexColor")
    colors.layer_name = "Color"
    links.new(colors.outputs["Color"], bsdf.inputs["Base Color"])
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = eyes
    texture.interpolation = "Linear"
    # Emission: the texture (white eyes on black), lifted to the body's soft glow (glTF: emissive texture × factor).
    glow = nodes.new("ShaderNodeMix")
    glow.data_type = "RGBA"
    glow.blend_type = "LIGHTEN"
    glow.inputs["Factor"].default_value = 1.0
    glow.inputs["A"].default_value = (*BODY_GLOW, 1)
    links.new(texture.outputs["Color"], glow.inputs["B"])
    links.new(glow.outputs["Result"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = EYE_GLOW
    return m, texture


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
    project_eyes(mesh)
    material, texture = water_material(eyes_image())
    mesh.materials.append(material)
    body = bpy.data.objects.new("WaterSpirit", mesh)
    collection.objects.link(body)

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
    # The nub never shows the eyes: all its UVs on the black corner.
    uv = nub_mesh.uv_layers.new(name="UVMap")
    for loop in uv.data:
        loop.uv = (0.002, 0.998)
    nub_mesh.materials.append(material)
    nub_object = bpy.data.objects.new("Nub", nub_mesh)
    nub_object.location = (across * BODY, -forward * BODY, height * BODY + HOVER)
    nub_object.parent = body
    collection.objects.link(nub_object)

    tris = sum(len(p.vertices) - 2 for m in (mesh, nub_mesh) for p in m.polygons)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "water-spirit.blend"))
    print(f"built: {tris} triangles, body {BODY:.3f} m, nub at {height:.3f} ({across:+.3f} across, {forward:+.3f} forward)")


build()
