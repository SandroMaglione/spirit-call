"""Render the actual static geometry, with sheet and true orthographic cameras."""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE/'renders'
OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(HERE/'hearth-spirit.blend'))
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 720
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.color_mode = 'RGBA'
scene.world = bpy.data.worlds.new('Review world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.15,.19,.24,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .75
for name,location,energy,size,color in (
    ('Key',(-2,-3,4),210,4,(1,.84,.76)),
    ('Fill',(3,-1,2),90,3,(.74,.82,1)),
    ('Rim',(0,3,3),170,3,(1,.65,.49)),
):
    light = bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'))
    light.data.energy = energy
    light.data.shape = 'DISK'
    light.data.size = size
    light.data.color = color
    light.location = location
    light.rotation_euler = (Vector((0,0,.43))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.collection.objects.link(light)
# These lights are review helpers only, never saved to the asset or GLB.
light = bpy.data.objects.new('Warm core light',bpy.data.lights.new('Warm core light','POINT'))
light.location = (0,-.25,.49)
light.data.energy = 3
light.data.color = (1,.29,.05)
light.data.shadow_soft_size = .11
scene.collection.objects.link(light)
camera = bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'))
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 1.08
scene.collection.objects.link(camera)
scene.camera = camera
target = Vector((0,0,.475))

def direction(turn,elevation):
    t,e = math.radians(turn),math.radians(elevation)
    return Vector((math.sin(t)*math.cos(e),-math.cos(t)*math.cos(e),math.sin(e)))

views = {'front':(0,10),'left':(72,10),'back':(180,10),'right':(-72,10),
         'top':(0,90),'bottom':(0,-90),'hero':(-20,16),'game':(-20,30),
         'true-front':(0,0),'true-left':(-90,0),'true-right':(90,0),'face':(0,7)}
names = sys.argv[sys.argv.index('--')+1].split(',') if '--' in sys.argv else views
for name in names:
    t,e = views[name]
    d = direction(t,e)
    aim = Vector((0,-.16,.326)) if name=='face' else target
    camera.data.ortho_scale = .48 if name=='face' else 1.08
    camera.location = aim+d*4
    camera.rotation_euler = (-d).to_track_quat('-Z','Y').to_euler()
    if name=='top':
        camera.rotation_euler = (0,0,0)
    elif name=='bottom':
        camera.rotation_euler = (math.pi,0,0)
    scene.render.filepath = str(OUT/f'{name}.png')
    bpy.ops.render.render(write_still=True)
if '--' not in sys.argv:
    d = direction(-20,30)
    camera.location = target+d*4
    camera.rotation_euler = (-d).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale = .96
    for size in (32,64):
        scene.render.resolution_x = size
        scene.render.resolution_y = size
        scene.render.filepath = str(OUT/f'game-{size}.png')
        bpy.ops.render.render(write_still=True)
print('Rendered',list(names))
