"""Measured red shell, bone jaws and four pointed legs for static review."""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'production-tools'))
from geometry import Model

m=Model(HERE)
body=m.loft('RedShell','body','shell',9,12)
crest=m.loft('BackSpike','spike','bone',4,5,align=True)
m.seat_on_shell(crest,body)
spike=m.loft('ShellSpike.L','side_spike','bone',4,5,align=True)
m.seat_on_shell(spike,body)
m.mirror(spike,'ShellSpike.R')
cx,y,cz,rx,rz,jaw=m.mouth(body,'bone','#352A2B',12)
# The sheet's large teeth define the bite; minor tooth chips are omitted.
upper=m.front_prism('UpperFang.L',[(115,352),(132,349),(128,370),(123,380)],y-.006,.04,'bone')
m.mirror(upper,'UpperFang.R')
outer=m.front_prism('SideFang.L',[(101,366),(113,366),(116,390),(110,415),(105,400)],y-.006,.05,'bone')
m.mirror(outer,'SideFang.R')
lower=m.front_prism('LowerTooth.L',[(114,417),(127,422),(128,431),(118,429)],y-.005,.025,'bone')
m.mirror(lower,'LowerTooth.R')
for part,name in (('frontleg','FrontLeg'),('backleg','BackLeg')):
    leg=m.loft(name+'.L',part,'joint',5,6,align=True)
    m.mirror(leg,name+'.R')
    joint=m.leg_joint(leg,body,'joint')
    m.mirror(joint,name.replace('Leg','Joint')+'.R')
# The dark under-shell stays behind the jaw and visible between the legs.
belly=m.rows('belly','right');front=m.rows('belly','front')
m.ellipsoid('UnderShell',(0,(belly[:,1].min()+belly[:,2].max())/2,.10),
    ((front[:,2].max()-front[:,1].min())/2,(belly[:,2].max()-belly[:,1].min())/2,.065),'dark',8,4)
m.finish(body)
