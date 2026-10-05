"""Static, editable Crusher Behemoth. Shape follows measured sheet contours."""
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
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


def beveled_block(name, center, radii, color):
    # Broad flat ends preserve a clenched fist instead of pointed fingertips.
    outline=[(-.7,-1),(.7,-1),(1,-.7),(1,.7),(.7,1),(-.7,1),(-1,.7),(-1,-.7)]
    verts=[];faces=[]
    for height,width in [(-1,.72),(-.72,1),(-.15,1),(.32,1),(.72,1),(1,.72)]:
        for x,y in outline:verts.append((center[0]+x*radii[0]*width,center[1]+y*radii[1]*width,center[2]+height*radii[2]))
    for j in range(5):
        for k in range(8):
            a=j*8+k;b=j*8+(k+1)%8
            faces.append((a,b,b+8,a+8))
    faces.extend([tuple(reversed(range(8))),tuple(range(40,48))])
    return m.mesh(name,verts,faces,color)

for part, name, color, rings in [('shoulder','Pauldron','dark',6),('wrist','WristArmor','stone',4),('fist','FistShell','dark',7)]:
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
    elif part=='wrist':
        paint(obj, lambda p: lo+(hi-lo)*.4 < p.z < lo+(hi-lo)*.8, 'gold')
    else:
        paint(obj, lambda p: lo+(hi-lo)*.3 < p.z < lo+(hi-lo)*.52, 'gold')
    m.mirror(obj,name+'.R')

# Three broad finger blocks give each fist visible seams and gold knuckle bands.
# Their root is behind the front shell; only the beveled ends protrude.
rows=m.rows('fist','front'); z=float(rows[:,0].mean())
cx,cy,rx,ry=m.section('fist',z,True)
for i,u in enumerate((-.52,0,.52)):
    x=cx+rx*u
    finger=beveled_block(f'Knuckle.L.{i}',(x,cy-ry*.82,z-.15),(rx*.28,.4,1.35),'dark')
    paint(finger,lambda p: z-.38 < p.z < z+.32,'gold')
    m.mirror(finger,f'Knuckle.R.{i}')
thumb=m.ellipsoid('Thumb.L',(cx+rx*.92,cy-ry*.47,z+.08),(.48,.63,.91),'stone',8,4)
paint(thumb,lambda p: z-.12 < p.z < z+.37,'gold')
m.mirror(thumb,'Thumb.R')

# The same outward cant applies to each fist's shell, fingers, and thumb.
# It keeps the gold bands and finger seams continuous across the silhouette.
for side,sign in [('L',-1),('R',1)]:
    pivot=Vector((sign*abs(cx),cy,z))
    rotation=Matrix.Rotation(sign*math.radians(16),3,'Y')
    for obj in bpy.data.objects:
        if obj.type=='MESH' and (obj.name.startswith('FistShell.'+side) or obj.name.startswith('Knuckle.'+side) or obj.name=='Thumb.'+side):
            for v in obj.data.vertices:v.co=pivot+rotation@(v.co-pivot)

# Dark articulated links are visible in the gaps between the armor masses.
for sign,side in [(-1,'L'),(1,'R')]:
    m.ellipsoid('ShoulderJoint.'+side,(sign*2.55,.15,5.42),(.75,.95,.84),'recess',8,4)
    m.ellipsoid('ElbowJoint.'+side,(sign*3.7,.08,4.42),(.68,.83,.7),'recess',8,4)

# Raised rear plates create facing cues without copying the front's luminous core.
m.surface_patch('CollarBinding', body, [(513,177),(521,184),(533,190),(546,184),(553,177),(550,184),(534,196),(516,188)], 'dark')

objects=[o for o in bpy.data.objects if o.type=='MESH']
raw=[v.co for o in objects for v in o.data.vertices]
low=min(v.z for v in raw); high=max(v.z for v in raw)
scale=(8.5-.8)/(high-low)
for obj in objects:
    for v in obj.data.vertices:
        v.co.x*=scale; v.co.y*=scale; v.co.z=.8+(v.co.z-low)*scale
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
       'ground_clearance_m':.8,'height_basis':'ground origin to helmet apex, including floating clearance',
       'axes_glb':'meters, +Y up, +Z forward','reference':'reference/sheet.png',
       'dimension_conflict':m.sheet['dimension_conflict']}
bpy.context.scene.unit_settings.system='METRIC'
bpy.ops.object.select_all(action='DESELECT')
for obj in objects: obj.select_set(True)
bpy.context.view_layer.objects.active=body
# A neutral material viewport opens with the entire model in view.
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.shading.color_type='MATERIAL'
        area.spaces.active.region_3d.view_distance=23
        area.spaces.active.region_3d.view_location=(0,0,4.2)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/m.config['blend']))
bpy.ops.export_scene.gltf(filepath=str(HERE/'crusher-behemoth-model.glb'),export_format='GLB',
    use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
(HERE/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps(audit))
