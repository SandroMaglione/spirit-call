"""Orthographic sheet views, a hero camera sweep, and gameplay-size renders.

Adapted from art/spirits/tools/render.py for this larger articulated body.
Transparent renders give an exact mesh silhouette, independent of glow,
material darkness and the reference sheet's dimension lines.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
CONFIG=json.loads((HERE/"spirit.json").read_text())
SHEET=json.loads((HERE/"sheet.json").read_text())
SWEEP="--sweep" in sys.argv
OUT=HERE/"renders"/("sweep" if SWEEP else "")
OUT.mkdir(parents=True,exist_ok=True)

def direction(turn,elevation):
    t,e=math.radians(turn),math.radians(elevation)
    return Vector((math.sin(t)*math.cos(e),-math.cos(t)*math.cos(e),math.sin(e)))

bpy.ops.wm.open_mainfile(filepath=str(HERE/CONFIG["blend"]))
scene=bpy.context.scene
scene.render.engine="BLENDER_EEVEE_NEXT"
scene.eevee.taa_render_samples=32 if SWEEP else 64
scene.view_settings.view_transform="Standard"
scene.render.resolution_x=320 if SWEEP else CONFIG["resolution"][0]
scene.render.resolution_y=320 if SWEEP else CONFIG["resolution"][1]
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.image_settings.color_mode="RGBA"
scene.render.film_transparent=True
world=bpy.data.worlds.new("Review world");world.use_nodes=True
world.node_tree.nodes["Background"].inputs["Color"].default_value=(.24,.29,.36,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value=.35
scene.world=world
for name,position,energy,size in (
    ("Key",(-3,-4,6),480,4),
    ("Fill",(4,-2,3),260,5),
    ("Rim",(0,4,5),400,3),
):
    light=bpy.data.objects.new(name,bpy.data.lights.new(name,"AREA"))
    light.data.energy=energy;light.data.shape="DISK";light.data.size=size
    scene.collection.objects.link(light);light.location=position
    light.rotation_euler=(Vector((0,0,.8))-light.location).to_track_quat("-Z","Y").to_euler()
camera=bpy.data.objects.new("Review camera",bpy.data.cameras.new("Review camera"))
scene.collection.objects.link(camera);scene.camera=camera
camera.data.type="ORTHO";camera.data.ortho_scale=CONFIG["ortho"]
target=Vector((0,0,.90))
hero=SHEET["hero"]
if SWEEP:
    start,stop,step=CONFIG["sweep"]["turns"]
    views={f"sweep{t}_{e}":direction(t,e) for t in range(start,stop+1,step) for e in CONFIG["sweep"]["elevations"]}
else:
    views={
        "front":Vector((0,-1,0)),"back":Vector((0,1,0)),
        # This sheet labels its side views opposite to the spirit sheets:
        # LEFT shows the face on the left, RIGHT shows it on the right.
        "left":Vector((1,0,0)),"right":Vector((-1,0,0)),
        "top":Vector((0,0,1)),"bottom":Vector((0,0,-1)),
        "hero":direction(hero["turn"],hero["elevation"]),
        "game":direction(hero["turn"],30),
        "rear-three-quarter":direction(145,25),
        "other-three-quarter":direction(-35,30),
    }
for name,d in views.items():
    camera.location=target+d*6
    if name=="top":camera.rotation_euler=(0,0,0)
    elif name=="bottom":camera.rotation_euler=(math.pi,0,0)
    else:camera.rotation_euler=(-d).to_track_quat("-Z","Y").to_euler()
    scene.render.filepath=str(OUT/f"{name}.png")
    bpy.ops.render.render(write_still=True)
if not SWEEP:
    for size in (32,48,64):
        scene.render.resolution_x=scene.render.resolution_y=size
        d=direction(hero["turn"],30)
        camera.location=target+d*6;camera.rotation_euler=(-d).to_track_quat("-Z","Y").to_euler()
        scene.render.filepath=str(OUT/f"game-size-{size}.png")
        bpy.ops.render.render(write_still=True)
print("Rendered",len(views),"views to",OUT)
