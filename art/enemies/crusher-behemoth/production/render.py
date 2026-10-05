"""Render the saved source without changing it. Optionally sweep hero cameras."""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
OUT=HERE/'renders'
config=json.loads((HERE/'spirit.json').read_text())
sheet=json.loads((HERE/'sheet.json').read_text())
audit=json.loads((HERE/'audit.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(HERE/config['blend']))
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_x=640
scene.render.resolution_y=640
scene.render.resolution_percentage=100
scene.eevee.taa_render_samples=32
scene.view_settings.view_transform='Standard'
world=bpy.data.worlds.new('Review ambient');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.72,.76,.83,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
scene.world=world
for name,rot in [('sun',(35,0,-35)),('fill',(65,0,155)),('rim',(-90,0,20))]:
    energy,color=config['lights'][name]
    light=bpy.data.objects.new(name,bpy.data.lights.new(name,'SUN'))
    light.data.energy=energy;light.data.color=color
    light.rotation_euler=tuple(math.radians(a) for a in rot)
    scene.collection.objects.link(light)
camera=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'))
camera.data.type='ORTHO';camera.data.ortho_scale=config['ortho']
scene.collection.objects.link(camera);scene.camera=camera
target=Vector((0,0,4.25))


def render(name,turn,elevation,size=640,ortho=None):
    t,e=math.radians(turn),math.radians(elevation)
    direction=Vector((math.sin(t)*math.cos(e),-math.cos(t)*math.cos(e),math.sin(e)))
    camera.location=target+direction*30
    camera.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler()
    if name=='top':camera.rotation_euler=(0,0,0)
    if name=='bottom':camera.rotation_euler=(math.pi,0,0)
    camera.data.ortho_scale=ortho or config['ortho']
    scene.render.resolution_x=size;scene.render.resolution_y=size
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)


if 'sweep' in sys.argv:
    for t in range(-15,31,15):
        for e in (10,20,30):render(f'sweep{t}_{e}',t,e,400)
else:
    for name,t,e in [('front',0,0),('back',180,0),('left',-90,0),('right',90,0),('top',0,90),('bottom',0,-90),
                     ('hero',sheet['hero']['turn'],sheet['hero']['elevation']),('game',45,30),('game-back',225,30)]:
        render(name,t,e)
    render('game-size',45,30,128)
    render('game-size-64',45,30,64)
    target=Vector((0,-.2,7.5))
    render('face-front',0,0,640,3.5)
    render('face-three-quarter',30,12,640,3.5)
    target=Vector((0,.25,2.35))
    render('rear-waist',225,15,640,5.4)
    parts=[o for o in bpy.data.objects if o.type=='MESH' and
           o.name in ('FistShell.L','WristArmor.L','WristLink.L')]
    for obj in bpy.data.objects:
        if obj.type=='MESH':obj.hide_render=obj not in parts
    pts=[obj.matrix_world@v.co for obj in parts for v in obj.data.vertices]
    target=Vector(tuple((min(p[i] for p in pts)+max(p[i] for p in pts))/2 for i in range(3)))
    render('hand-front',0,0,640,6.3)
    render('hand-three-quarter',35,15,640,6.3)
    for obj in bpy.data.objects:
        if obj.type=='MESH':obj.hide_render=not obj.name.startswith(('Thigh.','Shin.','Foot.','Knee.','ShinGuard.','KneeBinding.'))
    target=Vector((0,0,1.2))
    render('legs-front',0,0,640,6.0)
    render('legs-three-quarter',30,15,640,6.0)
