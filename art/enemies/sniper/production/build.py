"""Measured static robotic Sniper, before rigging or animation."""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'sheet-tools'))
from geometry import Model, linear
from mathutils import Vector

m=Model(HERE)
body=m.loft('Torso','body','charcoal',8,10)
import numpy as np
# The side view defines the full connected head and needle. Its tip height
# disagrees with the front illustration, so the side view wins. Front widths
# determine the thickness of each corresponding side landmark.
profile=m.config['parts']['head']['views']['right']
front=m.rows('head','front');side=m.rows('head','right')
verts=[]
for sign in (-1,1):
 for p in profile:
  y,z=m.pixel('right',p)
  t=(z-side[:,0].min())/np.ptp(side[:,0])
  fz=front[:,0].min()+t*np.ptp(front[:,0])
  lo,hi=m.edge('head','front',fz)
  verts.append((sign*max(.007,float((hi-lo)/2)),y,z))
n=len(profile)
faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
head=m.mesh('HeadAndPrecisionBarrel',verts,faces,'purple')
for face in head.data.polygons:
 if 2 <= face.index <= 5:
  for loop in face.loop_indices:head.data.color_attributes['Color'].data[loop].color=(*linear('#9D8AAF'),1)
crest=m.loft('Crest.L','crest','violet',5,6);m.mirror(crest,'Crest.R')
m.loft('CentralCrest','centercrest','purple',5,6)
thigh=m.loft('LegArmor.L','thigh','purple',6,8,align=True);m.mirror(thigh,'LegArmor.R')
f=m.config['landmarks']['front'];s=m.config['landmarks']['right']
for side in ('L','R'):
 hip=m.point(f['hip'+side],s['hip']);knee=m.point(f['knee'+side],s['knee']);hock=m.point(f['hock'+side],s['hock']);ankle=m.point(f['ankle'+side],s['ankle'])
 m.cylinder('ThighJoint.'+side,hip,knee,.036,'charcoal',6)
 m.cylinder('Hock.'+side,knee,hock,.025,'charcoal',6,end_radius=.021)
 m.cylinder('Shin.'+side,hock,ankle,.023,'charcoal',6,end_radius=.015)
 m.ellipsoid('Knee.'+side,knee,(.038,.04,.047),'violet',6,4)
 m.ellipsoid('Ankle.'+side,ankle,(.032,.04,.042),'purple',6,4)
for sign,side in ((-1,'L'),(1,'R')):
 x=sign*.218
 m.ellipsoid('Foot.'+side,(x,-.155,.038),(.043,.073,.038),'violet',6,3)
 for dx in (-.025,.025):
  m.cylinder('Toe.'+side,(x+dx,-.175,.028),(x+dx,-.245,.014),.014,'metal',4,end_radius=.004)
# The long diamond-section barrel is the head's extension. The yellow
# conductor sits on its underside, separate from its pointed purple armor.
root=m.point([79,490],s['barrel_root']);tip=m.point([79,541],s['barrel_tip'])
m.cylinder('BarrelConductor',root+Vector((0,0,-.030)),tip+Vector((0,0,-.008)),.006,'eye',4)
m.cylinder('Muzzle',tip,tip+Vector((0,-.016,-.008)),.014,'#DB9BFF',8)
# Symmetrical side lenses use the measured side-view eye center.
ey,ez=m.pixel('right',s['eye'])
for sign,side in ((-1,'L'),(1,'R')):
 x=sign*.065
 m.cylinder('EyeRim.'+side,(x,ey,ez),(x+sign*.012,ey,ez),.035,'eye',10)
 m.cylinder('EyeSocket.'+side,(x+sign*.013,ey,ez),(x+sign*.017,ey,ez),.024,'charcoal',10)
 m.cylinder('Eye.'+side,(x+sign*.018,ey,ez),(x+sign*.021,ey,ez),.015,'#FFFFB0',10)
plate=m.loft('ShoulderPlate.L','shoulder','metal',5,6,align=True);m.mirror(plate,'ShoulderPlate.R')
spikeverts=[]
for x in (-.19,-.15):
 for p in [[230,486],[262,474],[236,504]]:
  y,z=m.pixel('right',p);spikeverts.append((x,y,z))
spike=m.mesh('ShoulderSpike.L',spikeverts,[(0,1,2),(5,4,3),(0,3,4,1),(1,4,5,2),(2,5,3,0)],'violet');m.mirror(spike,'ShoulderSpike.R')
# Folded support arms leave a clear gap under the barrel and avoid a
# humanoid gun grip. The weapon is part of the robot's head.
for sign,side in ((-1,'L'),(1,'R')):
 a=(sign*.15,.035,.79);b=(sign*.18,-.055,.64);c=(sign*.10,-.255,.74)
 m.cylinder('UpperArm.'+side,a,b,.033,'charcoal',6)
 m.cylinder('Forearm.'+side,b,c,.026,'purple',6)
 m.ellipsoid('Claw.'+side,c,(.038,.044,.026),'violet',6,3)
conductor=[]
for row in (542,554,566):
 z=(650-row)*m.config['meters_per_pixel']
 lo,hi=m.edge('thigh','front',z)
 conductor.append([79+(lo+hi)/2/m.config['meters_per_pixel'],row])
line=m.stripe('LegConductor.L',thigh,'front',conductor,'eye',.0035);m.mirror(line,'LegConductor.R')
m.finish(body)
