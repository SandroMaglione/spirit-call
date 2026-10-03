"""Mesh helpers for a character built from a turnaround sheet.

A body part is a loft: rings (elliptical cross sections) along a path.
The front view gives each ring's width, the side view its depth, so a
sheet's two views become a closed, evenly ringed mesh that is easy to
weight (bones by ring) and to color (palette cells by ring or by face).

Everything here is in meters, Blender axes: +Z up, the character faces -Y,
her left is +X (`.L`).
"""
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
PALETTE = json.loads((HERE / "palette.json").read_text())
SIZE = PALETTE["size"]


def cell_uv(name, v=0.5, u=0.5):
    """A point inside palette cell `name` (u across, v from its top down), in Blender UVs."""
    x, y, w, h = PALETTE["cells"][name]["rect"]
    return ((x + 1 + u * (w - 2)) / SIZE, 1 - (y + 1 + v * (h - 2)) / SIZE)


class Part:
    """Vertices, faces, per-face UVs, and per-vertex bone weights, joined into one mesh at the end."""

    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []
        self.uvs = []
        self.weights = []
        self.smooth = []

    def vert(self, co, weights):
        self.verts.append(tuple(co))
        self.weights.append(dict(weights))
        return len(self.verts) - 1

    def face(self, indices, uvs, smooth=True):
        self.faces.append(tuple(indices))
        self.uvs.append(list(uvs))
        self.smooth.append(smooth)


def quad_uvs(cell, i, count):
    """UVs of a loft quad between rings i and i + 1: a gradient cell runs from the first ring to the last."""
    if isinstance(PALETTE["cells"][cell]["fill"], str):
        return [cell_uv(cell)] * 4
    top, bottom = cell_uv(cell, i / (count - 1)), cell_uv(cell, (i + 1) / (count - 1))
    return [top, top, bottom, bottom]


def frame(tangent, front=Vector((0, -1, 0))):
    """Side (u) and back (v) axes of a ring whose path runs along `tangent`.

    u points to her left (+X) and v away from `front`, whichever way the
    path runs (up a torso or down a leg), so `left` and `back` mean the same
    on every part.
    """
    t = Vector(tangent).normalized()
    if abs(t.dot(front)) > 0.95:
        front = Vector((0, 0, 1)) if t.dot(front) > 0 else Vector((0, 0, -1))
    u = t.cross(front).normalized()
    if u.x < -1e-6:
        u = -u
    v = t.cross(u).normalized()
    if v.dot(front) > 0:
        v = -v
    return u, v


def ring_points(center, tangent, ring, segments, front=Vector((0, -1, 0))):
    """Points of an elliptical ring: `side` wide, `front`/`back` deep (toward -v / +v), `power` squares it off."""
    u, v = frame(tangent, front)
    points = []
    p = ring.get("power", 2.0)
    for i in range(segments):
        a = math.tau * i / segments
        c, s = math.cos(a), math.sin(a)
        # Superellipse: power 2 is an ellipse, larger is boxier.
        cu = math.copysign(abs(c) ** (2 / p), c)
        sv = math.copysign(abs(s) ** (2 / p), s)
        depth = ring["back"] if s > 0 else ring["front"]
        side = ring.get("left", ring["side"]) if c > 0 else ring.get("right", ring["side"])
        points.append(Vector(center) + u * side * cu + v * depth * sv)
    return points


def loft(part, path, rings, segments, weights, color, cap_start=True, cap_end=True, front=Vector((0, -1, 0)), arc=None, thickness=0.006):
    """Rings along `path` (one center per ring). `weights(i)` and `color(i, j)` name each ring's bones and each quad's cell.

    `arc` (start, end) in ring steps makes a shell `thickness` thick (a cape,
    the back of the hair) instead of a closed tube; it is still a closed solid.
    """
    count = len(path)
    rows = []
    inner = []
    for i in range(count):
        before = Vector(path[max(i - 1, 0)])
        after = Vector(path[min(i + 1, count - 1)])
        points = ring_points(path[i], after - before, rings[i], segments, front)
        if arc is not None:
            thin = {**rings[i], "side": rings[i]["side"] - thickness, "front": rings[i]["front"] - thickness, "back": rings[i]["back"] - thickness}
            for key in ("left", "right"):
                if key in rings[i]:
                    thin[key] = rings[i][key] - thickness
            inside = ring_points(path[i], after - before, thin, segments, front)
            points = [points[j % segments] for j in range(arc[0], arc[1] + 1)]
            inner.append([part.vert(p, weights(i)) for p in (inside[j % segments] for j in range(arc[0], arc[1] + 1))])
        rows.append([part.vert(p, weights(i)) for p in points])
    width = len(rows[0])
    closed = arc is None
    for i in range(count - 1):
        for j in range(width if closed else width - 1):
            k = (j + 1) % width
            quad = (rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j])
            uvs = quad_uvs(color(i, j), i, count)
            part.face(quad, uvs)
            if not closed:
                part.face((inner[i][k], inner[i][j], inner[i + 1][j], inner[i + 1][k]), [uvs[1], uvs[0], uvs[3], uvs[2]])
    if not closed:
        # Rims: along both open sides and across both ends.
        for i in range(count - 1):
            for j, flip in [(0, False), (width - 1, True)]:
                quad = (rows[i][j], rows[i + 1][j], inner[i + 1][j], inner[i][j])
                part.face(tuple(reversed(quad)) if flip else quad, [cell_uv(color(i, j))] * 4)
        for i, flip in [(0, False), (count - 1, True)]:
            for j in range(width - 1):
                quad = (rows[i][j], inner[i][j], inner[i][j + 1], rows[i][j + 1])
                part.face(tuple(reversed(quad)) if flip else quad, [cell_uv(color(min(i, count - 2), j))] * 4)
    for end, row, flip in [(cap_start, rows[0], True), (cap_end, rows[-1], False)]:
        if not end or not closed:
            continue
        index = 0 if flip else count - 1
        center = sum((Vector(part.verts[r]) for r in row), Vector()) / len(row)
        middle = part.vert(center, weights(index))
        # A gradient cell's end ring color closes it.
        uv = quad_uvs(color(min(index, count - 2), 0), min(index, count - 2), count)[0 if flip else 2]
        for j in range(width):
            k = (j + 1) % width
            tri = (row[k], row[j], middle) if flip else (row[j], row[k], middle)
            part.face(tri, [uv] * 3)
    return rows


