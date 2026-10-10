"""Quarry's static moss-covered stone spirit, in Blender Z up / -Y forward.

Separate named stones allow a later object-animation pass. This script
creates no rig or clips and never edits the existing Rock Spirit asset.
"""
import hashlib
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
SHEET = json.loads((HERE / "sheet.json").read_text())
RNG = random.Random(73)

def linear(hex_color):
    rgb = [int(hex_color[i:i+2], 16)/255 for i in (1, 3, 5)]
    return [c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in rgb]

def material(name, color=None, glow=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = .95
    bsdf.inputs["Specular IOR Level"].default_value = .15
    if color:
        bsdf.inputs["Base Color"].default_value = (*linear(color), 1)
    else:
        vertex = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        vertex.layer_name = "Color"
        mat.node_tree.links.new(vertex.outputs["Color"], bsdf.inputs["Base Color"])
    if glow:
        bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
        bsdf.inputs["Emission Color"].default_value = (*linear(color), 1)
        bsdf.inputs["Emission Strength"].default_value = 2.4
    return mat

def mesh(name, vertices, faces, mat, kind=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    # Ring generation and the boolean must agree on outward normals.
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    if kind:
        colors(obj, kind)
    return obj

def colors(obj, kind):
    if "Color" in obj.data.color_attributes:
        obj.data.color_attributes.remove(obj.data.color_attributes["Color"])
    attr = obj.data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    for face in obj.data.polygons:
        if kind == "moss":
            # A few nearby greens keep one continuous moss mantle readable.
            palette = ["#9db83c", "#8fa636", "#a6bc42", "#80962e", "#b0c449"]
            rgb = linear(RNG.choice(palette))
            factor = RNG.uniform(.9, 1.07)
        elif kind == "core":
            rgb = linear(RNG.choice(["#514a43", "#5c5149", "#62564c", "#4b4641"]))
            factor = RNG.uniform(.9, 1.04)
        else:
            rgb = linear(SHEET["palette"]["stone_light"])
            factor = RNG.uniform(.72, 1.08)
        for index in face.loop_indices:
            attr.data[index].color = (*[min(1, c*factor) for c in rgb], 1)

def stone(name, center, rings, segments, mat, lean=0):
    """Angular section rings; heights and outlines follow the turnaround."""
    verts, faces = [], []
    for i, (z, rx, ry) in enumerate(rings):
        for j in range(segments):
            a = j*math.tau/segments + i*.17 + RNG.uniform(-.04,.04)
            # Irregular interior rows prevent a latitude-band appearance.
            gap = min(rings[i][0]-rings[i-1][0], rings[i+1][0]-rings[i][0]) if i not in (0,len(rings)-1) else 0
            jitter = RNG.uniform(-1,1)*min(.022,gap*.24)
            wobble = RNG.uniform(.94, 1.06) if i not in (0, len(rings)-1) else 1
            verts.append((center[0] + math.cos(a)*rx*wobble + lean*(z-.2),
                          center[1] + math.sin(a)*ry*wobble, center[2]+z+jitter))
    for i in range(len(rings)-1):
        for j in range(segments):
            a, b = i*segments+j, i*segments+(j+1)%segments
            c, d = b+segments, a+segments
            faces.extend([(a, b, d), (b, c, d)] if (i+j)%2 else [(a, b, c), (a, c, d)])
    faces.extend([tuple(reversed(range(segments))), tuple(range((len(rings)-1)*segments, len(rings)*segments))])
    return mesh(name, verts, faces, mat, "stone")

def moss(mat):
    """One closed cap with a sloping dome and a chunky irregular skirt."""
    n = 24
    verts, faces = [], []
    # The front rim is behind the brow; the side skirt hangs lower.
    rings = [(1.0, .337), (.99, .408), (.87, .493), (.67, .554), (.38, .588), (.10, .603)]
    for i, (radius, z) in enumerate(rings):
        for j in range(n):
            a = j*math.tau/n + i*.08 + RNG.uniform(-.035,.035)
            variation = RNG.uniform(-.012, .012)
            side = abs(math.cos(a))
            front = max(0, -math.sin(a))
            zz = z + variation
            if i == 0:
                zz -= .055*side + (.035 if j % 3 == 0 else 0)
                zz += .045*front
            wobble = RNG.uniform(.965,1.035)
            x = math.cos(a)*.337*radius*wobble
            y = .035 + math.sin(a)*.322*radius*wobble
            verts.append((x, y, zz))
    for i in range(len(rings)-1):
        for j in range(n):
            a, b = i*n+j, i*n+(j+1)%n
            c, d = b+n, a+n
            faces.extend([(a,b,c),(a,c,d)] if (i+j)%2 else [(a,b,d),(b,c,d)])
    faces.extend([tuple(reversed(range(n))), tuple(range((len(rings)-1)*n, len(rings)*n))])
    return mesh("MossCap", verts, faces, mat, "moss")

def recess(head, dark):
    # A real pocket in the head, with sloped sides and a recessed backing.
    outline = [(-.159,.254),(-.134,.327),(-.071,.347),(.063,.345),
               (.137,.311),(.154,.231),(.092,.158),(-.084,.155)]
    def backing(z):
        return -.375 + (z-.24)*.23
    rear = [(x*.86, .24+(z-.24)*.88) for x,z in outline]
    vertices = [(x,-.65,z) for x,z in outline] + [(x,backing(z),z) for x,z in rear]
    n = len(outline)
    faces = [tuple(reversed(range(n))), tuple(range(n,2*n))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    cutter = mesh("Socket cutter", vertices, faces, dark)
    head.data.materials.append(dark)
    modifier = head.modifiers.new("Carved face", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.context.view_layer.objects.active = head
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    colors(head, "stone")
    # The recess shares the vertex-color material with every stone. Keep
    # its dark color in the mesh rather than paying another material slot.
    for face in head.data.polygons:
        if face.material_index == 1:
            for index in face.loop_indices:
                head.data.color_attributes["Color"].data[index].color = (*linear("#292624"),1)
            face.material_index = 0
    head.data.materials.pop(index=1)
    tree = BVHTree.FromPolygons([v.co for v in head.data.vertices], [p.vertices for p in head.data.polygons])
    return tree

def eye(side, head, tree, mat):
    x, z = side*.0525, .237
    # The measured glowing cores average 11 px wide by 24 px high.
    width, height = .034, .077
    coords = [(x,z)] + [(x+math.cos(i*math.tau/32)*width/2,
                        z+math.sin(i*math.tau/32)*height/2) for i in range(32)]
    vertices = []
    for px,pz in coords:
        hit, normal, _, _ = tree.ray_cast(Vector((px,-1,pz)), Vector((0,1,0)))
        assert hit is not None, "Eye leaves the socket"
        vertices.append(tuple(hit + normal*.002))
    obj = mesh(f"Eye.{'L' if side < 0 else 'R'}", vertices,
               [(0,i+1,(i+1)%32+1) for i in range(32)], mat)
    return obj

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stone_mat = material("Quarry facets")
    moss_mat = core_mat = stone_mat
    amber = material("Amber eyes", "#ffe07b", True)
    dark = material("Face recess", "#292624")
    core = stone("BodyCore", (0,.025,0), [(.09,.12,.14),(.14,.245,.27),(.23,.298,.31),
                 (.34,.295,.30),(.44,.23,.24),(.49,.13,.13)], 16, core_mat)
    colors(core, "core")
    for side in (-1,1):
        label = "L" if side < 0 else "R"
        for end, y in (("Front",-.205),("Rear",.227)):
            # Broad shoulders taper to blunt planted points like the sheet.
            rings = [(0,.024,.063),(.095,.072,.118),(.23,.15,.168),
                     (.315,.136,.15),(.38,.095,.102),(.414,.047,.045)]
            stone(f"Stone.{end}.{label}", (side*.342,y,0), rings, 10, stone_mat, -side*.22)
        cheek = stone(f"Cheek.{label}", (side*.145,-.395,0),
              [(.079,.026,.028),(.11,.055,.046),(.151,.059,.05),(.181,.025,.025)], 8, stone_mat, -side*.16)
        # The detail panel shows moss at the inner upper cheek corners.
        for face in cheek.data.polygons:
            if face.center.z > .145 and face.center.x*side < .145:
                for index in face.loop_indices:
                    cheek.data.color_attributes["Color"].data[index].color = (*linear("#809638"),1)
    moss(moss_mat)
    head = stone("Head", (0,-.328,0), [(.14,.067,.075),(.19,.14,.12),(.28,.196,.157),
                 (.37,.198,.145),(.445,.15,.105),(.492,.075,.041)], 16, stone_mat)
    tree = recess(head, dark)
    for side in (-1,1):
        eye(side,head,tree,amber)
    stone("CrownStone", (0,.023,0), [(.571,.075,.07),(.595,.105,.097),
          (.616,.085,.072),(.627,.036,.03)], 10, stone_mat)
    # The back view exposes a broad heel beneath the moss.
    stone("RearStone", (0,.275,0), [(.078,.08,.05),(.116,.145,.093),
          (.19,.19,.112),(.271,.16,.106),(.307,.088,.057)], 12, stone_mat)
    bpy.data.materials.remove(dark)
    root = bpy.data.objects.new("Quarry", None)
    bpy.context.collection.objects.link(root)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    # The painted side views are shallower than the literal top drawing.
    # A small compromise retains the top silhouette and shortens the side.
    for obj in meshes:
        for vertex in obj.data.vertices:
            vertex.co.y *= .96
            if obj.name.startswith("Stone.Rear."):
                vertex.co.x -= math.copysign(.03, vertex.co.x)
    for obj in meshes:
        # Origins at each part's center preserve future object animation.
        center = sum((v.co for v in obj.data.vertices), Vector()) / len(obj.data.vertices)
        for v in obj.data.vertices:
            v.co -= center
        obj.location = center
        obj.parent = root
    bpy.context.view_layer.update()
    vertices = [obj.matrix_world @ v.co for obj in meshes for v in obj.data.vertices]
    bounds = [[min(v[k] for v in vertices), max(v[k] for v in vertices)] for k in range(3)]
    manifold = {}
    for obj in meshes:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        manifold[obj.name] = all(edge.is_manifold for edge in bm.edges)
        bm.free()
    assert all(value for name,value in manifold.items() if not name.startswith("Eye"))
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "quarry.blend"))
    bpy.ops.export_scene.gltf(filepath=str(HERE / "quarry.glb"), export_format="GLB",
        export_apply=True, export_vertex_color="ACTIVE", export_animations=False,
        export_cameras=False, export_lights=False)
    audit = {"status":"static model, awaiting visual review", "triangles":sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),
             "materials":[m.name for m in bpy.data.materials], "objects":[o.name for o in meshes],
             "bounds_blender_m":bounds, "height_m":bounds[2][1], "width_m":bounds[0][1]-bounds[0][0],
             "depth_m":bounds[1][1]-bounds[1][0], "closed_meshes":manifold,
             "animations":0,"skeletons":0,"height_basis":"ground origin to highest static mesh vertex",
             "coordinates":"GLB +Y up, +Z forward; Blender +Z up, -Y forward"}
    for file in ("quarry.blend","quarry.glb","reference/sheet.png"):
        audit[file+"_sha256"] = hashlib.sha256((HERE/file).read_bytes()).hexdigest()
    (HERE / "audit.json").write_text(json.dumps(audit,indent=2)+"\n")
    print(json.dumps(audit))

if __name__ == "__main__":
    main()
