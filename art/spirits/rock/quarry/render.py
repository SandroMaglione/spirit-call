"""Render the static source's reference angles, game camera and close-ups.

Only the render scene receives cameras, lights, floor and eye bloom.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE / "quarry.blend"))
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 640
scene.render.resolution_y = 560
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.render.image_settings.file_format = "PNG"
world = bpy.data.worlds.new("Studio")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.06,.075,.09,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .55
scene.world = world
scene.render.film_transparent = True
for name, energy, color, rotation in (
    ("Key", 3.4, (1,.95,.88), (35,-20,-35)),
    ("Fill", .95, (.78,.86,1), (65,0,125)),
    ("Rim", 1.05, (1,.94,.80), (115,0,160)),
):
    light = bpy.data.objects.new(name, bpy.data.lights.new(name,"SUN"))
    light.data.energy = energy
    light.data.color = color
    light.data.angle = math.radians(12)
    light.rotation_euler = tuple(math.radians(a) for a in rotation)
    scene.collection.objects.link(light)
camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
camera.data.type = "ORTHO"
camera.data.ortho_scale = 1.18
scene.collection.objects.link(camera)
scene.camera = camera
target = Vector((0,0,.315))

def direction(turn, elevation):
    t,e = math.radians(turn),math.radians(elevation)
    return Vector((math.sin(t)*math.cos(e),-math.cos(t)*math.cos(e),math.sin(e)))

def render(name, turn, elevation, focus=None, span=1.18):
    aim = Vector(focus) if focus else target
    d = direction(turn,elevation)
    camera.location = aim+d*4
    camera.rotation_euler = (-d).to_track_quat("-Z","Y").to_euler()
    if abs(elevation) == 90:
        # The sheet places the head at the top of its top and bottom views.
        camera.rotation_euler = (0,0,math.pi) if elevation > 0 else (math.pi,0,0)
    camera.data.ortho_scale = span
    underside = None
    if elevation == -90:
        underside = bpy.data.objects.new("Underside fill",bpy.data.lights.new("Underside fill","SUN"))
        underside.data.energy = 2.0
        underside.rotation_euler = (math.pi,0,0)
        scene.collection.objects.link(underside)
    scene.render.filepath = str(HERE / f"renders/{name}.png")
    bpy.ops.render.render(write_still=True)
    if underside:
        bpy.data.objects.remove(underside,do_unlink=True)

views = {"front":(0,0), "back":(180,0), "left":(-74,10), "right":(74,10),
         "top":(0,90), "bottom":(0,-90), "hero":(-30,20), "game":(-35,30)}
if "--sweep" in sys.argv:
    scene.render.resolution_x = 320
    scene.render.resolution_y = 280
    views = {}
    for name,turns in (("front",(-16,-8,0)),("back",(172,180,188)),("left",(-90,-82,-74)),("right",(90,82,74))):
        for turn in turns:
            for e in (0,10,20):
                views[f"candidate-{name}-{turn}-{e}"] = (turn,e)
if "--geometry-fit" in sys.argv:
    scene.render.resolution_x = 320
    scene.render.resolution_y = 280
    objects = [o for o in bpy.data.objects if o.type == "MESH"]
    rest = {o.name:o.location.copy() for o in objects}
    for depth in (.82,.9,1.0):
        for offset in (0,.055):
            for o in objects:
                o.location = rest[o.name].copy()
                o.location.y *= depth
                o.scale.y = depth
                if o.name.startswith("Stone.Rear."):
                    o.location.x -= math.copysign(offset,o.location.x)
            for view in ("front","back","left","right","hero","top"):
                t,e = views[view]
                render(f"geometry-{depth}-{offset}-{view}",t,e)
    sys.exit(0)
for name, (turn,elevation) in views.items():
    render(name,turn,elevation)
if "--sweep" not in sys.argv:
    render("face-detail",-8,10,(0,-.35,.295),.52)
    render("moss-detail",-35,35,(0,.01,.5),.85)
    scene.render.resolution_x = 64
    scene.render.resolution_y = 64
    render("game-size",-35,30,span=1.18)
    # A studio beauty image receives the ground only after scoring views.
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1000
    scene.render.film_transparent = False
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (.0056,.011,.018,1)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002))
    ground = bpy.context.object
    ground.name = "Review floor"
    mat = bpy.data.materials.new("Review floor")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.008,.018,.027,1)
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1
    ground.data.materials.append(mat)
    scene.use_nodes = True
    glare = scene.node_tree.nodes.new("CompositorNodeGlare")
    glare.glare_type = "FOG_GLOW"
    glare.threshold = 1.1
    glare.size = 7
    glare.mix = -.8
    scene.node_tree.links.new(scene.node_tree.nodes["Render Layers"].outputs["Image"],glare.inputs["Image"])
    scene.node_tree.links.new(glare.outputs["Image"],scene.node_tree.nodes["Composite"].inputs["Image"])
    render("quarry",-30,20,span=1.24)
print("Rendered",list(views))
