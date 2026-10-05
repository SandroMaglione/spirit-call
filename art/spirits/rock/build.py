"""Build a static, faceted Rock Spirit from measured turnaround contours.

Blender Z up, -Y forward. export.py converts to glTF +Y up, +Z forward.
The face is cut into the body, with a dark inset behind separate eyes.
All moving parts are independent objects, ready for a later animation pass.
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
PIXEL=SHEET["meters_per_pixel"]
RNG=random.Random(41)

def linear(color):
    rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    return [c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4 for c in rgb]

def material(name,color=None,emission=0):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    bsdf=mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value=0.95
    bsdf.inputs["Specular IOR Level"].default_value=0.07
    if color:
        bsdf.inputs["Base Color"].default_value=(*linear(color),1)
    else:
        attr=mat.node_tree.nodes.new("ShaderNodeVertexColor");attr.layer_name="Color"
        mat.node_tree.links.new(attr.outputs["Color"],bsdf.inputs["Base Color"])
    if emission:
        bsdf.inputs["Emission Color"].default_value=(*linear(color),1)
        bsdf.inputs["Emission Strength"].default_value=emission
    return mat

def mesh_object(name,verts,faces,mat,parent=None):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(mesh);bm.free()
    mesh.materials.append(mat)
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj)
    obj.parent=parent
    return obj

def shade(obj):
    mesh=obj.data;mesh.update()
    attr=mesh.color_attributes.new("Color","FLOAT_COLOR","CORNER")
    dark,mid,light=[linear(c) for c in reversed(SHEET["swatches"][:3])]
    for poly in mesh.polygons:
        # Facet brightness follows the stone's orientation with restrained
        # variation, so the eyes keep the strongest contrast.
        t=max(0,min(1,0.62+0.26*poly.normal.z+RNG.uniform(-0.13,0.13)))
        a,b,f=(dark,mid,t*2) if t<0.5 else (mid,light,(t-0.5)*2)
        color=[x+(y-x)*f for x,y in zip(a,b)]
        for i in poly.loop_indices:attr.data[i].color=(*color,1)

def section(view,part,z):
    rows=np.asarray(SHEET[view][part]);rows=rows[np.argsort(rows[:,0])]
    return np.array([np.interp(z,rows[:,0],rows[:,k]) for k in (1,2)])

def profile(views,part,z):
    a,b=np.mean([section(v,part,z) for v in views],axis=0)
    return (a+b)/2,(b-a)/2

def loft(name,part,heights,segments,mat,parent=None):
    verts=[];faces=[]
    for j,z in enumerate(heights):
        cx,rx=profile(("front","back"),part,z)
        cy,ry=profile(("left","right"),part,z)
        for i in range(segments):
            angle=2*math.pi*i/segments
            # Alternating rings break long meridian strips into broad rock
            # facets. Cardinal silhouette vertices remain measured.
            if i%3:angle+=(-1 if j%2 else 1)*0.065
            lift=0.007*math.sin(i*2.7+j) if 0<j<len(heights)-1 and i%3 else 0
            verts.append((cx+rx*math.sin(angle),-cy-ry*math.cos(angle),z+lift))
    for j in range(len(heights)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments;c=b+segments;d=a+segments
            faces.extend([(a,b,d),(b,c,d)] if (i+j)%2 else [(a,b,c),(a,c,d)])
    faces.extend([tuple(reversed(range(segments))),tuple(range((len(heights)-1)*segments,len(heights)*segments))])
    obj=mesh_object(name,verts,faces,mat,parent);shade(obj)
    return obj

def rock_piece(name,front,side,mat,xsign=1,parent=None):
    rows=np.asarray(front);zmin,zmax=rows[:,0].min(),rows[:,0].max()
    verts=[];faces=[];n=8
    # Sparse measured sections give each foot a sturdy, irregular outline.
    for j,t in enumerate((0,0.16,0.43,0.72,0.9,1)):
        z=zmin+(zmax-zmin)*t
        a,b=section("front",front_name[name],z)
        cx,rx=(a+b)/2,(b-a)/2
        if side:
            c,d=section("left","foot",z);cy,ry=-(c+d)/2,(d-c)/2
        else:cy,ry=0.04,max(0.008,rx*0.8)
        for i in range(n):
            angle=2*math.pi*i/n
            lift=0.005*math.sin(i*2.3+j) if 0<j<5 and i%2 else 0
            verts.append((xsign*(cx+rx*math.cos(angle)),cy+ry*math.sin(angle),z+lift))
    for j in range(5):
        for i in range(n):
            a=j*n+i;b=j*n+(i+1)%n;c=b+n;d=a+n
            faces.extend([(a,b,c),(a,c,d)] if (j+i)%2 else [(a,b,d),(b,c,d)])
    faces.extend([tuple(reversed(range(n))),tuple(range(5*n,6*n))])
    obj=mesh_object(name,verts,faces,mat,parent)
    # Center each object's origin for later bobbing and stepping.
    center=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
    for v in obj.data.vertices:v.co-=center
    obj.location=center
    shade(obj)
    return obj

front_name={"Foot.L":"foot","Foot.R":"foot","Float.L":"float","Float.R":"float"}

def cavity(body,dark):
    measured=SHEET["front"]["cavity_pixels"]
    middle=(min(x for x,y in measured)+max(x for x,y in measured))/2
    points=[((x-middle)*PIXEL,(285-y)*PIXEL) for x,y in measured]
    # Mirror paired corners, preserving the measured widths and heights.
    for a,b in ((0,3),(1,2),(4,7),(5,6)):
        width=(abs(points[a][0])+abs(points[b][0]))/2
        z=(points[a][1]+points[b][1])/2
        points[a]=(-width if points[a][0]<0 else width,z)
        points[b]=(-width if points[b][0]<0 else width,z)
    # A sloped rear surface keeps the recessed eyes visible looking down.
    def back(z):return -0.14+0.22*(z-0.19)
    rear_points=[(x*.82,.19+(z-.19)*.84) for x,z in points]
    verts=[(x,-0.36,z) for x,z in points]+[(x,back(z),z) for x,z in rear_points]
    n=len(points)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    cutter=mesh_object("Cavity cutter",verts,faces,dark)
    body.data.materials.append(dark)
    mod=body.modifiers.new("Recessed face","BOOLEAN");mod.operation="DIFFERENCE";mod.solver="EXACT";mod.object=cutter
    bpy.context.view_layer.objects.active=body
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    # A separate closed dark liner also gives the eye surface a stable
    # target for snapping, independent of the boolean's generated facets.
    rear=[(x,back(z)-0.0008,z) for x,z in rear_points]
    inset=mesh_object("FaceInset",rear,[tuple(range(n))],dark,body)
    return inset

def eye(side,inset,mat,body):
    width=np.mean([e["width"] for e in SHEET["front"]["eyes"]])
    height=np.mean([e["height"] for e in SHEET["front"]["eyes"]])
    x=side*abs(SHEET["front"]["eyes"][1]["x"]-SHEET["front"]["eyes"][0]["x"])/2
    z=np.mean([e["z"] for e in SHEET["front"]["eyes"]])
    tree=BVHTree.FromPolygons([v.co for v in inset.data.vertices],[p.vertices for p in inset.data.polygons])
    coords=[(x,z)]+[(x+math.cos(i*math.tau/24)*width/2,z+math.sin(i*math.tau/24)*height/2) for i in range(24)]
    verts=[]
    for px,pz in coords:
        hit,_,_,_=tree.ray_cast(Vector((px,-1,pz)),Vector((0,1,0)))
        if hit is None:raise ValueError("eye leaves its recessed surface")
        verts.append((hit.x,hit.y-0.002,hit.z))
    obj=mesh_object(f"Eye.{'L' if side<0 else 'R'}",verts,[(0,i+1,(i+1)%24+1) for i in range(24)],mat,body)
    center=Vector(verts[0])
    for v in obj.data.vertices:v.co-=center
    obj.location=center

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stone=material("Stone facets")
    bsdf=stone.node_tree.nodes["Principled BSDF"]
    # A small, flat fill keeps downward-facing facets readable without
    # adding a view-dependent halo to this static asset.
    bsdf.inputs["Emission Color"].default_value=(*linear(SHEET["swatches"][1]),1)
    bsdf.inputs["Emission Strength"].default_value=0.13
    dark=material("Dark face cavity",SHEET["swatches"][3])
    amber=material("Amber eyes","#FFE088",1)
    # Emission supplies the eye color; direct light must not wash the
    # amber out to saturated yellow or leave a shadow across an eye.
    amber.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value=(0,0,0,1)
    body=loft("RockSpirit","body",[0.065,0.09,0.145,0.215,0.29,0.355,0.40,0.438],12,stone)
    inset=cavity(body,dark)
    # Boolean geometry carries interpolated vertex colors; fresh flat
    # colors prevent a stretched gradient along the opening's rim.
    body.data.color_attributes.remove(body.data.color_attributes["Color"]);shade(body)
    cap=loft("TopRock","cap",[0.456,0.475,0.51,0.555,0.588,0.618],12,stone,body)
    center=sum((v.co for v in cap.data.vertices),Vector())/len(cap.data.vertices)
    for v in cap.data.vertices:v.co-=center
    cap.location=center
    for side in (-1,1):
        name="L" if side<0 else "R"
        rock_piece(f"Foot.{name}",SHEET["front"]["foot"],True,stone,-side,body)
        rock_piece(f"Float.{name}",SHEET["front"]["float"],False,stone,-side,body)
        eye(side,inset,amber,body)
    bpy.context.view_layer.update()
    meshes=[o for o in bpy.data.objects if o.type=="MESH"]
    points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    bounds=[[min(p[k] for p in points),max(p[k] for p in points)] for k in range(3)]
    # Put the supporting feet on the ground origin, preserving all gaps.
    body.location.z=-bounds[2][0]
    bpy.context.view_layer.update()
    points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    bounds=[[min(p[k] for p in points),max(p[k] for p in points)] for k in range(3)]
    audit={"status":"static model review; no character kit or animation", "triangles":sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),"materials":[m.name for m in bpy.data.materials],"objects":[o.name for o in meshes],"bounds_m":bounds,"height_m":bounds[2][1],"height_basis":"ground origin to highest rest mesh vertex including floating cap","animations":0,"skeletons":0}
    (HERE/"audit.json").write_text(json.dumps(audit,indent=2)+"\n")
    bpy.context.scene.unit_settings.system="METRIC"
    bpy.context.scene.render.engine="BLENDER_EEVEE_NEXT"
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"rock-spirit.blend"))
    print(json.dumps(audit))

main()
