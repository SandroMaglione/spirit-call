"""Build the measured Thunder Spirit for model review only.

No clips, exports, or game registrations. Blender axes: Z up, -Y forward.
Body and crest loft the measured orthographic rows. Each yellow wing is
the intersection of its front and side outlines, so its bolt silhouette
holds from both cameras. Floating parts stay separate for later animation.
"""
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
SHEET=json.loads((HERE/"sheet.json").read_text())
UNIT=0.62
PIXEL=SHEET["meters_per_pixel"]
HOVER=0.045
RNG=random.Random(19)
COLORS=["#3B2EA6","#7A6BFF","#C9B8FF"]
# The halo's band: sections round the ring, half its width and height (m),
# and its tilt (rise per meter toward the back: the front view's 34 pixel
# opening over the side view's 139 pixel depth).
HALO_SECTIONS=32
HALO_WIDE=0.012
HALO_TALL=0.009
HALO_TILT=0.24

def linear(value):
    rgb=[int(value[i:i+2],16)/255 for i in (1,3,5)]
    return [c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4 for c in rgb]

def mix(a,b,t):return [x+(y-x)*t for x,y in zip(a,b)]

def material(name,color=None,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bsdf=m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value=0.65
    bsdf.inputs["Specular IOR Level"].default_value=0.08
    if color:
        bsdf.inputs["Base Color"].default_value=(*linear(color),1)
        bsdf.inputs["Emission Color"].default_value=(*linear(color),1)
    else:
        attr=m.node_tree.nodes.new("ShaderNodeVertexColor");attr.layer_name="Color"
        for slot in ("Base Color","Emission Color"):
            m.node_tree.links.new(attr.outputs["Color"],bsdf.inputs[slot])
    bsdf.inputs["Emission Strength"].default_value=emission
    return m

def object_mesh(name,verts,faces,mat,parent=None):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
    mesh.materials.append(mat)
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj)
    obj.parent=parent
    return obj

def shade(obj,crest=False):
    mesh=obj.data;attr=mesh.color_attributes.new("Color","FLOAT_COLOR","CORNER")
    for poly in mesh.polygons:
        height=(poly.center.z-HOVER)/UNIT
        # The sheet's body is its middle violet, lighter toward the top
        # and front, each facet a clearly different step.
        t=0.36+0.5*height+0.24*poly.normal.dot(Vector((0,-0.6,0.8)))+RNG.uniform(-0.14,0.14)
        if crest:t=0.25+0.72*height+RNG.uniform(-0.06,0.06)
        t=max(0,min(1,t))
        a,b=linear(COLORS[0]),linear(COLORS[1])
        color=mix(a,b,min(1,t/0.85)) if t<0.85 else mix(b,linear(COLORS[2]),(t-0.85)/0.15)
        for i in poly.loop_indices:attr.data[i].color=(*color,1)

def edge(view,z,part):
    rows=np.array(SHEET[view][part]);order=np.argsort(rows[:,0]);rows=rows[order]
    return np.interp(z,rows[:,0],rows[:,1]),np.interp(z,rows[:,0],rows[:,2])

def section(z,part):
    fl,fh=edge("front",z,part);bl,bh=edge("back",z,part)
    rl,rh=edge("right",z,part);ll,lh=edge("left",z,part)
    cx=((fl+fh)-(bl+bh))/4
    cy=((rl+rh)-(ll+lh))/4
    return cx,cy,max(0.002,(fh-fl+bh-bl)/4),max(0.002,(rh-rl+lh-ll)/4)

def loft(name,part,heights,segments,mat,parent=None):
    verts=[];faces=[]
    for i,z in enumerate(heights):
        cx,cy,rx,ry=section(z,part)
        turn=(i%2)*math.pi/segments
        for k in range(segments):
            a=2*math.pi*k/segments+turn
            verts.append(((cx+math.sin(a)*rx)*UNIT,(cy-math.cos(a)*ry)*UNIT,z*UNIT+HOVER))
    for i in range(len(heights)-1):
        for k in range(segments):
            a=i*segments+k;b=i*segments+(k+1)%segments;c=a+segments;d=b+segments
            faces.extend([(a,b,c),(b,d,c)] if i%2==0 else [(a,b,d),(a,d,c)])
    for ring,z in ((0,heights[0]-0.003),(len(heights)-1,heights[-1]+0.003)):
        cx,cy,_,_=section(z,part);tip=len(verts);verts.append((cx*UNIT,cy*UNIT,z*UNIT+HOVER))
        for k in range(segments):faces.append((ring*segments+k,ring*segments+(k+1)%segments,tip))
    obj=object_mesh(name,verts,faces,mat,parent);shade(obj,part=="crest")
    return obj

