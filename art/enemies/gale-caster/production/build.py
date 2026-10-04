"""Static Gale Caster, measured from the preserved orthographic sheet."""
import math
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'review-tools'))
from geometry import Model
from faces import gale_face

m=Model(HERE)
body=m.loft('SplitRobe','robe','hood',7,12)
# Leave the center of the lower front open. It exposes the floating dark
# legs and gives the two robe panels actual edges for their gold binding.
remove=[]
for p in body.data.polygons:
    c=p.center
    if c.y<0 and c.z<.56 and abs(c.x)<.074:
        remove.append(p.index)
import bmesh
bm=bmesh.new();bm.from_mesh(body.data)
bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.faces[i] for i in remove],context='FACES')
bm.to_mesh(body.data);bm.free();body.data.update()
m.loft('ShadowLegs','leg','void',5,8)
m.loft('PointedFoot','foot','void',4,8)
hood=m.loft('PointedHood','hood','hood',7,12,symmetric=True)
gale_face(m,hood)
collar=m.loft('Mantle','collar','mint',4,8)
m.surface_patch('MantleBinding',collar,[(119,325),(134,334),(150,343),(168,326),(180,328),(170,333),(152,349),(133,340)],'gold')
for part,name,color in [('sleeve.L','Sleeve.L','hood'),('sleeve.R','Sleeve.R','hood'),
                         ('hand.L','StaffGrip','void'),('hand.R','Hand.R','mint')]:
    m.loft(name,part,color,4,8,align=True)

m.surface_patch('Belt',body,[(128,360),(146,365),(167,359),(167,369),(145,376),(127,370)],'teal')
m.surface_patch('ChestStraps',body,[(126,341),(131,339),(149,350),(167,339),(171,343),(151,356),(166,383),(163,388),(148,361),(129,387),(125,385),(144,354)],'gold')
gem=m.surface_patch('ChestDiamond',body,[(149,343),(158,354),(148,365),(140,354)],'gold')
inset=m.surface_patch('DiamondInset',body,[(149,347),(153,354),(148,360),(144,354)],'ivory')
# The gem hangs in front of the overlapping mantle, rather than disappearing
# behind it. Its pixel placement stays fixed while the attachment adds depth.
for obj in (gem,inset):
    for v in obj.data.vertices:v.co.y-=.075
for side in (-1,1):
    pts=[]
    for z in np.linspace(.12,.57,7):
        cx,cy,rx,ry=m.section('robe',z)
        angle=side*math.pi/6
        pts.append((cx+math.sin(angle)*rx,cy-math.cos(angle)*ry-.003,z))
    m.tube('FrontBinding.'+('L' if side<0 else 'R'),pts,.009,'gold',4)
hem=[]
z=m.rows('robe','front')[:,0].min()+.012
cx,cy,rx,ry=m.section('robe',z)
for k in range(11):
    a=math.pi/6+k*math.pi*5/3/10
    hem.append((cx+math.sin(a)*rx,cy-math.cos(a)*ry,z))
m.tube('HemBinding',hem,.009,'gold',4)
for part,name in [('ribbon.upper','ScarfUpper'),('ribbon.lower','ScarfLower')]:
    tail=m.ribbon(name+'.R',part,'mint',6)
    m.mirror(tail,name+'.L')

# The shaft uses the measured top and bottom center, preserving its tilt.
rows=m.rows('staff','front');lo,hi=rows[:,0].min(),rows[:,0].max()
points=[]
for z in (lo,hi):
    x0,x1=m.edge('staff','front',z);y0,y1=m.edge('staff','right',z,True)
    points.append(((x0+x1)/2,(y0+y1)/2,z))
head=m.rows('staff_head','front')
cx=float((head[:,1].min()+head[:,2].max())/2)
cz=float((head[:,0].min()+head[:,0].max())/2)
side=m.rows('staff_head','right');cy=float((side[:,1].min()+side[:,2].max())/2)
rx=float((head[:,2].max()-head[:,1].min())/2)*.73
rz=float((head[:,0].max()-head[:,0].min())/2)*.68
m.tube('StaffShaft',[points[0],(cx,cy,cz-rz)],.012,'teal',6)
grip=m.rows('hand.L','front')
gz=float((grip[:,0].min()+grip[:,0].max())/2)
gx=float((grip[:,1].min()+grip[:,2].max())/2)
grip_side=m.rows('hand.L','right')
gy=float((grip_side[:,1].min()+grip_side[:,2].max())/2)
arm=m.section('sleeve.L',gz+.02,True)
m.tube('Forearm.L',[(arm[0],arm[1],gz+.02),(gx,gy,gz)],.036,'hood',8)
m.tube('Cuff.L',[(gx,gy+.025,gz),(gx,gy+.045,gz)],.040,'gold',8)
verts=[];faces=[];segments=12
for y,scale in ((cy-.014,1),(cy+.014,1),(cy+.014,.72),(cy-.014,.72)):
    for k in range(segments):
        a=k*2*math.pi/segments
        verts.append((cx+rx*scale*math.cos(a),y,cz+rz*scale*math.sin(a)))
for j in range(4):
    for k in range(segments):
        a=j*segments+k;b=j*segments+(k+1)%segments
        faces.append((a,b,((j+1)%4)*segments+(k+1)%segments,((j+1)%4)*segments+k))
m.mesh('StaffRing',verts,faces,'gold')
m.ellipsoid('StaffCore',(cx,cy,cz),(rx*.65,.027,rz*.63),'#50F0ED',10,4)
for k in range(4):
    a=k*math.pi/2
    center=Vector((cx+rx*math.cos(a),cy,cz+rz*math.sin(a)))
    radial=Vector((math.cos(a),0,math.sin(a)))
    tangent=Vector((-math.sin(a),0,math.cos(a)))
    vs=[center+tangent*.025,center-tangent*.025,center+Vector((0,-.021,0)),center+Vector((0,.021,0)),center+radial*.042]
    m.mesh('StaffPoint.'+str(k),vs,[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(0,3,1,2)],'gold')
m.finish(body)
