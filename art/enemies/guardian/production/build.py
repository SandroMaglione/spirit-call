"""Measured Guardian static model, with separate shield and mace parts."""
import sys
import math
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'sheet-tools'))
from geometry import Model
from mathutils import Vector
from mathutils.bvhtree import BVHTree

m=Model(HERE)
body=m.loft('Breastplate','body','steel',7,10)
helmet=m.loft('Helmet','helmet','steel',8,12)
m.loft('GoldenCrest','crest','gold',6,6)
shoulder=m.loft('Pauldron.L','shoulder','steel',5,8);m.mirror(shoulder,'Pauldron.R')
arm=m.loft('Forearm.L','arm','steel',4,8);m.mirror(arm,'Forearm.R')
hand=m.loft('Gauntlet.L','hand','dark',4,8);m.mirror(hand,'Gauntlet.R')
thigh=m.loft('LegArmor.L','thigh','dark',5,8);m.mirror(thigh,'LegArmor.R')
foot=m.loft('Boot.L','foot','dark',4,8);m.mirror(foot,'Boot.R')
# The dark visor is projected onto the faceted helmet, not placed in front
# of it. Each glowing eye uses the same surface-snapping rule as the spirits.
tree=BVHTree.FromPolygons([v.co for v in helmet.data.vertices],[p.vertices for p in helmet.data.polygons])
verts=[];outline=[[118,318],[146,315],[142,335],[130,349],[119,335]];center=[130,331]
for factor in (0,.5,1):
 for p in ([center] if factor==0 else outline):
  point=[center[i]+factor*(p[i]-center[i]) for i in (0,1)]
  x,z=m.pixel('front',point)
  hit,normal,_,_=tree.ray_cast(Vector((x,-3,z)),Vector((0,1,0)))
  if hit is None:raise ValueError(f'Visor missed helmet at {point}')
  verts.append(hit+normal*.002)
faces=[(0,1+k,1+(k+1)%5) for k in range(5)]
faces += [(1+k,1+(k+1)%5,6+(k+1)%5,6+k) for k in range(5)]
m.mesh('Visor',verts,faces,'#24242B',0)
m.eyes(helmet,background='#24242B',core='#FFC16A',socket_scale=1.2,
       center_x=sum(e['x'] for e in m.sheet['eyes'])/2)
# Broad hanging armor plates and a belt distinguish the body from a solid
# capsule without adding details that disappear at phone size.
tab=m.prism('Tabard.L',[[119,394],[128,399],[119,430],[101,422]],-.19,-.13,'steel');m.mirror(tab,'Tabard.R')
m.cylinder('Belt',(0,0,.405),(0,0,.445),.195,'dark',10)
m.prism('BeltClasp',[[130,383],[140,392],[130,401],[120,392]],-.208,-.19,'gold')
m.prism('ChestClasp',[[130,351],[137,359],[130,367],[123,359]],-.19,-.16,'gold')
for sign in (-1,1):
 m.cylinder('GoldShoulderTrim',(sign*.155,-.10,.805),(sign*.245,-.03,.74),.031,'gold',6)
 m.cylinder('ElbowBand',(sign*.24,-.12,.465),(sign*.285,-.10,.44),.074,'gold',8)
# The shield is a thick frame around separate planks. Its diamond boss has
# raised triangular facets; the back carries a grip for the later rig.
land=m.config['landmarks']['front'];outer=land['shield'];inner=land['shield_inner']
front_y=-.36;back_y=-.29
verts=[]
for points,y in ((outer,front_y),(inner,front_y),(outer,back_y),(inner,back_y)):
 for p in points:
  x,z=m.pixel('front',p);verts.append((x,y,z))
faces=[]
for a,b in ((0,4),(0,8),(4,12),(8,12)):
 for k in range(4):faces.append((a+k,a+(k+1)%4,b+(k+1)%4,b+k))
m.mesh('ShieldFrame',verts,faces,'trim')
for i in range(4):
 # Interpolate in pixel space, preserving the sheet's tilted outline.
 t0=i/4+.008;t1=(i+1)/4-.008
 def between(a,b,t):return [a[j]+(b[j]-a[j])*t for j in (0,1)]
 points=[between(inner[0],inner[1],t0),between(inner[0],inner[1],t1),between(inner[3],inner[2],t1),between(inner[3],inner[2],t0)]
 m.prism(f'ShieldPlank.{i+1}',points,front_y+.012,back_y-.007,'wood')
points=[m.pixel('front',p) for p in land['shield_diamond']]
verts=[(x,front_y-.009,z) for x,z in points]
verts.append((sum(x for x,z in points)/4,front_y-.055,sum(z for x,z in points)/4))
m.mesh('ShieldBoss',verts,[(i,(i+1)%4,4) for i in range(4)],'light')
m.cylinder('ShieldGrip',(.32,back_y+.06,.43),(.34,back_y+.06,.60),.035,'dark',8)
# The mace's core is measured from both views. Short radial spikes replace
# the sheet's many tiny bevels and keep the weapon readable in a crowd.
mace=m.loft('MaceHead','mace','steel',6,10)
a=m.point(land['handle_start'],[349,397]);b=m.point(land['handle_end'],[326,365])
m.cylinder('MaceHandle',a,b,.028,'wood',8)
center=sum((v.co for v in mace.data.vertices),Vector())/len(mace.data.vertices)
for d in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1),(.7,-.7,.5),(-.7,-.7,.5)]:
 axis=Vector(d).normalized()
 m.cylinder('MaceSpike',center+axis*.135,center+axis*.205,.035,'steel',6,end_radius=.001)
m.finish(body)
