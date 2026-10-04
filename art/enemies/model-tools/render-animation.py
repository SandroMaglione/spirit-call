"""Render saved animation poses from the game's 30 degree camera."""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
kind=sys.argv[sys.argv.index('--')+1];here=ROOT/kind/'production';folder=here/'animated'
info=json.loads((folder/'model-info.json').read_text());config=json.loads((here/'spirit.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(folder/(kind+'.blend')))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT';scene.eevee.taa_render_samples=32
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_x=scene.render.resolution_y=480;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
world=bpy.data.worlds.new('Review ambient');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.72,.76,.83,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45;scene.world=world
for name,rotation in (('sun',(35,0,-35)),('fill',(65,0,155)),('rim',(-90,0,20))):
    energy,color=config['lights'][name];obj=bpy.data.objects.new(name,bpy.data.lights.new(name,'SUN'))
    obj.data.energy=energy;obj.data.color=color;obj.rotation_euler=tuple(math.radians(a) for a in rotation)
    scene.collection.objects.link(obj)
camera=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'));scene.collection.objects.link(camera);scene.camera=camera
camera.data.type='ORTHO';camera.data.ortho_scale=info['height']*(1.85 if kind=='brute' else 1.65)
target=Vector((0,0,info['height']*.56));turn=math.radians(45)
camera.location=target+Vector((math.sin(turn)*math.cos(math.pi/6),-math.cos(turn)*math.cos(math.pi/6),.5))*5
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
out=folder/'renders';out.mkdir(exist_ok=True)
poses=[('Idle',0),('Run',.15),('Windup',.72),('Windup',1),('Active',.4),('Recovery',.35),('Hurt',.1)]
suffix={'stalker':'Blink'}.get(kind)
if suffix:poses += [('Windup'+suffix,.72),('Windup'+suffix,1),('Recovery'+suffix,.35)]
if kind=='warden':poses += [('Buff',.4),('Buff',.8)]
for action,seconds in poses:
    rig.animation_data.action=bpy.data.actions[action];scene.frame_set(round(seconds*30)+1)
    scene.render.filepath=str(out/f'{action}-{seconds:g}.png');bpy.ops.render.render(write_still=True)
print('RENDERED',kind,len(poses))
