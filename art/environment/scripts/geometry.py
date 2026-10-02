"""Small, deterministic mesh tools for the environment sources. Blender coordinates."""
import math

import bmesh
import bpy
from mathutils import Vector


def rgba(value):
    def linear(c):
        return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
    return tuple(linear(int(value[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1,)


def palette_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .87
    shader.inputs['Specular IOR Level'].default_value = .25
    color = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Color'
    mat.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
    return mat


class Mesh:
    def __init__(self):
        self.vertices, self.faces, self.shades = [], [], []

    def shell(self, rings, shades, cyclic=False):
        start, n = len(self.vertices), len(rings[0])
        assert all(len(r) == n for r in rings)
        self.vertices.extend(v for ring in rings for v in ring)
        if not cyclic:
            self.faces.append(tuple(start + i for i in reversed(range(n))))
            self.shades.append(shades[0])
        for row in range(len(rings) if cyclic else len(rings) - 1):
            following = (row + 1) % len(rings)
            for i in range(n):
                j = (i + 1) % n
                self.faces.append((start + row * n + i, start + row * n + j,
                                   start + following * n + j, start + following * n + i))
                self.shades.append(shades[min(row, len(shades) - 1)])
        if not cyclic:
            self.faces.append(tuple(start + (len(rings) - 1) * n + i for i in range(n)))
            self.shades.append(shades[-1])
        return self

    def box(self, x, y, z, w, d, h, shade='stone', bevel=.025, top=None):
        b = min(bevel, w * .18, d * .18, h * .25)
        def ring(width, depth, c, elevation):
            return [(x + a, y + b, elevation) for a, b in [
                (-width / 2 + c, -depth / 2), (width / 2 - c, -depth / 2),
                (width / 2, -depth / 2 + c), (width / 2, depth / 2 - c),
                (width / 2 - c, depth / 2), (-width / 2 + c, depth / 2),
                (-width / 2, depth / 2 - c), (-width / 2, -depth / 2 + c)]]
        return self.shell([ring(w - b, d - b, b * .6, z), ring(w, d, b, z + b / 2),
                           ring(w, d, b, z + h - b / 2), ring(w - b, d - b, b * .6, z + h)],
                          [shade, shade, top or shade])

    def lathe(self, profile, shades, n=12, center=(0, 0, 0), cyclic=False):
        x, y, z = center
        return self.shell([[(x + r * math.cos(i * math.tau / n),
                             y + r * math.sin(i * math.tau / n), z + height)
                            for i in range(n)] for r, height in profile], shades, cyclic)

    def beam(self, a, b, radius, shade='wood', n=8, radius_end=None):
        a, b = Vector(a), Vector(b)
        direction = (b - a).normalized()
        tangent = direction.cross(Vector((0, 0, 1)))
        if tangent.length < .01:
            tangent = direction.cross(Vector((0, 1, 0)))
        tangent.normalize()
        normal = direction.cross(tangent).normalized()
        return self.shell([[tuple(center + (tangent * math.cos(i * math.tau / n)
                           + normal * math.sin(i * math.tau / n)) * r) for i in range(n)]
                           for center, r in [(a, radius), (b, radius if radius_end is None else radius_end)]], [shade])

    def rock(self, x, y, z, w, d, h, shade='stone', seed=0):
        return self.shell([[(x + w / 2 * r * (1 + .07 * math.sin(i * 2.3 + seed)) * math.cos(i * math.tau / 7 + twist),
                             y + d / 2 * r * (1 + .07 * math.cos(i * 1.7 + seed)) * math.sin(i * math.tau / 7 + twist), z + hz)
                            for i in range(7)] for r, hz, twist in [(.82, 0, 0), (1, h * .3, 0), (.77, h * .8, .1), (.42, h, .14)]],
                          [shade, shade, 'light' if shade == 'stone' else shade])

    def arch(self, width, spring, thickness=.25, depth=.45, shade='stone'):
        r = width / 2
        # Separate voussoirs have solid end faces and visible, narrow joints.
        for i in range(9):
            a, b = i * math.pi / 9 + .007, (i + 1) * math.pi / 9 - .007
            profile = [(r * math.cos(a), spring + r * math.sin(a)),
                       ((r + thickness) * math.cos(a), spring + (r + thickness) * math.sin(a)),
                       ((r + thickness) * math.cos(b), spring + (r + thickness) * math.sin(b)),
                       (r * math.cos(b), spring + r * math.sin(b))]
            self.shell([[(x, y, z) for x, z in profile] for y in (-depth / 2, depth / 2)], [shade if i % 3 else 'light'])
        return self

    def move(self, x=0, y=0, z=0):
        self.vertices = [(a + x, b + y, c + z) for a, b, c in self.vertices]
        return self

    def rotate(self, angle, axis='Z'):
        from mathutils import Matrix
        matrix = Matrix.Rotation(angle, 3, axis)
        self.vertices = [tuple(matrix @ Vector(v)) for v in self.vertices]
        return self

    def join(self, other):
        offset = len(self.vertices)
        self.vertices.extend(other.vertices)
        self.faces.extend(tuple(i + offset for i in f) for f in other.faces)
        self.shades.extend(other.shades)
        return self

    def object(self, name, palette, material, collection, parent=None, offset=(0, 0, 0)):
        data = bpy.data.meshes.new(name)
        data.from_pydata(self.vertices, [], self.faces)
        data.update()
        data.materials.append(material)
        colors = data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for face, shade in zip(data.polygons, self.shades):
            for i in face.loop_indices:
                colors.data[i].color = rgba(palette[shade])
        data.color_attributes.active_color = colors
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.parent = parent
        obj.location = offset
        return obj