# Her eyes, from the sheet's ellipses: the Stormcaller is gentle (big and round, their outer ends a little lower).
EYE_SHAPE={"wide":1.1,"tall":1.0,"tilt":-0.12}

def eye_shape(u,v,left):
    u,v=u*EYE_SHAPE["wide"],v*EYE_SHAPE["tall"]
    tilt=EYE_SHAPE["tilt"]*(1 if left else -1)
    return u*math.cos(tilt)-v*math.sin(tilt),u*math.sin(tilt)+v*math.cos(tilt)

def eye(body,side,gold,white):
    eyes=SHEET["front"]["eyes"]
    offset=np.mean([abs(e["offset"]) for e in eyes])*side
    z=np.mean([e["height"] for e in eyes])*UNIT+HOVER
    width=np.mean([e["wide"] for e in eyes])*UNIT/2
    tall=np.mean([e["tall"] for e in eyes])*UNIT/2
    tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
    center=tree.ray_cast(Vector((offset*UNIT,-1,z)),Vector((0,1,0)))[0]
    for layer,scale,mat,lift in (("Rim",1.1,gold,0.0015),("Eye",1,white,0.002)):
        verts=[];faces=[];rings=4;segments=24
        def point(u,v):
            # Project every point to the actual faceted surface. This also
            # keeps the front view's measured eye size unchanged.
            hit,normal,_,_=tree.ray_cast(Vector((offset*UNIT+u,-1,z+v)),Vector((0,1,0)))
            if hit is None:raise ValueError("eye extends beyond body")
            return hit+normal*lift
        verts.append(point(0,0)-center)
        for r in range(1,rings+1):
            for k in range(segments):
                a=2*math.pi*k/segments
                verts.append(point(*eye_shape(math.cos(a)*width*scale*r/rings,math.sin(a)*tall*scale*r/rings,side>0))-center)
        for k in range(segments):faces.append((0,1+k,1+(k+1)%segments))
        for r in range(rings-1):
            for k in range(segments):
                a=1+r*segments+k;b=1+r*segments+(k+1)%segments
                faces.append((a,b,b+segments,a+segments))
        obj=object_mesh(f"{layer}.{'L' if side>0 else 'R'}",verts,faces,mat,body)
        obj.location=center

def extruded_polygon(name,points,axis,lo,hi,mat):
    # Polygon points are in the remaining two axes, in world meters.
    verts=[]
    for depth in (lo,hi):
        for a,b in points:
            verts.append((a,depth,b) if axis=="Y" else (depth,a,b))
    n=len(points);faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
    return object_mesh(name,verts,faces,mat)

def bolt(side,mat,parent):
    front_center=SHEET["front"]["center_pixel"]
    right_center=SHEET["right"]["center_pixel"]
    front=[(side*abs(x-front_center)*PIXEL,(519-y)*PIXEL+HOVER) for x,y in SHEET["bolt_front"]]
    profile=[((x-right_center)*PIXEL,(519-y)*PIXEL+HOVER) for x,y in SHEET["bolt_side"]]
    obj=extruded_polygon(f"LightningWing.{'L' if side>0 else 'R'}",front,"Y",-0.3,0.3,mat)
    cutter=extruded_polygon("Side silhouette",profile,"X",-0.5,0.5,mat)
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new("Intersect measured views","BOOLEAN");mod.operation="INTERSECT";mod.solver="EXACT";mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    obj.parent=parent
    # The object origin is at the fin root, ready to sway independently.
    center=Vector((side*0.19,0,0.17))
    for v in obj.data.vertices:v.co-=center
    obj.location=center

# A bolt down its back (not on the sheet: from behind, where its eyes do not
# show, it says which way it faces). Its outline across (meters) and up
# (of UNIT), laid on the back's surface like the eyes on the front.
BACK_BOLT=[(0.012,0.5),(-0.055,0.335),(0.004,0.335),(-0.022,0.17),(0.055,0.385),(-0.004,0.385),(0.048,0.5)]

def back_bolt(body,mat):
    tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
    bm=bmesh.new()
    face=bm.faces.new([bm.verts.new((x,0,z*UNIT+HOVER)) for x,z in BACK_BOLT])
    # Small pieces, so it follows the facets under it.
    bmesh.ops.triangulate(bm,faces=[face])
    bmesh.ops.subdivide_edges(bm,edges=bm.edges[:],cuts=5,use_grid_fill=True)
    bmesh.ops.triangulate(bm,faces=bm.faces[:])
    for v in bm.verts:
        hit,normal,_,_=tree.ray_cast(Vector((v.co.x,1,v.co.z)),Vector((0,-1,0)))
        if hit is None:raise ValueError("back bolt extends beyond body")
        v.co=hit+normal*0.007
    mesh=bpy.data.meshes.new("BackBolt");bm.to_mesh(mesh);bm.free()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    if sum(f.normal.y for f in bm.faces)<0:bmesh.ops.reverse_faces(bm,faces=bm.faces)
    bm.to_mesh(mesh);bm.free()
    mesh.materials.append(mat)
    obj=bpy.data.objects.new("BackBolt",mesh);bpy.context.scene.collection.objects.link(obj)
    obj.parent=body

