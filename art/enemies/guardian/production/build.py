"""Measured Guardian static model, with separate shield and mace parts."""
import sys
import math
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'sheet-tools'))
from geometry import Model
from mathutils import Vector

m=Model(HERE)
body=m.loft('Breastplate','body','steel',7,10,symmetric=True)
helmet=m.loft('Helmet','helmet','steel',8,12,symmetric=True)
crest=m.loft('GoldenCrest','crest','gold',6,6,symmetric=True)
# Center the crest's contour and mirror its facet colors as well as its
# vertices. The turned sheet should not tilt the element to one side.
colors=crest.data.color_attributes['Color']
left=[p for p in crest.data.polygons if p.center.x<-.000001]
for p in crest.data.polygons:
 if p.center.x<=.000001:continue
 target=Vector((-p.center.x,p.center.y,p.center.z))
 source=min(left,key=lambda q:(q.center-target).length)
 for loop in p.loop_indices:colors.data[loop].color=colors.data[source.loop_start].color
shoulder=m.loft('Pauldron.L','shoulder','steel',5,8);m.mirror(shoulder,'Pauldron.R')
arm=m.loft('Forearm.L','arm','steel',4,8);m.mirror(arm,'Forearm.R')
hand=m.loft('Gauntlet.L','hand','dark',4,8);m.mirror(hand,'Gauntlet.R')
thigh=m.loft('LegArmor.L','thigh','dark',5,8);m.mirror(thigh,'LegArmor.R')
foot=m.loft('Boot.L','foot','dark',4,8);m.mirror(foot,'Boot.R')
# The dark visor is projected onto the faceted helmet, not placed in front
# of it. Each glowing eye uses the same surface-snapping rule as the spirits.
outline=[[130,318],[118,315],[114,334],[125,348],[130,351]]
points=[(x,0,z) for x,z in (m.pixel('front',p) for p in outline)]
visor=m.patch('Visor.L',helmet,points,'#24242B',offset=.002)
m.mirror(visor,'Visor.R')
m.eyes(helmet,background='#24242B',core='#FFC16A',socket_scale=1.2)
# Broad hanging armor plates and a belt distinguish the body from a solid
# capsule without adding details that disappear at phone size.
tab=m.prism('Tabard.L',[[119,394],[128,399],[119,430],[101,422]],-.19,-.13,'steel');m.mirror(tab,'Tabard.R')
m.cylinder('Belt',(0,0,.405),(0,0,.445),.195,'dark',10)
m.prism('BeltClasp',[[130,383],[140,392],[130,401],[120,392]],-.208,-.19,'gold')
m.prism('ChestClasp',[[130,351],[137,359],[130,367],[123,359]],-.19,-.16,'gold')
# Broad gold caps follow the measured shoulder sections. Build the entire
# left cap once, so the right blade has identical shape and facet colors.
rows=m.rows('shoulder','front');low,high=rows[:,0].min(),rows[:,0].max()
verts=[]
for z in (high-(high-low)*.20,high):
 cx,cy,rx,ry=m.section('shoulder',z)
 for k in range(8):
  angle=k*math.tau/8
  verts.append((cx+(rx+.008)*math.sin(angle),cy-(ry+.008)*math.cos(angle),z+.006))
faces=[tuple(range(7,-1,-1)),tuple(range(8,16))]
faces += [(k,(k+1)%8,(k+1)%8+8,k+8) for k in range(8)]
trim=m.mesh('GoldShoulderTrim.L',verts,faces,'gold');m.mirror(trim,'GoldShoulderTrim.R')
band=m.cylinder('ElbowBand.L',(-.24,-.12,.465),(-.285,-.10,.44),.074,'gold',8)
m.mirror(band,'ElbowBand.R')
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
# The measured front diameter defines a round ball. Twelve identical cones
# use the vertices of a regular icosahedron, rather than extra spikes on
# one side. Rotate the pattern so its gaps leave room for the handle.
front=m.rows('mace','front');side=m.rows('mace','right')
cx=(front[:,1].min()+front[:,2].max())/2
cy=(side[:,1].min()+side[:,2].max())/2
cz=(front[:,0].min()+front[:,0].max())/2
radius=((front[:,2].max()-front[:,1].min())+(front[:,0].max()-front[:,0].min()))/4
center=Vector((cx,cy,cz))
mace=m.ellipsoid('MaceHead',center,(radius,radius,radius),'steel',16,8)
a=m.point(land['handle_start'],[349,397]);b=m.point(land['handle_end'],[326,365])
m.cylinder('MaceHandle',a,b,.028,'wood',8)
rotation=Vector((1,1,1)).normalized().rotation_difference((center-a).normalized())
phi=(1+math.sqrt(5))/2
directions=[]
for sign1 in (-1,1):
 for sign2 in (-1,1):
  directions.extend(((0,sign1,sign2*phi),(sign1,sign2*phi,0),(sign1*phi,0,sign2)))
for i,d in enumerate(directions):
 axis=rotation@Vector(d).normalized()
 u=axis.cross(Vector((0,0,1)))
 if u.length<.01:u=axis.cross(Vector((0,1,0)))
 u.normalize();v=axis.cross(u)
 base=center+axis*(radius-.012)
 verts=[base+.032*(math.cos(k*math.tau/6)*u+math.sin(k*math.tau/6)*v) for k in range(6)]
 verts.append(center+axis*(radius+.055))
 m.mesh(f'MaceSpike.{i+1:02}',verts,[tuple(range(5,-1,-1))]+[(k,(k+1)%6,6) for k in range(6)],'steel',0)
m.finish(body)
