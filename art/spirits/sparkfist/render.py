"""Render the editable static model from orthographic and game cameras."""
import math
from pathlib import Path

import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
OUT=HERE/"renders"
OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(HERE/"sparkfist-spirit.blend"))
scene=bpy.context.scene
scene.render.engine="BLENDER_EEVEE_NEXT"
scene.render.resolution_x=900
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.view_settings.view_transform="Standard"
scene.render.film_transparent=True
world=bpy.data.worlds.new("Review world")
world.use_nodes=True
world.node_tree.nodes["Background"].inputs["Color"].default_value=(.17,.21,.28,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value=.9
scene.world=world
for name,location,energy,size in (
    ("Key",(-2,3,4),270,4), ("Fill",(3,1,2),115,3), ("Rim",(0,-3,3),150,3)
):
    obj=bpy.data.objects.new(name,bpy.data.lights.new(name,"AREA"))
    obj.data.energy=energy;obj.data.shape="DISK";obj.data.size=size
    obj.location=location;obj.rotation_euler=(Vector((0,0,.4))-obj.location).to_track_quat("-Z","Y").to_euler()
    scene.collection.objects.link(obj)
camera=bpy.data.objects.new("Review camera",bpy.data.cameras.new("Review camera"))
scene.collection.objects.link(camera);scene.camera=camera
camera.data.type="ORTHO";camera.data.ortho_scale=.99
target=Vector((0,0,.4))
def direction(turn,elevation):
    t,e=math.radians(turn),math.radians(elevation)
    return Vector((math.sin(t)*math.cos(e),math.cos(t)*math.cos(e),math.sin(e)))
views={"front":direction(0,0),"back":direction(180,0),"left":direction(-90,0),
       "right":direction(90,0),"top":direction(0,90),"bottom":direction(0,-90),
       "hero":direction(-24,12),"game":direction(-20,30)}
for name,d in views.items():
    camera.location=target+d*4
    camera.rotation_euler=(-d).to_track_quat("-Z","Y").to_euler()
    scene.render.filepath=str(OUT/f"{name}.png")
    bpy.ops.render.render(write_still=True)
for size in (32,64):
    scene.render.resolution_x=size;scene.render.resolution_y=size
    camera.data.ortho_scale=.88
    scene.render.filepath=str(OUT/f"game-{size}.png")
    bpy.ops.render.render(write_still=True)
print("Rendered orthographic views, hero, game, and 32/64 px samples")
