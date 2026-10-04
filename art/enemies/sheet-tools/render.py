"""Render saved models, and sweep their sheet's hero camera, without editing them.

Usage: Blender --background --python render.py -- <kind> [sweep].
The view directions and game elevation follow art/spirits/tools/render.py.
Transparent silhouettes allow pale bone and dark rock to be scored together.
"""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
kind=sys.argv[sys.argv.index('--')+1]
sweep='sweep' in sys.argv[sys.argv.index('--')+2:]
fit='fit-views' in sys.argv[sys.argv.index('--')+2:]
HERE=ROOT/kind/'production'
config=json.loads((HERE/'spirit.json').read_text())
sheet=json.loads((HERE/'sheet.json').read_text())
audit=json.loads((HERE/'audit.json').read_text())
OUT=HERE/'renders';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(HERE/config['blend']))
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_x=400 if sweep or fit else 640
scene.render.resolution_y=400 if sweep or fit else 640
scene.render.resolution_percentage=100
scene.eevee.taa_render_samples=16 if sweep or fit else 64
scene.view_settings.view_transform='Standard'
world=bpy.data.worlds.new('Review ambient');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.72,.76,.83,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
scene.world=world
for name,rotation in (('sun',(35,0,-35)),('fill',(65,0,155)),('rim',(-90,0,20))):
    energy,color=config['lights'][name]
    light=bpy.data.objects.new(name,bpy.data.lights.new(name,'SUN'))
    light.data.energy=energy;light.data.color=color
    light.rotation_euler=tuple(math.radians(a) for a in rotation)
    scene.collection.objects.link(light)
camera=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'))
camera.data.type='ORTHO';camera.data.ortho_scale=config['ortho']
scene.collection.objects.link(camera);scene.camera=camera
target=Vector((0,0,audit['height_m']/2))

def direction(turn,elevation):
    t,e=math.radians(turn),math.radians(elevation)
    return Vector((math.sin(t)*math.cos(e),-math.cos(t)*math.cos(e),math.sin(e)))

if fit:
    views={f'fit-{v}_{t}_{e}':direction(t,e)
           for v,base in (('front',0),('back',180),('right',90),('left',-90))
           for t in (config.get('view_sweeps',{}).get(v) or (base-10,base,base+10)) for e in (0,10,20,30)}
elif sweep:
    start,stop,step=config['sweep']['turns']
    views={f'sweep{t}_{e}':direction(t,e) for t in range(start,stop+1,step) for e in config['sweep']['elevations']}
else:
    views={'front':Vector((0,-1,0)),'back':Vector((0,1,0)),'right':Vector((1,0,0)),'left':Vector((-1,0,0)),
       'top':Vector((0,0,1)),'bottom':Vector((0,0,-1)),
       'hero':direction(sheet['hero']['turn'],sheet['hero']['elevation']),
       'game':direction(0,30)}
    for view,angles in sheet.get('cameras',{}).items():
        views[view]=direction(angles['turn'],angles['elevation'])
for name,d in views.items():
    camera.location=target+d*5
    if name=='top':camera.rotation_euler=(0,0,0)
    elif name=='bottom':camera.rotation_euler=(math.pi,0,0)
    else:camera.rotation_euler=(-d).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/f'{name}.png');bpy.ops.render.render(write_still=True)
if not sweep and not fit:
    camera.location=target+direction(0,30)*5
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=40 if kind=='guardian' else 32
    scene.render.resolution_y=scene.render.resolution_x
    scene.render.filepath=str(OUT/'game-size.png');bpy.ops.render.render(write_still=True)
    # Face crops use a true frontal camera for symmetry review, independent
    # of the fitted sheet camera. Side eyes also get matching oblique views.
    scene.render.resolution_x=640;scene.render.resolution_y=640
    eyes=[bpy.data.objects[f'Eye.{side}'].location for side in ('L','R')]
    face_target=sum(eyes,Vector())/2
    camera.data.ortho_scale=.48 if kind=='sniper' else .43
    for name,turn in (('face-front',0),('face-left',-55),('face-right',55)):
        camera.location=face_target+direction(turn,0)*5
        camera.rotation_euler=(face_target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/f'{name}.png');bpy.ops.render.render(write_still=True)
    if kind=='charger':
        bomb_target=bpy.data.objects['HandBomb'].location+Vector((0,0,.035))
        camera.data.ortho_scale=.50
        camera.location=bomb_target+direction(-25,15)*5
        camera.rotation_euler=(bomb_target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/'hand-bomb.png');bpy.ops.render.render(write_still=True)
    if kind=='guardian':
        weapon_target=bpy.data.objects['MaceHead'].location
        camera.data.ortho_scale=.60
        camera.location=weapon_target+direction(-35,20)*5
        camera.rotation_euler=(weapon_target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/'weapon.png');bpy.ops.render.render(write_still=True)
        # A straight front view exposes both shoulder caps for symmetry
        # review, with the independently held props temporarily hidden.
        for obj in bpy.data.objects:
            if obj.type=='MESH' and obj.name.startswith(('Shield','Mace')):obj.hide_render=True
        armor_target=Vector((0,0,.94))
        camera.data.ortho_scale=.95
        camera.location=armor_target+direction(0,0)*5
        camera.rotation_euler=(armor_target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/'armor-front.png');bpy.ops.render.render(write_still=True)
print('rendered',kind,list(views))
