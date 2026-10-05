"""Static, editable Crusher Behemoth. Shape follows measured sheet contours."""
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / 'review-tools'))
from geometry import Model, linear

m = Model(HERE)
m.mat.name = 'Stone and gold facet palette'
bsdf = m.mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = .7
bsdf.inputs['Metallic'].default_value = .15
bsdf.inputs['Specular IOR Level'].default_value = .3
glow = bpy.data.materials.new('Amber luminous insets')
glow.use_nodes = True
g = glow.node_tree.nodes['Principled BSDF']
g.inputs['Base Color'].default_value = (*linear('#FFB52E'),1)
g.inputs['Emission Color'].default_value = (*linear('#FFB52E'),1)
g.inputs['Emission Strength'].default_value = 2.5
g.inputs['Roughness'].default_value = .45

body = m.loft('StoneTorso', 'torso', 'stone', 7, 12, symmetric=True)
head = m.loft('Helmet', 'helmet', 'stone', 5, 8, align=True, symmetric=True)
keystone = m.loft('LowerKeystone', 'keystone', 'dark', 4, 8, align=True, symmetric=True)


def paint(obj, predicate, color):
    attr = obj.data.color_attributes['Color']
    for p in obj.data.polygons:
        if predicate(p.center):
            for i in p.loop_indices:
                attr.data[i].color = (*linear(m.color(color)),1)


def luminous(obj):
    obj.data.materials.clear()
    obj.data.materials.append(glow)
    # Vertex colors multiply glTF base color. White preserves the flat amber emission.
    for c in obj.data.color_attributes['Color'].data:
        c.color = (1,1,1,1)


# A pointed helmet surrounds a black visor. Eye polygons snap onto its facets.
m.surface_patch('VisorRecess', head, [(516,175),(524,177),(533,180),(542,177),(550,175),(549,184),(541,189),(525,188),(517,183)], 'recess')
eye = m.surface_patch('Eye.L', head, [(520,176),(528,179),(529,182),(522,181)], 'eye')
luminous(eye)
for v in eye.data.vertices: v.co.y-=.025
m.mirror(eye, 'Eye.R')
m.surface_patch('NoseGuard', head, [(531,174),(535,174),(536,187),(533,190),(530,187)], 'dark')
m.surface_patch('ForeheadRidge', head, [(532,155),(534,155),(536,174),(533,177),(530,174)], 'gold')

# Diamond bezel is actual geometry, with a recessed luminous jewel and broad chamfers.
cz = (282-218)*m.sheet['meters_per_pixel']
_, cy, _, ry = m.section('torso', cz)
front = cy-ry-.13


def diamond(name, profiles, color):
    verts=[]
    for rx,rz,y in profiles:
        verts.extend([(0,y,cz+rz),(rx,y,cz),(0,y,cz-rz),(-rx,y,cz)])
    faces=[]
    for j in range(len(profiles)-1):
        for k in range(4):
            a=j*4+k; b=j*4+(k+1)%4
            faces.append((a,b,b+4,a+4))
    return m.mesh(name,verts,faces,color)

diamond('ChestBezel', [(1.65,1.8,front+.08),(1.49,1.64,front-.22),(.91,1.03,front-.22),(.78,.90,front+.03)], 'gold')
diamond('CoreRecess', [(.78,.9,front+.03),(.68,.79,front+.08)], 'recess')
core=diamond('ChestCore', [(.64,.75,front+.075),(.42,.5,front-.06),(0,0,front-.16)], 'core')
luminous(core)
m.surface_patch('ChestStem', body, [(530,191),(537,191),(537,201),(548,210),(540,214),(533,205),(525,213),(519,210),(530,200)], 'gold')
paint(keystone, lambda p: p.z > 1.55 and p.z < 1.95, 'gold')


def beveled_block(name, center, radii, color, banded=False):
    # Broad flat ends preserve a clenched fist instead of pointed fingertips.
    outline=[(-.7,-1),(.7,-1),(1,-.7),(1,.7),(.7,1),(-.7,1),(-1,.7),(-1,-.7)]
    verts=[];faces=[]
    profile=[(-1,.72),(-.72,1),(.72,1),(1,.72)]
    if banded:profile=[(-1,.72),(-.72,1),(-.15,1),(.32,1),(.72,1),(1,.72)]
    for height,width in profile:
        for x,y in outline:verts.append((center[0]+x*radii[0]*width,center[1]+y*radii[1]*width,center[2]+height*radii[2]))
    for j in range(len(profile)-1):
        for k in range(8):
            a=j*8+k;b=j*8+(k+1)%8
            faces.append((a,b,b+8,a+8))
    end=(len(profile)-1)*8
    faces.extend([tuple(reversed(range(8))),tuple(range(end,end+8))])
    return m.mesh(name,verts,faces,color)

for part, name, color, rings in [('shoulder','Pauldron','dark',6)]:
    obj=m.loft(name+'.L',part,color,rings,12,align=True)
    rows=m.rows(part,'front')
    lo,hi=rows[:,0].min(),rows[:,0].max()
    if part=='shoulder':
        # A wide inward gold strap wraps from the front across the top to the back.
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=(-2.65,0,0),plane_no=(1,0,0),dist=.000001)
        bm.to_mesh(obj.data);bm.free();obj.data.update()
        paint(obj, lambda p: p.x > -2.65, 'gold')
    m.mirror(obj,name+'.R')

