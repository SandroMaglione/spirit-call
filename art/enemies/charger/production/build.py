"""Firebomber static model. Sources and sizes come from its measured sheet."""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'sheet-tools'))
from geometry import Model

m=Model(HERE)
body=m.loft('ClothBody','body','#BCAF9F',7,12)
pack=m.loft('BombBackpack','pack','charcoal',7,12)
for z in (.33,.65):
 cx,cy,rx,ry=m.section('pack',z)
 # The two broad bands follow the pack rather than intersecting its shell.
 import math
 verts=[]
 for h in (z-.032,z+.032):
  for k in range(12):
   a=k*math.tau/12;verts.append((cx+(rx+.012)*math.sin(a),cy-(ry+.012)*math.cos(a),h))
 m.mesh('BackpackBand',verts,[(k,(k+1)%12,(k+1)%12+12,k+12) for k in range(12)],'brown')
cx,cy,rx,ry=m.section('collar',.80)
m.cylinder('FuseCollar',(cx,cy,.75),(cx,cy,.865),max(rx,ry),'brown',10)
flame=m.loft('BackpackFlame','flame','fire',6,6)
# A nested pale core preserves the flame's offset and asymmetric tip.
core=flame.copy();core.data=flame.data.copy();core.name='FlameCore';import bpy
bpy.context.scene.collection.objects.link(core)
for v in core.data.vertices:v.co.x*=.58;v.co.y-=.018
from geometry import linear
for c in core.data.color_attributes['Color'].data:c.color=(*linear('#FFE898'),1)
arm=m.loft('UpperArm.L','arm','#C69B7D',4,8);m.mirror(arm,'UpperArm.R')
cuff=m.loft('Cuff.L','cuff','hood',3,8);m.mirror(cuff,'Cuff.R')
hand=m.loft('Hand.L','hand','#363239',4,8);m.mirror(hand,'Hand.R')
foot=m.loft('Foot.L','foot','#363239',3,8);m.mirror(foot,'Foot.R')
for sign in (-1,1):
 m.cylinder('Ankle',(sign*.235,-.10,.07),(sign*.205,-.02,.20),.047,'#363239',6)
 for dx in (-.045,0,.045):
  m.ellipsoid('Toe',(sign*.235+dx,-.155,.035),(.028,.055,.035),'#363239',6,3)
# The side drawing hides half the held bomb behind the hand. Its front
# diameter defines a sphere instead of an occlusion-flattened loft.
rows=m.rows('bomb','front')
bx=(rows[:,1].min()+rows[:,2].max())/2
bz=(rows[:,0].min()+rows[:,0].max())/2
radius=(rows[:,2].max()-rows[:,1].min())/2
_,by,_,_=m.section('bomb',bz)
bomb=m.ellipsoid('HandBomb',(bx,by,bz),(radius,radius,radius),'charcoal',16,8)
m.loft('BombFlame','bombflame','fire',5,6)
x,z=m.pixel('front',m.config['landmarks']['front']['bomb_neck'])
_,y,_,_=m.section('bomb',.55)
m.cylinder('BombFuseCollar',(x,y,z-.014),(x,y,z+.025),.047,'brown',10)
m.cylinder('BombFuseLip',(x,y,z+.019),(x,y,z+.033),.054,'charcoal',10)
m.cylinder('BombFuse',(x,y,z+.030),(x-.004,y,z+.053),.017,'#FFE898',6)
# A real open hood: outside shell, rim, and inner wall surround a recessed face.
land=m.config['landmarks']['front'];outer=[m.pixel('front',p) for p in land['hood_outer']]
inner=[m.pixel('front',p) for p in land['hood_inner']]
verts=[]
for points,depth in ((outer,0),(inner,1),(inner,2),(outer,3)):
 for x,z in points:
  # The hood wraps a rounded head; its crown and cheeks turn back.
  front,rear=m.edge('hood','right',z)
  y=front+.07*(abs(x)/.23)**2 if depth==0 else -.45 if depth==1 else -.33 if depth==2 else rear
  verts.append((x,y,z))
faces=[]
for a,b in ((0,8),(8,16),(0,24)):
 for k in range(8):faces.append((a+k,a+(k+1)%8,b+(k+1)%8,b+k))
hood=m.mesh('OpenHood',verts,faces,'hood')
face=m.ellipsoid('RecessedFace',(0,-.344,.403),(.159,.075,.16),'#302E34',12,5)
m.eyes(face,background='#302E34',core='#FFE695')
for name,view,points in (('BackpackCrack','back',[[611,334],[607,348],[614,365],[611,382]]),):
 m.stripe(name,pack,view,points,'fire',.012)
# Ember facets on the held bomb are projected onto its actual surface.
for i,points in enumerate(([[51,386],[55,389],[58,398],[54,399],[50,393]],
                          [[62,395],[66,390],[71,394],[74,402],[70,405],[64,403]],
                          [[81,395],[85,391],[90,389],[89,398],[84,402]])):
 m.patch(f'BombEmber.{i+1}',bomb,[(px,0,pz) for px,pz in (m.pixel('front',p) for p in points)],'fire')
m.patch('BombEmberCore',bomb,[(px,0,pz) for px,pz in (m.pixel('front',p) for p in [[65,397],[68,395],[71,400],[67,403]])],'#FFD26E',offset=.006)
m.stripe('PackFrontCrack',pack,'front',[[113,330],[108,341],[114,352],[110,362]],'#FFD26E',.013)
m.finish(body)
