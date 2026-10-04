"""Measure-first static Brute: a hunched stone body with separated heavy fists."""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'production-tools'))
from geometry import Model

m=Model(HERE)
body=m.loft('StoneTorso','torso','warm',7,12)
m.loft('HunchedBack','back','dark',5,8)
head=m.loft('BrowStone','head','light',6,10)
m.surface_patch('RecessedFace',head,[(132,350),(163,350),(167,360),(155,371),(143,373),(131,361)],'#343132')
m.surface_patch('BreastPlate',body,[(112,368),(122,376),(147,387),(172,375),(180,368),(172,390),(147,405),(124,394),(111,382)],'light')
face_center=sum(e['x'] for e in m.sheet['eyes'])/2
m.eyes(head,background='#343132',core=m.color('eye'),socket_scale=1.08,center=face_center)
for part,name,color,rings in (
    ('shoulder','Shoulder','light',5),('upperarm','UpperArm','dark',4),
    ('forearm','Forearm','warm',5),('fist','Fist','dark',5),
    ('thigh','Thigh','warm',4),('foot','Foot','dark',5)):
    obj=m.loft(name+'.L',part,color,rings,8,align=True)
    m.mirror(obj,name+'.R')
m.finish(body)
