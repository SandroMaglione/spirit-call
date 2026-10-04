"""Render saved models, and sweep their sheet's hero camera, without editing them.

Usage: Blender --background --python render.py -- <kind> [sweep].
The view directions and game elevation follow art/spirits/tools/render.py.
Transparent silhouettes allow pale bone and dark rock to be scored together.
"""
import json
import math
import sys
import subprocess
import tempfile
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
kind=sys.argv[sys.argv.index('--')+1]
sweep='sweep' in sys.argv[sys.argv.index('--')+2:]
face='face' in sys.argv[sys.argv.index('--')+2:]
before='before' in sys.argv[sys.argv.index('--')+2:]
HERE=ROOT/kind/'production'
config=json.loads((HERE/'spirit.json').read_text())
sheet=json.loads((HERE/'sheet.json').read_text())
audit=json.loads((HERE/'audit.json').read_text())
OUT=HERE/'renders';OUT.mkdir(exist_ok=True)
source=HERE/config['blend']
if before:
    saved=Path(tempfile.gettempdir())/f'{kind}-face-before.blend'
    saved.write_bytes(subprocess.check_output(['git','show',f'HEAD:{source.relative_to(ROOT.parents[1])}']))
    source=saved
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_x=400 if sweep else 640
scene.render.resolution_y=400 if sweep else 640
scene.render.resolution_percentage=100
scene.eevee.taa_render_samples=16 if sweep else 64
scene.view_settings.view_transform='Standard'
world=bpy.data.worlds.new('Review ambient');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.72,.76,.83,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
scene.world=world
for name,rotation in (('sun',(35,0,-35)),('fill',(65,0,155)),('rim',(-90,0,20)),('ambient-front',(70,0,0)),('ambient-back',(70,0,180))):
    energy,color=config['lights'].get(name,[.7,[1,1,1]])
    light=bpy.data.objects.new(name,bpy.data.lights.new(name,'SUN'))
    light.data.energy=energy;light.data.color=color
    light.rotation_euler=tuple(math.radians(a) for a in rotation)
    scene.collection.objects.link(light)
camera=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'))
camera.data.type='ORTHO';camera.data.ortho_scale=config['ortho']
scene.collection.objects.link(camera);scene.camera=camera
target=Vector((0,0,audit['height_m']/2))
if face:
    shell=bpy.data.objects['PointedHood' if kind=='gale-caster' else 'Helmet']
    zs=[(shell.matrix_world@v.co).z for v in shell.data.vertices]
    target=Vector((0,-.12,(min(zs)+max(zs))/2))
    camera.data.ortho_scale=.44 if kind=='gale-caster' else .58

def direction(turn,elevation):
    t,e=math.radians(turn),math.radians(elevation)
    return Vector((math.sin(t)*math.cos(e),-math.cos(t)*math.cos(e),math.sin(e)))

if face:
    views={'face-front':direction(0,0),'face-three-quarter':direction(30,12)}
elif sweep:
    start,stop,step=config['sweep']['turns']
    views={f'sweep{t}_{e}':direction(t,e) for t in range(start,stop+1,step) for e in config['sweep']['elevations']}
else:
    views={'front':Vector((0,-1,0)),'back':Vector((0,1,0)),'right':Vector((1,0,0)),'left':Vector((-1,0,0)),
       'top':Vector((0,0,1)),'bottom':Vector((0,0,-1)),
       'hero':direction(sheet['hero']['turn'],sheet['hero']['elevation']),
       'game':direction(sheet['hero']['turn'],30)}
for name,d in views.items():
    camera.location=target+d*5
    if name=='top':camera.rotation_euler=(0,0,0)
    elif name=='bottom':camera.rotation_euler=(math.pi,0,0)
    else:camera.rotation_euler=(-d).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/f'{name}{"-before" if before else ""}.png');bpy.ops.render.render(write_still=True)
if not sweep and not face:
    camera.location=target+direction(sheet['hero']['turn'],30)*5
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=48 if kind=='juggernaut' else 32
    scene.render.resolution_y=scene.render.resolution_x
    scene.render.filepath=str(OUT/'game-size.png');bpy.ops.render.render(write_still=True)
print('rendered',kind,list(views))