def halo(mat,parent):
    radius=(255-104)*PIXEL/2;depth=139*PIXEL/2
    height=(519-375)*PIXEL+HOVER
    # The sheet shows the ring's interior in every upright view, its front
    # arc lower and crossing before the crest's base: keep that tilt.
    def pos(a,r=0,lift=0):
        x=math.cos(a)*(radius+r);y=math.sin(a)*(depth+r)
        return Vector((x,y,height+HALO_TILT*y+lift))
    # A band of lightning, not a wire: a diamond section thick enough to
    # read side-on and at phone size, its middle line zig-zagging in and
    # out and its width swelling and thinning like a bolt's segments.
    rng=random.Random(7);n=HALO_SECTIONS
    verts=[];faces=[];barbs=[]
    for k in range(n):
        a=2*math.pi*(k+rng.uniform(-0.22,0.22))/n
        out=k%2==0
        zig=(1 if out else -1)*rng.uniform(0.004,0.008)-1.25*HALO_WIDE-0.008
        wide=HALO_WIDE*(1.25 if out else 0.7);tall=HALO_TALL*(1.2 if out else 0.75)
        lift=(0.4 if k%4<2 else -0.4)*HALO_TALL
        verts.extend([pos(a,zig-wide,lift),pos(a,zig,lift+tall),pos(a,zig+wide,lift),pos(a,zig,lift-tall)])
        # Barbs fork off some outer corners, swept round the ring.
        if k%4==2:barbs.append((k,pos(a+0.17,zig+wide+0.022,lift+0.005)))
    for k in range(n):
        a=4*k;b=4*((k+1)%n)
        faces.extend((a+j,a+(j+1)%4,b+(j+1)%4,b+j) for j in range(4))
    for k,tip in barbs:
        i=len(verts);verts.append(tip)
        faces.extend([(4*k+1,4*k+2,i),(4*k+2,4*k+3,i),(4*k+3,4*k+1,i)])
    object_mesh("Halo",verts,faces,mat,parent)

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    purple=material("Violet facets",emission=0.25)
    gold=material("Pale gold lightning","#FFDE6A",0.6)
    white=material("White eyes","#FFFFFF",3)
    ring=material("Electrical ring","#FFE9A0",0.9)
    body=loft("ThunderSpirit","outline",[0.023,0.045,0.075,0.12,0.18,0.25,0.32,0.39,0.45,0.5,0.54,0.56,0.572],16,purple)
    crest=loft("LightningCrest","crest",[0.59,0.63,0.665,0.69,0.79,0.865,0.997],6,purple,body)
    for side in (-1,1):
        eye(body,side,gold,white);bolt(side,gold,body)
        front=[(side*abs(x-SHEET["front"]["center_pixel"])*PIXEL,(519-y)*PIXEL+HOVER) for x,y in SHEET["fin_front"]]
        fin=extruded_polygon(f"VioletFin.{'L' if side>0 else 'R'}",front,"Y",-0.026,0.026,purple)
        fin.parent=body;shade(fin)
    halo(ring,body)
    back_bolt(body,gold)
    # A small luminous diamond finishes the underside, as in every view.
    verts=[(-0.029,0,0.018*UNIT+HOVER),(0,0,0.045*UNIT+HOVER),(0.029,0,0.018*UNIT+HOVER),(0,0,HOVER),(0,-0.029,0.018*UNIT+HOVER),(0,0.029,0.018*UNIT+HOVER)]
    faces=[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)]
    object_mesh("BottomSpark",verts,faces,gold,body)
    triangles=sum(len(p.vertices)-2 for obj in bpy.data.objects if obj.type=="MESH" for p in obj.data.polygons)
    bpy.context.view_layer.update()
    points=[o.matrix_world @ v.co for o in bpy.data.objects if o.type=="MESH" for v in o.data.vertices]
    bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
    audit={"triangles":triangles,"sheet_height_m":UNIT,"actual_height_m":bounds[2][1]-bounds[2][0],"bounds_m":bounds,"body_height_m":max(v.co.z for v in body.data.vertices)-min(v.co.z for v in body.data.vertices),"objects":[o.name for o in bpy.data.objects],"materials":[m.name for m in bpy.data.materials],"animations":0,"status":"model review; not integrated"}
    (HERE/"audit.json").write_text(json.dumps(audit,indent=2)+"\n")
    bpy.context.scene.unit_settings.system="METRIC"
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"thunder-spirit.blend"))
    print(json.dumps(audit))

main()
