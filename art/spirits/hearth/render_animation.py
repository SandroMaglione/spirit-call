"""Render the editable animation poses for a review contact sheet."""
import math
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE/'renders'/'animation'
OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(HERE/'hearth-animated.blend'))
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 360
scene.render.resolution_y = 440
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds.new('Animation review world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.15,.19,.24,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .75
for name, location, energy, size, color in (
    ('Key',(-2,-3,4),210,4,(1,.84,.76)),
    ('Fill',(3,-1,2),90,3,(.74,.82,1)),
    ('Rim',(0,3,3),170,3,(1,.65,.49)),
):
    light = bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'))
    light.data.energy = energy; light.data.shape = 'DISK'
    light.data.size = size; light.data.color = color
    light.location = location
    light.rotation_euler = (Vector((0,0,.43))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.collection.objects.link(light)
camera = bpy.data.objects.new('Animation review camera',bpy.data.cameras.new('Animation review camera'))
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 1.65
scene.collection.objects.link(camera)
scene.camera = camera
turn, elevation = math.radians(-20), math.radians(30)
direction = Vector((math.sin(turn)*math.cos(elevation), -math.cos(turn)*math.cos(elevation), math.sin(elevation)))
camera.location = Vector((0,0,.63))+direction*4
camera.rotation_euler = (-direction).to_track_quat('-Z','Y').to_euler()
samples = dict(Idle=22, Run=6, AttackA=4, AttackB=4, AttackC=6,
               Power=6, Dash=3, Hurt=1, Cast=4, Ultimate=8, Blink=62)
for name, frame in samples.items():
    clip = 'Idle' if name == 'Blink' else name
    for obj in scene.objects:
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:
                track.mute = track.name != clip
    scene.frame_set(frame)
    scene.render.filepath = str(OUT/f'{name}.png')
    bpy.ops.render.render(write_still=True)
print('Rendered animation poses:', ', '.join(samples))