def strand(part, points, widths, thickness, weights, cell, normal_hint=Vector((0, 0, 1)), twist=0.0):
    """A tapered ribbon with some thickness (a lock of hair, a sash): diamond sections along `points`.

    `widths[i]` and `thickness[i]` size each section; its colors run down a gradient cell (root to tip).
    """
    count = len(points)
    rows = []
    for i in range(count):
        before = Vector(points[max(i - 1, 0)])
        after = Vector(points[min(i + 1, count - 1)])
        t = (after - before).normalized()
        side = t.cross(normal_hint)
        if side.length < 1e-4:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        out = side.cross(t).normalized()
        if twist:
            angle = twist * i / max(count - 1, 1)
            side, out = side * math.cos(angle) + out * math.sin(angle), out * math.cos(angle) - side * math.sin(angle)
        p = Vector(points[i])
        w, th = widths[i] / 2, thickness[i] / 2
        ring = [p + side * w, p + out * th, p - side * w, p - out * th]
        rows.append([part.vert(q, weights(i)) for q in ring])
    for i in range(count - 1):
        uv0, uv1 = cell_uv(cell, i / (count - 1)), cell_uv(cell, (i + 1) / (count - 1))
        for j in range(4):
            k = (j + 1) % 4
            part.face((rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j]), [uv0, uv0, uv1, uv1])
    root = cell_uv(cell, 0)
    part.face(tuple(reversed(rows[0])), [root] * 4)
    tip = cell_uv(cell, 1)
    part.face(tuple(rows[-1]), [tip] * 4)


def box(part, center, size, weights, cell, rotation=None, smooth=False):
    """A box (a pouch, a buckle): `size` full extents, turned by `rotation` (a 3×3 matrix)."""
    cx, cy, cz = center
    sx, sy, sz = (s / 2 for s in size)
    corners = []
    for dx, dy, dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
        offset = Vector((dx * sx, dy * sy, dz * sz))
        if rotation is not None:
            offset = rotation @ offset
        corners.append(part.vert(Vector((cx, cy, cz)) + offset, weights))
    uv = cell_uv(cell)
    for quad in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        part.face(tuple(corners[q] for q in quad), [uv] * 4, smooth)


def build(name, parts, material, collection):
    """Joins `parts` into one mesh object with UVs and vertex groups."""
    verts, faces, uvs, smooth, weights = [], [], [], [], []
    for part in parts:
        offset = len(verts)
        verts.extend(part.verts)
        weights.extend(part.weights)
        faces.extend(tuple(i + offset for i in f) for f in part.faces)
        uvs.extend(part.uvs)
        smooth.extend(part.smooth)
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    layer = data.uv_layers.new(name="UVMap")
    loop = 0
    for poly, face_uvs in zip(data.polygons, uvs):
        for k in range(poly.loop_total):
            layer.data[poly.loop_start + k].uv = face_uvs[k]
        loop += poly.loop_total
    for poly, flag in zip(data.polygons, smooth):
        poly.use_smooth = flag
    data.materials.append(material)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    groups = {}
    for index, w in enumerate(weights):
        total = sum(w.values())
        for bone, value in w.items():
            if value <= 0:
                continue
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=bone)
            groups[bone].add([index], value / total, "REPLACE")
    # Faces wound inconsistently by hand are turned outward.
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    return obj


def blend(a, b, t):
    """Weights `a` turning into `b` as `t` goes 0 → 1."""
    t = max(0.0, min(1.0, t))
    out = {}
    for name, value in a.items():
        out[name] = out.get(name, 0) + value * (1 - t)
    for name, value in b.items():
        out[name] = out.get(name, 0) + value * t
    return out
