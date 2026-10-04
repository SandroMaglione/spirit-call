"""Build Warden's static sheet model. No rig, clips or runtime registration."""
import math
import sys
from pathlib import Path
import numpy as np
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'model-tools'))
from geometry import Model, linear

m=Model(HERE)
pixel=m.sheet['meters_per_pixel']
body=m.loft('Robe','robe','robe',9,12)
torso=m.loft('Torso','torso','robe',5,10)
bpy.ops.object.select_all(action='DESELECT')
for obj in (body,torso):obj.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
hood,face=m.hood('Hood','hood','hood',.022)
m.angry_eyes(face,core='#74F9FF',background='void')
collar=m.loft('Collar','collar','hood',3,8)
# Preserve the V-shaped cowl front and its narrow cream rim. The shoulder
# mantle overlaps the torso; it is not a separate floating necklace.
for v in collar.data.vertices:
    v.co.z-=4*pixel
    if v.co.y<0:v.co.z-=max(0,1-abs(v.co.x)/(.15))*7*pixel
for side in ('L','R'):
    sleeve=m.loft('Sleeve.'+side,'sleeve.'+side,'robe',5,8,align=True)
    hand=m.loft('Hand.'+side,'hand.'+side,'gold',4,6,align=True)
    rows=m.rows('hand.'+side,'front')
    z=float((rows[:,0].min()+rows[:,0].max())/2)
    ax,ay,arx,ary=m.section('sleeve.'+side,z,True)
    hx,hy,hrx,hry=m.section('hand.'+side,z,True)
    m.tube('Cuff.'+side,[(ax,ay,z+2*pixel),(hx,hy,z)],
        [max(arx,3*pixel),max(hrx,3*pixel)],'gold',6)
foot=m.loft('Foot.L','foot','shadow',4,6)
m.mirror(foot,'Foot.R')

# Gold is geometry and facet color, not a texture that smears across a fold.
attr=body.data.color_attributes['Color']
for p in body.data.polygons:
    if sum(body.data.vertices[i].co.z for i in p.vertices)/len(p.vertices)<25*pixel:
        for i in p.loop_indices:attr.data[i].color=(*linear(m.color('gold')),1)

def patch(name,points,color):
    tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
    center=(sum(p[0] for p in points)/len(points),sum(p[1] for p in points)/len(points))
    verts=[]
    for x,y in [center]+points:
        hit,normal,_,_=tree.ray_cast(Vector(((x-m.config['center']['front'])*pixel,-3,(463-y)*pixel)),Vector((0,1,0)))
        if hit is None:raise ValueError(f'{name}: {x,y}')
        verts.append(hit+normal*.002)
    obj=m.mesh(name,verts,[(0,k+1,(k+1)%len(points)+1) for k in range(len(points))],color,0)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True)
    for v in bm.verts:
        hit,normal,_,_=tree.ray_cast(Vector((v.co.x,-3,v.co.z)),Vector((0,1,0)))
        if hit is not None:v.co=hit+Vector((0,-.013,0))
    bm.to_mesh(obj.data);bm.free()
    return obj

patch('Open robe inner cloth',[(143,383),(151,383),(163,442),(147,449),(128,441)],'shadow')
m.surface_path('Robe trim.L',body,[(139,388),(133,410),(121,443)],'gold',2.0)
m.surface_path('Robe trim.R',body,[(155,388),(164,411),(175,441)],'gold',2.0)
m.surface_path('Chest trim.L',body,[(135,350),(146,363)],'gold',1.7)
m.surface_path('Chest trim.R',body,[(162,350),(151,363)],'gold',1.7)

def jewel(name,x,y,width,height):
    tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
    hit,normal,_,_=tree.ray_cast(Vector(((x-m.config['center']['front'])*pixel,-3,(463-y)*pixel)),Vector((0,1,0)))
    if hit is None:raise ValueError(name)
    cx,cy,cz=hit;cy-=.028
    outline=[(0,height),(-width,0),(0,-height),(width,0)]
    verts=[(cx+dx*pixel,cy,cz+dz*pixel) for dx,dz in outline]
    verts += [(cx+dx*.52*pixel,cy-.001,cz+dz*.62*pixel) for dx,dz in outline]
    m.mesh(name+' gold rim',verts,[(k,(k+1)%4,(k+1)%4+4,k+4) for k in range(4)],'gold',0)
    m.mesh(name+' cyan',verts[4:]+[(cx,cy-.006,cz)],[(4,k,(k+1)%4) for k in range(4)],'cyan',0)

jewel('Chest emblem',148,368,7,11)
m.surface_path('Belt',body,[(137,382),(143,385),(154,384),(157,381)],'gold',1.8)
jewel('Belt clasp',148,389,3.5,5)

for part,label in (('ribbon.upper','Upper'),('ribbon.lower','Lower')):
    cloth=m.ribbon('Ribbon.'+label+'.R',part,'#83CDB3')
    m.mirror(cloth,'Ribbon.'+label+'.L')

# The staff's endpoints, lean and gem dimensions come from its two views.
shaft=m.rows('staff','front');zs=np.linspace(shaft[:,0].min(),shaft[:,0].max(),4)
points=[m.section('staff',z)[:2]+(z,) for z in zs]
radius=float(np.median((shaft[:,2]-shaft[:,1])/2))
m.tube('Staff shaft',points,min(radius,1.6*pixel),'shadow',6)
head=m.rows('staff_head','front')
z=(463-298)*pixel
cx,cy,_,_=m.section('staff_head',z)
ring=[]
for k in range(9):
    a=2*math.pi*k/8
    ring.append((cx+13*pixel*math.sin(a),cy,z+18*pixel*math.cos(a)))
m.tube('Staff ring',ring,3.0*pixel,'void',4)
m.ellipsoid('Staff cyan crystal',(cx,cy-.7*pixel,z),(9*pixel,5*pixel,13*pixel),'cyan',8,5)
for dx,dz in ((0,27),(-19,0),(19,0),(0,-22)):
    start=(cx+dx*.58*pixel,cy,z+dz*.58*pixel)
    end=(cx+dx*pixel,cy,z+dz*pixel)
    m.tube('Staff crown point', [start,end],[4*pixel,.25*pixel],'void',4)
m.tube('Staff gold ferrule',[(cx,cy,z-24*pixel),(cx,cy,z-34*pixel)],3.2*pixel,'gold',6)
m.finish(body)
