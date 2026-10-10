"""Adapt the approved Ice rest mesh for Sparkfist, preserving animation pivots."""
import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "ice" / "ice-spirit.blend"
PALETTE = {
    "body": ["#392362", "#7953c5", "#c8a8fa"],
    "shards": ["#bd701b", "#ffd658", "#fff3b5"],
    "face": "#191a35", "eyes": "#fff0a1", "bolt": "#ffe476",
}

def linear(color):
    rgb = [int(color[i:i+2], 16)/255 for i in (1, 3, 5)]
    return tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in rgb)

def flat_color(mat, color, emission=0):
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*linear(color), 1)
    bsdf.inputs["Emission Color"].default_value = (*linear(color), 1)
    bsdf.inputs["Emission Strength"].default_value = emission

bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
bpy.context.view_layer.update()
source_swatches = json.loads((SOURCE.parent / "sheet.json").read_text())["swatches"]
source_shades = [Vector(linear(source_swatches[k])) for k in ("blue", "ice", "white")]
body = bpy.data.objects["IceSpirit"]
# Keep the inherited node name: the accepted clips bind to it.
surface = body.data.materials[0]
surface.name = "Sparkfist faceted violet and gold"
face = body.data.materials[1]
face.name = "Sparkfist dark face"
flat_color(face, PALETTE["face"])
eyes = bpy.data.objects["Eye.L"].data.materials[0]
eyes.name = "Sparkfist warm electric eyes"
flat_color(eyes, PALETTE["eyes"], 1.7)

for obj in bpy.context.scene.objects:
    if obj.name.startswith("Eye"):
        continue
    colors = obj.data.color_attributes["Color"]
    shades = [linear(c) for c in PALETTE["shards" if obj.name.startswith("Shard") else "body"]]
    for poly in obj.data.polygons:
        if poly.material_index == 1:
            continue
        for loop in poly.loop_indices:
            # Recover the original shade, preserving its broad color planes
            # across the triangles that subdivide each production facet.
            original = Vector(colors.data[loop].color[:3])
            candidates = []
            for index in range(2):
                start, end = source_shades[index:index+2]
                delta = end-start
                t = max(0, min(1, (original-start).dot(delta)/delta.length_squared))
                candidates.append(((original-(start+delta*t)).length_squared, (index+t)/2))
            brightness = min(candidates)[1]
            if not obj.name.startswith("Shard"):
                brightness = .04 + .82*brightness
            a, b, t = (shades[0], shades[1], brightness*2) if brightness < .5 else (shades[1], shades[2], (brightness-.5)*2)
            rgb = tuple(x+(y-x)*t for x,y in zip(a,b))
            colors.data[loop].color = (*rgb, 1)

# A shallow, closed gold bolt follows one planar rear facet. Joining it to
# the body makes it follow every existing clip without another track.
tree = BVHTree.FromPolygons([v.co for v in body.data.vertices], [p.vertices for p in body.data.polygons])
outline = [(-.010,.605), (.021,.605), (.002,.557), (.020,.557),
           (-.019,.490), (-.006,.543), (-.025,.543)]
vertices = []
for offset in (.0008, .0024):
    for x,z in outline:
        origin = body.matrix_world.inverted() @ Vector((x+.040,-1,z))
        hit, normal, _, _ = tree.ray_cast(origin, Vector((0,1,0)))
        assert hit is not None, "Rear bolt must stay on the body"
        vertices.append(body.matrix_world @ (hit + Vector((0,-offset,0))))
n = len(outline)
faces = [tuple(range(n-1,-1,-1)), tuple(range(n,2*n))]
faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh = bpy.data.meshes.new("Rear lightning mark")
mesh.from_pydata(vertices, [], faces)
mesh.materials.append(surface)
colors = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
for c in colors.data:
    c.color = (*linear(PALETTE["bolt"]),1)
bolt = bpy.data.objects.new("Rear lightning mark", mesh)
bpy.context.scene.collection.objects.link(bolt)
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bolt.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
import bmesh
bm = bmesh.new()
bm.from_mesh(body.data)
bmesh.ops.triangulate(bm, faces=list(bm.faces))
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(body.data)
bm.free()
for poly in body.data.polygons:
    poly.use_smooth = False

scene = bpy.context.scene
scene["asset"] = "Sparkfist thunder spirit, static review"
scene["reference_policy"] = "Approved Ice geometry and pivots; violet/gold palette and rear lightning mark."
scene["stage"] = "Static review before animation export or game wiring."
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "sparkfist-spirit.blend"))
(HERE / "adaptation.json").write_text(json.dumps({
    "source": "../ice/ice-spirit.blend", "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    "palette": PALETTE, "preserved": ["silhouette", "dimensions", "eight node names", "local pivots", "face recess"],
    "detail": "Closed rear lightning mark joined to IceSpirit, sharing its vertex-color material",
    "animation": "Existing Ice clips retained as the recipe for the next pass; no clips exported here",
}, indent=2)+"\n")
