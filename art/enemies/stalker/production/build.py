"""Build Stalker's static crouched model from the measured sheet parts."""
import sys
from pathlib import Path
import numpy as np
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'model-tools'))
from geometry import Model, linear

m=Model(HERE)
pixel=m.sheet['meters_per_pixel']
body=m.loft('Thorax','thorax','dark',6,10)
hood,face=m.hood('Pointed head','head','shell',.032)
m.angry_eyes(face,core='#F2A1FF',background='dark')
waist=m.loft('Waist armor','hip','dark',4,8)
rear=m.rows('rearfoot','right');front=m.rows('foot','right')
stagger=float((rear[:,1].min()+rear[:,2].max()-front[:,1].min()-front[:,2].max())/2)
for part,label,color,rings,segments in (
    ('shoulder','Shoulder','shell',5,8),
    ('upperarm','Upper arm','shell',4,8),
    ('blade','Arm blade','shell',8,6),
    ('thigh','Thigh','shell',5,8),
    ('shin','Shin','shell',4,6),
    ('foot','Foot','shell',4,8),
):
    obj=m.loft(label+'.L',part,color,rings,segments,align=True)
    if part=='blade':
        # Pale cutting facets keep the long blades readable against the dark
        # crouched body. The silhouette still comes from both sheet views.
        attr=obj.data.color_attributes['Color']
        for poly in obj.data.polygons:
            if poly.normal.y<-.3:
                for i in poly.loop_indices:attr.data[i].color=(*linear(m.color('edge')),1)
    if part=='foot':
        m.loft(label+'.R','rearfoot',color,rings,segments,align=True)
    else:
        other=m.mirror(obj,label+'.R')
        if part in ('shin','thigh'):
            low=min(v.co.z for v in other.data.vertices);high=max(v.co.z for v in other.data.vertices)
            for v in other.data.vertices:
                t=(high-v.co.z)/(high-low)
                v.co.y+=stagger*(t*.35 if part=='thigh' else .35+t*.65)

dorsal=m.loft('Dorsal armor','spine','shell',8,6,align=True)
for v in dorsal.data.vertices:v.co.z-=7*pixel

# Small triangular shoulder tips and toes are modeled, while tiny surface
# plates remain facet colors. Their endpoints are labeled sheet pixels.
for sign,side in ((-1,'L'),(1,'R')):
    rows=m.rows('shoulder','front')
    z=rows[:,0].max()-3*pixel
    cx,cy,rx,ry=m.section('shoulder',z,True)
    start=(sign*abs(cx),cy,z-8*pixel)
    end=(sign*(abs(cx)+5*pixel),cy+3*pixel,z+4*pixel)
    m.tube('Shoulder tip.'+side,[start,end],[5*pixel,.3*pixel],'edge',4)
    z=(446-347)*pixel
    cx,cy,rx,ry=m.section('shoulder',z,True)
    m.ellipsoid('Shoulder joint.'+side,(sign*(abs(cx)-9*pixel),cy,z-3*pixel),
        (7*pixel,8*pixel,8*pixel),'dark',8,4)

# Armor keeps its measured outline; dark joints bridge the actual surfaces,
# including the staggered rear knee and ankle instead of floating segments.
m.bridge('Waist connection',body,waist,6*pixel)
for side in ('L','R'):
    pairs=[(body,bpy.data.objects['Shoulder.'+side],6),
        (bpy.data.objects['Shoulder.'+side],bpy.data.objects['Upper arm.'+side],5),
        (bpy.data.objects['Upper arm.'+side],bpy.data.objects['Arm blade.'+side],4),
        (waist,bpy.data.objects['Thigh.'+side],6),
        (bpy.data.objects['Thigh.'+side],bpy.data.objects['Shin.'+side],4),
        (bpy.data.objects['Shin.'+side],bpy.data.objects['Foot.'+side],4)]
    for i,(a,b,radius) in enumerate(pairs):m.bridge(f'Limb connection.{side}.{i}',a,b,radius*pixel)
m.finish(body)
