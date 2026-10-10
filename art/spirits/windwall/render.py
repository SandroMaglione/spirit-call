"""Render the editable static source with consistent front key lighting.

Only this temporary render scene has lights and a camera. The saved source
and GLB remain free of presentation helpers.
"""
import json
import math
import os
from pathlib import Path
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
CONFIG=json.loads((HERE/'spirit.json').read_text())
SHEET=json.loads((HERE/'sheet.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(HERE/CONFIG['blend']))
scene=bpy.context.scene; scene.render.engine='BLENDER_EEVEE_NEXT'
scene.view_settings.view_transform='Standard'
scene.render.resolution_x=752;scene.render.resolution_y=800
world=bpy.data.worlds.new('Review');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.0027,.0176,.0319,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=1
scene.world=world
target=Vector((0,0,.35))
for name,pos,energy in (('Key',(-3,-4,6),2.1),('Fill',(4,-2,3),.7),('Rim',(1,4,2),1.0),('LowFill',(0,-4,.7),.8)):
    light=bpy.data.objects.new(name,bpy.data.lights.new(name,'SUN'))
    light.data.energy=energy;light.data.angle=.12
    light.location=Vector(pos)
    light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    scene.collection.objects.link(light)
camera=bpy.data.objects.new('ReviewCamera',bpy.data.cameras.new('ReviewCamera'))
camera.data.type='ORTHO';camera.data.ortho_scale=.94
scene.collection.objects.link(camera);scene.camera=camera
scene.use_nodes=True;tree=scene.node_tree
glare=tree.nodes.new('CompositorNodeGlare');glare.glare_type='FOG_GLOW'
glare.threshold=1;glare.size=6;glare.mix=-.88
tree.links.new(tree.nodes['Render Layers'].outputs['Image'],glare.inputs['Image'])
tree.links.new(glare.outputs['Image'],tree.nodes['Composite'].inputs['Image'])
def direction(turn,elevation):
    t,e=math.radians(turn),math.radians(elevation)
    return Vector((math.sin(t)*math.cos(e),-math.cos(t)*math.cos(e),math.sin(e)))
views={'front':(0,0),'back':(180,0),'left':(-90,0),'right':(90,0),
       'top':(0,90),'bottom':(0,-90),'hero':(5,0),'game':(5,30)}
if os.environ.get('SWEEP'):
    out=Path(os.environ['SWEEP']);out.mkdir(parents=True,exist_ok=True)
    scene.render.resolution_x=376;scene.render.resolution_y=400
    scene.eevee.taa_render_samples=16
    turns=list(range(-30,31,5))+list(range(-90,-49,10))+list(range(50,91,10))+[170,180,190]
    views={f'{t}_{e}':(t,e) for t in turns for e in (0,10,20,30)}
else: out=HERE/'renders'
for name,(turn,elevation) in views.items():
    d=direction(turn,elevation);camera.location=target+d*4
    camera.rotation_euler=(-d).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/f'{name}.png');bpy.ops.render.render(write_still=True)
if not os.environ.get('SWEEP'):
    scene.render.resolution_x=40;scene.render.resolution_y=40
    d=direction(5,30);camera.location=target+d*4
    camera.rotation_euler=(-d).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/'game-size.png');bpy.ops.render.render(write_still=True)
