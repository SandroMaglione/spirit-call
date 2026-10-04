"""Build the measured Shooter, stopping at the static model review stage."""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'production-tools'))
from geometry import Model

m=Model(HERE)
body=m.loft('ShooterBody','body','body',11,16)
m.loft('DorsalSpike','crest','spike',5,6)
fin=m.loft('SideFin.L','fin','fin',6,8)
m.mirror(fin,'SideFin.R')
foot=m.loft('Foot.L','foot','spike',4,8)
m.mirror(foot,'Foot.R')
tail=m.loft('TailFin','tail','spike',5,6,align=True)
# The back view places this small tail lower than either side view. Its side
# height defines the projecting silhouette; the back defines its width.
back=m.rows('tail','back');side=m.rows('tail','right')
dz=(side[:,0].min()+side[:,0].max()-back[:,0].min()-back[:,0].max())/2
for v in tail.data.vertices:v.co.z+=dz
m.mouth(body,'coral','#44363E')
m.eyes(body)
m.finish(body)
