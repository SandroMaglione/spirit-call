"""Render representative poses from the editable animation source."""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import animate

OUT = HERE / "renders" / "animation"
OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(HERE / "ice-spirit-animated.blend"))
base = json.loads((HERE / "animation.json").read_text())["animation_base"]
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 420
scene.render.resolution_y = 500
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("Animation review world")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.17,.21,.28,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .9
scene.world = world
for name, location, energy, size in (
    ("Key",(-2,-3,4),270,4), ("Fill",(3,-1,2),115,3), ("Rim",(0,3,3),150,3)
):
    obj = bpy.data.objects.new(name,bpy.data.lights.new(name,"AREA"))
    obj.data.energy = energy
    obj.data.shape = "DISK"
    obj.data.size = size
    obj.location = location
    obj.rotation_euler = (Vector((0,0,.43))-obj.location).to_track_quat("-Z","Y").to_euler()
    scene.collection.objects.link(obj)
camera = bpy.data.objects.new("Animation camera",bpy.data.cameras.new("Animation camera"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = 1.17
target = Vector((0,0,.46))
t,e = math.radians(24),math.radians(12)
d = Vector((math.sin(t)*math.cos(e),-math.cos(t)*math.cos(e),math.sin(e)))
camera.location = target+d*4
camera.rotation_euler = (-d).to_track_quat("-Z","Y").to_euler()
poses = {"Idle":15,"Run":4,"AttackA":4,"AttackB":4,"AttackC":6,
         "Power":6,"Dash":3,"Hurt":1,"Cast":2,"Ultimate":5}
for name, frame in poses.items():
    animate.apply_frame(name,frame,base)
    scene.render.filepath = str(OUT/f"{name}.png")
    bpy.ops.render.render(write_still=True)
print("Rendered ten animation poses")