def curled_finger(name, center, half_width):
    # Closed fingers bend forward at the knuckle and return into the palm.
    # This side profile reads as a grip from the side as well as four knuckles in front.
    profile=[(.18,1.0),(-.60,1.0),(-1.0,.70),(-1.08,-.34),(-.80,-.70),
             (-.23,-.87),(.12,-.63),(.36,.22)]
    verts=[];faces=[]
    for x,scale in [(-half_width,.76),(-half_width+.10,1),(half_width-.10,1),(half_width,.76)]:
        for y,z in profile:verts.append((center[0]+x,center[1]+y*scale,center[2]+z*scale))
    for j in range(3):
        for k in range(8):
            a=j*8+k;b=j*8+(k+1)%8
            faces.append((a,b,b+8,a+8))
    faces.extend([tuple(reversed(range(8))),tuple(range(24,32))])
    return m.mesh(name,verts,faces,'stone',.035)


# A compact palm, four curled fingers, and a thumb crossing the grip replace
# the hanging armor bars. The wrist has one plain band and no pointed caps.
cx,cy,rx,ry=m.section('fist',2.8,True)
hand=[]
hand.append(beveled_block('FistShell.L',(cx,cy+.15,2.78),(rx*.96,1.20,1.30),'dark'))
for i,u in enumerate((-.72,-.24,.24,.72)):
    finger=curled_finger(f'Finger.L.{i}',(cx+rx*u,cy-.70,2.99),rx*.215)
    hand.append(finger)
hand.append(beveled_block('ThumbBase.L',(cx+rx*.89,cy-.84,2.76),(.42,.65,.63),'stone'))
thumb=beveled_block('Thumb.L',(cx+rx*.57,cy-1.68,2.56),(.67,.40,.37),'stone')
hand.append(thumb)
for obj in hand:
    pivot=Vector((cx,cy,2.8))
    rotation=Matrix.Rotation(-math.radians(12),3,'Y')
    for v in obj.data.vertices:v.co=pivot+rotation@(v.co-pivot)
    m.mirror(obj,obj.name.replace('.L','.R'))

wrist=beveled_block('WristArmor.L',(cx+.16,cy+.24,4.48),(.90,.90,.51),'dark',banded=True)
paint(wrist,lambda p: 4.35<p.z<4.66,'gold')
m.mirror(wrist,'WristArmor.R')
link=beveled_block('WristLink.L',(cx+.14,cy+.24,4.04),(.62,.67,.39),'recess')
m.mirror(link,'WristLink.R')
joint=m.ellipsoid('ShoulderJoint.L',(-2.55,.15,5.42),(.75,.95,.84),'recess',8,4)
m.mirror(joint,'ShoulderJoint.R')
arm=beveled_block('Forearm.L',(cx+.20,cy+.24,5.13),(.65,.75,.60),'dark')
m.mirror(arm,'Forearm.R')

# Raised rear plates create facing cues without copying the front's luminous core.
m.surface_patch('CollarBinding', body, [(513,177),(521,184),(533,190),(546,184),(553,177),(550,184),(534,196),(516,188)], 'dark')

objects=[o for o in bpy.data.objects if o.type=='MESH']
# Preserve the previous torso's world bounds when revising the hands.
# These values come from its measured raw contour and the pass-01 GLB.
scale=.9484295753787207
offset=.6272933914000729
for obj in objects:
    for v in obj.data.vertices:
        v.co.x*=scale; v.co.y*=scale; v.co.z=offset+v.co.z*scale

# Short legs fill the space under the torso, with flat soles at the origin's floor.
# Wide feet and slightly separated knees give the heavy body a stable stance.
beveled_block('Pelvis',(0,.38,2.0),(1.38,.78,.56),'dark')
for name,center,radii,color in [
        ('Thigh.L',(-1.04,.37,1.78),(.57,.61,.64),'dark'),
        ('Shin.L',(-1.15,.24,1.07),(.57,.65,.61),'stone'),
        ('Foot.L',(-1.25,-.35,.39),(.81,1.10,.39),'dark')]:
    obj=beveled_block(name,center,radii,color)
    m.mirror(obj,name.replace('.L','.R'))
objects=[o for o in bpy.data.objects if o.type=='MESH']
for obj in objects:
    if obj!=body:
        origin=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
        for v in obj.data.vertices: v.co-=origin
        obj.location=origin
bpy.context.view_layer.update()
points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
triangles=sum(len(p.vertices)-2 for o in objects for p in o.data.polygons)
assert triangles < 3500, triangles
assert not bpy.data.actions
bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
audit={'kind':'crusher-behemoth','status':'static review; no animation or game registration',
       'triangles':triangles,'materials':2,'mesh_parts':[o.name for o in objects],
       'animations':0,'armatures':0,'bounds_blender_m':bounds,'height_m':8.5,
       'ground_clearance_m':0,'height_basis':'ground between flat soles to helmet apex',
       'revision':'four curled fingers, crossing thumbs, plain wrists, short grounded legs',
       'axes_glb':'meters, +Y up, +Z forward','reference':'reference/sheet.png',
       'dimension_conflict':m.sheet['dimension_conflict']}
bpy.context.scene.unit_settings.system='METRIC'
bpy.ops.object.select_all(action='DESELECT')
for obj in objects: obj.select_set(True)
bpy.context.view_layer.objects.active=body
# A neutral material viewport opens with the entire model in view.
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.shading.type='MATERIAL'
        area.spaces.active.region_3d.view_distance=23
        area.spaces.active.region_3d.view_location=(0,0,4.2)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/m.config['blend']))
bpy.ops.export_scene.gltf(filepath=str(HERE/'crusher-behemoth-model.glb'),export_format='GLB',
    use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
(HERE/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps(audit))
