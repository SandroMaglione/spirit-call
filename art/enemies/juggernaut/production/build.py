"""Static Juggernaut: measured stone shells, heavy fists and gold armor rims."""
import math
import sys
from pathlib import Path
import numpy as np
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'review-tools'))
from geometry import Model, linear

m=Model(HERE)
body=m.loft('StoneTorso','torso','dark',5,8)
back=m.loft('HunchedBack','hunch','dark',5,8)
head=m.loft('Helmet','head','stone',5,8)
m.surface_patch('FaceRecess',head,[(131,339),(139,342),(149,350),(160,340),(167,336),(165,356),(158,372),(143,372),(132,359)],'#292B30')
for side in (-1,1):
    points=[(137,330),(134,340),(136,356),(145,367),(144,373),(131,363),(127,342),(130,333)]
    if side==1:points=[(296-x,y) for x,y in points]
    m.surface_patch('HelmetBinding.'+('L' if side<0 else 'R'),head,points,'gold')
for obj in bpy.data.objects:
    if obj.name.startswith('HelmetBinding'):
        for v in obj.data.vertices:v.co.y-=.003
# The sheet's eye blobs are angular, unlike a spirit's round eyes. Preserve
# their measured outline and mirror their shape around the helmet center.
eyes=m.sheet['eyes'];eye=min(eyes,key=lambda e:e['x'])
eye_x=float(np.mean([abs(e['x']) for e in eyes]));eye_z=float(np.mean([e['z'] for e in eyes]))
tree=BVHTree.FromPolygons([v.co for v in head.data.vertices],[p.vertices for p in head.data.polygons])
pixel=m.sheet['meters_per_pixel']
for sign,side in ((-1,'L'),(1,'R')):
    points=[(sign*eye_x,eye_z)]
    for x,y in eye['outline_pixels']:
        local_x=(x-148)*pixel-eye['x'];local_z=(455-y)*pixel-eye['z']
        points.append((sign*(eye_x-local_x),eye_z+local_z))
    vertices=[]
    for x,z in points:
        hit,normal,_,_=tree.ray_cast(Vector((x,-3,z)),Vector((0,1,0)))
        if hit is None:raise ValueError('Measured eye missed helmet')
        vertices.append(hit+normal*.009)
    m.mesh('Eye.'+side,vertices,[(0,i,1 if i==len(points)-1 else i+1) for i in range(1,len(points))],'#FFE65B',0)
z=eye_z
hx,hy,hrx,hry=m.section('head',z)
_,by,_,bry=m.section('torso',z)
front=by-bry;rear=hy+hry
m.ellipsoid('NeckBridge',(hx,(front+rear)/2,z),(hrx*.8,abs(front-rear)/2+.04,.12),'dark',8,3)
m.surface_patch('ChestChevron',body,[(107,368),(117,367),(145,380),(151,381),(180,366),(188,369),(174,382),(149,392),(126,382)],'gold')
m.surface_patch('WaistChevron',body,[(106,392),(125,404),(150,415),(175,402),(188,391),(177,412),(151,424),(125,419)],'gold')
m.surface_patch('ChestInset',body,[(141,378),(150,381),(159,377),(156,387),(150,393),(144,387)],'warm')

def armor_band(obj,part,fraction):
    rows=m.rows(part,'front')
    z=rows[:,0].min()+np.ptp(rows[:,0])*fraction
    # Wide facet bands replace tiny raised edge meshes at enemy scale.
    # They retain one material and leave triangles for the body silhouette.
    thickness=np.ptp(rows[:,0])*.17
    for target in (obj,bpy.data.objects[obj.name.replace('.L','.R')]):
        attr=target.data.color_attributes['Color']
        for p in target.data.polygons:
            if abs(p.center.z-z)<thickness:
                for i in p.loop_indices:attr.data[i].color=(*linear(m.color('gold')),1)

for part,name,color,rings in [('shoulder','Pauldron','stone',4),('upperarm','UpperArm','dark',3),
                              ('forearm','Gauntlet','stone',4),('fist','Fist','dark',5),
                              ('thigh','Thigh','stone',4),('shin','Ankle','dark',3),('foot','Foot','dark',4)]:
    obj=m.loft(name+'.L',part,color,rings,8,align=True)
    m.mirror(obj,name+'.R')
    if part=='shoulder':
        rim=m.surface_patch('PauldronRim.L',obj,[(49,326),(55,327),(59,348),(76,361),(92,357),(104,339),(109,340),(106,362),(93,373),(64,375),(48,357)],'gold')
        m.mirror(rim,'PauldronRim.R')
        stud=m.ellipsoid('PauldronStud.L',(-.56,-.14,.83),(.038,.033,.043),'gold',6,3)
        # Snap the stud's center onto the measured shoulder shell.
        tree=BVHTree.FromPolygons([v.co for v in obj.data.vertices],[p.vertices for p in obj.data.polygons])
        center=Vector(((82-148)*pixel,-3,(455-342)*pixel))
        hit,normal,_,_=tree.ray_cast(center,Vector((0,1,0)))
        if hit is not None:
            offset=hit+normal*.017-Vector((-.56,-.14,.83))
            for v in stud.data.vertices:v.co+=offset
        m.mirror(stud,'PauldronStud.R')
    if part in ('forearm','thigh'):
        armor_band(obj,part,.78 if part=='forearm' else .25)
    if part=='forearm':
        armor_band(obj,part,.18)

# The orthographic views hide the hip joints inside the torso. Connect the
# measured thigh positions to it so the side view has a continuous body.
rows=m.rows('thigh','front');z=float(rows[:,0].max())-.035
cx,cy,rx,ry=m.section('thigh',z,True)
_,body_y,_,_=m.section('torso',z)
hip=m.ellipsoid('HipJoint.L',(cx,(cy+body_y)/2,z),(rx*.8,abs(body_y-cy)/2+ry*.6,.10),'dark',6,3)
m.mirror(hip,'HipJoint.R')

# Segmented knuckles sit on the measured fist surface. They are broad
# enough to read at phone scale, without individually modeling fingers.
rows=m.rows('fist','front');z=float(rows[:,0].mean())
cx,cy,rx,ry=m.section('fist',z,True)
for i,u in enumerate((-.55,0,.55)):
    x=cx+rx*u
    obj=m.ellipsoid('Knuckle.L.'+str(i),(x,cy-ry*.85,z+.018),(rx*.29,.032,.051),'stone',6,3)
    m.mirror(obj,'Knuckle.R.'+str(i))

# Gold ridges frame the central hunch. They sit behind the helmet and
# reinforce the tank's top-down silhouette.
for sign in (-1,1):
    pts=[]
    for z in np.linspace(.80,1.30,5):
        cx,cy,rx,ry=m.section('hunch',z)
        pts.append((cx+sign*rx*.86,cy-ry*.35,z))
    m.tube('BackRidge.'+('L' if sign<0 else 'R'),pts,.016,'gold',4)
# Projecting narrow armor decorations subdivides the underlying facets.
# Merge coplanar subdivisions without changing their silhouette or color.
for obj in list(bpy.data.objects):
    if obj.type!='MESH' or not obj.name.startswith(('FaceRecess','HelmetBinding','ChestChevron','WaistChevron','ChestInset','PauldronRim')):
        continue
    color=tuple(obj.data.color_attributes['Color'].data[0].color)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    bmesh.ops.dissolve_limit(bm,angle_limit=.0001,verts=list(bm.verts),edges=list(bm.edges))
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    for value in obj.data.color_attributes['Color'].data:value.color=color
m.finish(body)
