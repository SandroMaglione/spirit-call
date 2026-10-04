"""Measure-first static Brute: a hunched stone body with separated heavy fists."""
import sys
from pathlib import Path
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'production-tools'))
from geometry import Model

m=Model(HERE)
body=m.loft('StoneTorso','torso','warm',7,12)
m.loft('HunchedBack','back','dark',5,8,align=True)
head=m.loft('BrowStone','head','light',6,10)
# Average the measured widths, then remove the sheet's lateral drift.
for vertex in head.data.vertices:
    vertex.co.x-=m.section('head',vertex.co.z)[0]
bm=bmesh.new();bm.from_mesh(head.data)
bmesh.ops.symmetrize(bm,input=list(bm.verts)+list(bm.edges)+list(bm.faces),direction='-X',dist=.00001)
bm.to_mesh(head.data);bm.free();head.data.update()
m.surface_patch('RecessedFace',head,[(126,350),(164,350),(165,362),(155,374),(145,376),(135,374),(125,362)],'#343132')
# A separate pale roof overhangs the dark face, as in the sheet's brow.
# The boundary and ridge are sampled in original front-view pixels.
tree=BVHTree.FromPolygons([v.co for v in head.data.vertices],[p.vertices for p in head.data.polygons])
pixel=m.sheet['meters_per_pixel']
def brow_point(x,z):
    point=Vector(((x-145)*pixel,-3,(466-z)*pixel))
    hit,_,_,_=tree.ray_cast(point,Vector((0,1,0)))
    if hit is None:raise ValueError('Brow cap missed head')
    return (point.x,hit.y-.022,point.z)
outline=[(120,336),(132,326),(145,324),(158,326),(170,336),(165,347),(145,355),(125,347)]
front=[brow_point(x,z) for x,z in outline]
back=[(x,y+.065,z) for x,y,z in front]
ridge=brow_point(145,337);ridge=(ridge[0],ridge[1]-.020,ridge[2])
n=len(front)
faces=[(2*n,k,(k+1)%n) for k in range(n)]+[tuple(range(n,2*n))]
faces += [(k,k+n,(k+1)%n+n,(k+1)%n) for k in range(n)]
state=m.rng.getstate()
cap=m.mesh('PaleBrowCap',front+back+[ridge],faces,'#D8CCBE',.035)
m.rng.setstate(state)
m.surface_patch('BreastPlate',body,[(112,368),(122,376),(147,387),(172,375),(180,368),(172,390),(147,405),(124,394),(111,382)],'light')
m.eyes(head,background='#343132',core=m.color('eye'),socket_scale=1.08,center=0)
for name in ('Eye','EyeSocket'):
    bpy.data.objects.remove(bpy.data.objects[name+'.R'],do_unlink=True)
    left=bpy.data.objects[name+'.L']
    # The visor is a second surface above the stone. Give the eyes clearance
    # over that surface even where its facets turn sharply away from -Y.
    for vertex in left.data.vertices:vertex.co.y-=.004
    # Game-size refinement: larger eyes, slanted down toward the nose, so the
    # scowl of the sheet survives at 60 px (round cores read as two dots).
    middle=sum((v.co for v in left.data.vertices),Vector())/len(left.data.vertices)
    for vertex in left.data.vertices:
        offset=vertex.co-middle
        vertex.co.x=middle.x+offset.x*1.35
        outward=offset.x*1.35*(1 if middle.x>0 else -1)
        vertex.co.z=middle.z+offset.z*1.2+.5*outward
        vertex.co.y-=.003
    right=m.mirror(left,name+'.R')
    assert all((Vector((-a.co.x,a.co.y,a.co.z))-b.co).length<.000001
               for a,b in zip(left.data.vertices,right.data.vertices))
GROW={'shoulder':(1.16,1.2,1.12),'upperarm':(1.25,1.25,1),'forearm':(1.28,1.28,1.05),
      'fist':(1.3,1.3,1.22),'thigh':(1.3,1.3,1),'foot':(1.25,1.2,1.1)}
ROUGH={'shoulder':.09,'upperarm':.05,'forearm':.07,'fist':.1,'thigh':.05,'foot':.07}
for part,name,color,rings in (
    ('shoulder','Shoulder','light',5),('upperarm','UpperArm','dark',4),
    ('forearm','Forearm','warm',5),('fist','Fist','dark',5),
    ('thigh','Thigh','warm',4),('foot','Foot','dark',5)):
    obj=m.loft(name+'.L',part,color,rings,8,align=True)
    # Game-size refinement: at 60 px the measured limbs read as thin lumps
    # beside the torso. Each grows about its own center (fists and shoulders
    # most, as the sheet's hero view weights them), and its rings are pushed
    # in and out so the stone breaks into planes instead of a smooth egg.
    grow=GROW[part]
    center=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
    for vertex in obj.data.vertices:
        offset=vertex.co-center
        chip=1+m.rng.uniform(-ROUGH[part],ROUGH[part])
        vertex.co=center+Vector((offset.x*grow[0]*chip,offset.y*grow[1]*chip,offset.z*grow[2]))
    m.mirror(obj,name+'.R')
m.finish(body)
