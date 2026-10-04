"""Build Volatile's static lava-rock shell and measured asymmetric flame."""
import math
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'model-tools'))
from geometry import Model, linear

m=Model(HERE)
pixel=m.sheet['meters_per_pixel']
body=m.loft('Lava core','body','orange',9,12)
rows=m.rows('body','front');low,high=rows[:,0].min(),rows[:,0].max()

# Broad crust plates follow the measured body surface. The simplified seam
# layout uses a staggered stone pattern; it does not copy every painted crack.
# Insets expose an orange core as real gaps instead of drawing lines over rock.
def surface(z,a):
    cx,cy,rx,ry=m.section('body',z)
    return Vector((math.sin(a)*rx,cy-math.cos(a)*ry,z))

levels=np.linspace(low+1.5*pixel,high-1.5*pixel,6)
sectors=10
phases=[0,.19,-.11,.15,-.13,0]
jitter=[[0 if j in (0,5) else m.rng.uniform(-4,4)*pixel for k in range(sectors)] for j in range(6)]
plates=[]
for band in range(len(levels)-1):
    for k in range(sectors//2):
        a=2*math.pi*k/sectors;b=2*math.pi*(k+1)/sectors
        z0,z1=levels[band],levels[band+1]
        # Keep front/back boundary angles on the symmetry plane. Mirroring
        # the right stones gives the eyes identical rock lips on both sides.
        pa=0 if k==0 else phases[band];pb=0 if k+1==sectors//2 else phases[band]
        qa=0 if k==0 else phases[band+1];qb=0 if k+1==sectors//2 else phases[band+1]
        corners=[(z0+jitter[band][k],a+pa),(z0+jitter[band][k+1],b+pb),
                 (z1+jitter[band+1][k+1],b+qb),(z1+jitter[band+1][k],a+qa)]
        zz=(z0+z1)/2;aa=(a+b)/2+(phases[band]+phases[band+1])/2
        # Stone boundaries vary a little, while the overall envelope remains
        # the measured loft. Border widths are roughly one sheet pixel.
        inset=.12+m.rng.uniform(-.02,.02)
        outer=[surface(zz+(z-zz)*(1-inset),aa+(angle-aa)*(1-inset)) for z,angle in corners]
        center=sum(outer,Vector())/4
        cx,cy,rx,ry=m.section('body',center.z)
        direction=Vector((center.x,center.y-cy,0)).normalized()
        peak=surface(zz,aa)+direction*.3*pixel
        inner=[p-direction*3.8*pixel for p in outer]
        verts=outer+inner+[peak]
        faces=[(8,k,(k+1)%4) for k in range(4)]
        faces += [(k,k+4,(k+1)%4+4,(k+1)%4) for k in range(4)]
        faces.append((7,6,5,4))
        obj=m.mesh(f'Crust stone {band:02d}.{k:02d}',verts,faces,'warm',.18)
        plates.extend([obj,m.mirror(obj,f'Crust stone mirrored {band:02d}.{k:02d}')])

# Solid caps hide the core at the poles but leave its seams exposed along the
# upper neck. They are separate from the small rock on top of the head.
for z,label in ((low+1.5*pixel,'Belly'),(high-1.5*pixel,'Crown')):
    cx,cy,rx,ry=m.section('body',z)
    cap=m.ellipsoid(label+' crust',(0,cy,z),(rx*.93,ry*.93,3*pixel),'warm',10,4)
    plates.append(cap)

# Reduce the core under the stones, keeping the outer dimensions in the sheet.
for v in body.data.vertices:
    cx,cy,rx,ry=m.section('body',v.co.z)
    v.co.x=(v.co.x-cx)*.94;v.co.y=cy+(v.co.y-cy)*.94
m.angry_eyes(body,core='#FFD15B',background='#241C19',depth=8*pixel,parts=[body]+plates)
bpy.ops.object.select_all(action='DESELECT')
for obj in [body]+plates:obj.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
body.name='Cracked rock body'
m.surface_path('Mouth fissure',body,[(109,417),(124,422),(137,423),(150,420),(164,414)],'orange',1.0)
def pebble(name,part,center_depth=False):
    front=m.rows(part,'front');side=m.rows(part,'right')
    xmin,xmax=front[:,1].min(),front[:,2].max()
    zmin,zmax=front[:,0].min(),front[:,0].max()
    ymin,ymax=side[:,1].min(),side[:,2].max()
    z=(zmin+zmax)/2
    y=m.section('body',z)[1] if center_depth else (ymin+ymax)/2
    return m.ellipsoid(name,((xmin+xmax)/2,y,z),((xmax-xmin)/2,(ymax-ymin)/2,(zmax-zmin)/2),
        'warm',8,4)

# Minor rocks use faceted ellipsoids with measured bounds. This deliberately
# simplifies the small chipped shapes without turning feet into sharp cones.
pebble('Top rock','cap')
foot=pebble('Foot.L','foot',True)
side=pebble('Side rock.L','side_rock',True)
# Mirror after moving the left rocks inward, so placement and geometry agree.
# Their inner halves overlap the body rather than hovering beside it.
for obj,factor in ((foot,.76),(side,.84)):
    for v in obj.data.vertices:v.co.x*=factor
m.mirror(foot,'Foot.R');m.mirror(side,'Side rock.R')
root=m.bridge('Foot root.L',body,foot,4*pixel,'warm')
m.mirror(root,'Foot root.R')
flame=m.loft('Flame','flame','orange',9,6,align=True)
base=min(v.co.z for v in flame.data.vertices)+2*pixel
cx,cy,rx,ry=m.section('flame',base,True)
top=m.rows('cap','front')[:,0].max()-2*pixel
tx,ty,_,_=m.section('cap',top)
m.tube('Flame root',[(tx,ty+3*pixel,top),(cx,cy,base)],[7*pixel,6*pixel],'yellow',6)
attr=flame.data.color_attributes['Color']
vertices=flame.data.vertices
for poly in flame.data.polygons:
    z=sum(vertices[i].co.z for i in poly.vertices)/len(poly.vertices)
    fraction=(z-min(v.co.z for v in vertices))/(max(v.co.z for v in vertices)-min(v.co.z for v in vertices))
    color='yellow' if fraction<.30 else 'orange'
    for i in poly.loop_indices:attr.data[i].color=(*linear(m.color(color)),1)

# A small inner flame stays inside the measured outer silhouette. The source
# keeps it as an editable mesh for later sway rather than a baked glow halo.
core=flame.copy();core.data=flame.data.copy();core.name='Flame inner light'
bpy.context.scene.collection.objects.link(core)
for v in core.data.vertices:
    cx,cy,rx,ry=m.section('flame',v.co.z,True)
    v.co.x=cx+(v.co.x-cx)*.46
    v.co.y=cy+(v.co.y-cy)*.96-1.3*pixel
for datum in core.data.color_attributes['Color'].data:datum.color=(*linear(m.color('yellow')),1)
m.finish(body)
