"""Build an editable static Chaser, measured from the production sheet.

Blender uses Z up and -Y forward. Separate shells keep useful part names
for later rigging; all surfaces share one flat vertex-color material.
No rig, actions, GLB export or runtime registration is created here.
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
from mathutils.geometry import tessellate_polygon

HERE=Path(__file__).resolve().parent
SHEET=json.loads((HERE/"sheet.json").read_text())
RNG=random.Random(47)
PALETTE=SHEET["palette"]
PARTS=[]

def linear(color):
    a=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    return [v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in a]

def mesh(name,verts,faces,color="rust",variation=.12):
    data=bpy.data.meshes.new(name)
    data.from_pydata(verts,[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(data);bm.free();data.update()
    data.materials.append(MATERIAL)
    obj=bpy.data.objects.new(name,data)
    bpy.context.scene.collection.objects.link(obj)
    attr=data.color_attributes.new("Color","FLOAT_COLOR","CORNER")
    rgb=linear(PALETTE.get(color,color))
    for poly in data.polygons:
        shade=1+RNG.uniform(-variation,variation)
        rgba=(*[min(1,max(0,v*shade)) for v in rgb],1)
        for i in poly.loop_indices: attr.data[i].color=rgba
    obj["part"]=name
    PARTS.append(obj)
    return obj

def edge(part,view,z):
    rows=np.asarray(SHEET["parts"][part][view]);rows=rows[np.argsort(rows[:,0])]
    return np.interp(z,rows[:,0],rows[:,1]),np.interp(z,rows[:,0],rows[:,2])

def section(part,z):
    views=SHEET["parts"][part]
    front="front" if "front" in views else "back"
    a,b=edge(part,front,z)
    # The sheet's frontal head is slightly turned. Center the face, keeping
    # its measured widths; the crest keeps its drawn asymmetry.
    x=0 if part in ("head","torso") else (a+b)/2
    side="right"
    c,d=edge(part,side,z)
    if part=="torso" and "left" in views:
        e,f=edge(part,"left",z);c,d=(c+e)/2,(d+f)/2
    return x,(c+d)/2,max(.004,(b-a)/2),max(.004,(d-c)/2)

def loft(name,part,heights,segments=8,color="rust"):
    verts=[];faces=[]
    for z in heights:
        x,y,rx,ry=section(part,z)
        for k in range(segments):
            a=k*2*math.pi/segments
            verts.append((x+rx*math.sin(a),y-ry*math.cos(a),z))
    for j in range(len(heights)-1):
        for k in range(segments):
            a=j*segments+k;b=j*segments+(k+1)%segments;c=a+segments;d=b+segments
            faces.extend([(a,b,d),(a,d,c)])
    for j in (0,len(heights)-1):
        faces.append(tuple(j*segments+k for k in range(segments)))
    return mesh(name,verts,faces,color)

def shell(name,start,end,radii,color="rust",sides=6):
    """Three faceted rings give a limb a broad shell and tapered ends."""
    a,b=Vector(start),Vector(end);axis=(b-a).normalized()
    u=axis.cross(Vector((0,1,0)))
    if u.length<.01:u=axis.cross(Vector((1,0,0)))
    u.normalize();v=axis.cross(u).normalized()
    verts=[];faces=[]
    for t,r in ((0,radii[0]),(.38,radii[1]),(1,radii[2])):
        p=a.lerp(b,t)
        for k in range(sides):
            angle=2*math.pi*k/sides
            verts.append(p+u*math.cos(angle)*r+v*math.sin(angle)*r*.82)
    for j in range(2):
        for k in range(sides):
            a=j*sides+k;b=j*sides+(k+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple(2*sides+k for k in range(sides))])
    return mesh(name,verts,faces,color)

def ellipsoid(name,center,scale,color="rust",segments=6):
    verts=[];faces=[]
    for row,latitude in enumerate((-math.pi/2,-math.pi/4,0,math.pi/4,math.pi/2)):
        for k in range(segments):
            a=k*2*math.pi/segments
            verts.append((center[0]+scale[0]*math.cos(latitude)*math.cos(a),
                          center[1]+scale[1]*math.cos(latitude)*math.sin(a),
                          center[2]+scale[2]*math.sin(latitude)))
    for j in range(4):
        for k in range(segments):
            a=j*segments+k;b=j*segments+(k+1)%segments
            faces.append((a,b,b+segments,a+segments))
    # Weld pole duplicates instead of leaving zero-area triangles.
    obj=mesh(name,verts,faces,color)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.00001)
    bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=.00001)
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    return obj

def cross(a,b): return a[0]*b[1]-a[1]*b[0]

def clip(subject,triangle):
    """Intersect a decal triangle with a skull triangle in the front plane."""
    if cross(triangle[1]-triangle[0],triangle[2]-triangle[0])<0:triangle=list(reversed(triangle))
    result=subject
    for k,a in enumerate(triangle):
        b=triangle[(k+1)%3];edge=b-a;previous=result
        result=[]
        if not previous:break
        for j,p in enumerate(previous):
            q=previous[(j+1)%len(previous)]
            dp,dq=cross(edge,p-a),cross(edge,q-a)
            if dp>=-1e-9:result.append(p)
            if (dp>=0)!=(dq>=0):result.append(p+(q-p)*dp/(dp-dq))
    return result

def projected(name,points,head,color,lift=.002):
    """Cut the decal at skull facet boundaries, then snap each piece to it."""
    triangles=tessellate_polygon([[Vector((x,z,0)) for x,z in points]])
    head.data.calc_loop_triangles()
    verts=[];faces=[]
    for tri in head.data.loop_triangles:
        a,b,c=[head.data.vertices[i].co for i in tri.vertices]
        normal=(b-a).cross(c-a)
        if normal.y>=-1e-8:continue
        region=[np.array((p.x,p.z)) for p in (a,b,c)]
        for decal in triangles:
            poly=clip([np.array(points[i]) for i in decal],region)
            if len(poly)<3:continue
            area=sum(cross(poly[i],poly[(i+1)%len(poly)]) for i in range(len(poly)))
            if abs(area)<1e-8:continue
            start=len(verts)
            for x,z in poly:
                y=a.y-(normal.x*(x-a.x)+normal.z*(z-a.z))/normal.y-lift
                verts.append((x,y,z))
            faces.append(tuple(start+i for i in range(len(poly))))
    if not faces:raise ValueError(f"empty decal {name}")
    obj=mesh(name,verts,faces,color,.025)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.000001)
    bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=.000001)
    bm.to_mesh(obj.data);bm.free()
    # Place each eye's origin at its center for later blink controls.
    mean=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
    for v in obj.data.vertices:v.co-=mean
    obj.location=mean
    return obj

def face(head):
    eyes=SHEET["eyes"]
    ex=abs(eyes[0]["x"]-eyes[1]["x"])/2
    ez=np.mean([e["z"] for e in eyes])
    ew=np.mean([e["width"] for e in eyes])/2
    eh=np.mean([e["height"] for e in eyes])/2
    # A tapered dark recess with a pale outer lip follows the head's V.
    outline=[(.018,.71),(.14,.78),(.25,.94),(.29,1.17),(.25,1.10),(.135,.91)]
    for sign,side in ((1,"L"),(-1,"R")):
        points=[(sign*x,z) for x,z in outline]
        projected(f"FaceRim.{side}",points,head,"bone",.002)
        center=np.mean(points,axis=0)
        inner=[tuple(center+(np.array(p)-center)*np.array((.70,.81))) for p in points]
        projected(f"EyeSocket.{side}",inner,head,"#17150F",.0035)
        ellipse=[]
        # Mirror the tilt along with the eye, so the scowl is symmetric.
        for k in range(12):
            a=k*2*math.pi/12
            x=math.cos(a)*ew;z=math.sin(a)*eh
            theta=math.radians(-22)
            u=x*math.cos(theta)-z*math.sin(theta)
            v=x*math.sin(theta)+z*math.cos(theta)
            ellipse.append((sign*(ex+u),ez+v))
        projected(f"Eye.{side}",ellipse,head,"eye",.005)

def shield(head):
    """A single angular forehead ends between the recessed eyes."""
    tree=BVHTree.FromPolygons([v.co for v in head.data.vertices],[list(p.vertices) for p in head.data.polygons])
    # Front contour landmarks are measured on the red shield, inside the
    # pale side rims. One ridge gives the large planes their readable V.
    boundary=[(0,1.46),(.17,1.36),(.28,1.17),(.24,1.10),(0,.76),(-.24,1.10),(-.28,1.17),(-.17,1.36)]
    points=[(0,1.17)]+boundary
    verts=[]
    for x,z in points:
        hit,_,_,_=tree.ray_cast(Vector((x,-3,z)),Vector((0,1,0)))
        if hit is None: raise ValueError(f"shield outside skull: {x,z}")
        hit.y-=.025 if x else .08
        verts.append(hit)
    faces=[(0,1+i,1+(i+1)%len(boundary)) for i in range(len(boundary))]
    # The central ridge is deliberately planar, so the lower forehead
    # covers the skull instead of becoming another rounded ellipsoid.
    return mesh("ForeheadShield",verts,faces,"rust",.09)

def claw():
    """The curved blade lofts its front and side contours at the same height."""
    verts=[];faces=[];rings=[0,.07,.17,.28,.40,.51,.61]
    front=np.asarray(SHEET["parts"]["claw"]["front"])
    side=np.asarray(SHEET["parts"]["claw"]["right"])
    for z in rings:
        t=z/.61
        fz=front[:,0].min()+t*np.ptp(front[:,0])
        sz=side[:,0].min()+t*np.ptp(side[:,0])
        a,b=edge("claw","front",fz);c,d=edge("claw","right",sz)
        cx,cy=(a+b)/2,(c+d)/2
        # Six points keep the blade's diamond cross-section and sharp edge.
        for dx,dy in ((-1,0),(-.6,-.7),(.6,-.7),(1,0),(.6,.7),(-.6,.7)):
            verts.append((cx+dx*max(.002,(b-a)/2),cy+dy*max(.003,(d-c)/2),z))
    for j in range(len(rings)-1):
        for k in range(6):
            a=j*6+k;b=j*6+(k+1)%6
            faces.append((a,b,b+6,a+6))
    faces += [tuple(reversed(range(6))),tuple(36+k for k in range(6))]
    return mesh("BoneClaw.R",verts,faces,"bone",.055)

def main():
    global MATERIAL
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATERIAL=bpy.data.materials.new("Chaser palette");MATERIAL.use_nodes=True
    nodes=MATERIAL.node_tree.nodes;bsdf=nodes["Principled BSDF"]
    attr=nodes.new("ShaderNodeVertexColor");attr.layer_name="Color"
    MATERIAL.node_tree.links.new(attr.outputs["Color"],bsdf.inputs["Base Color"])
    # Yellow eye facets emit softly without adding a material per eye.
    MATERIAL.node_tree.links.new(attr.outputs["Color"],bsdf.inputs["Emission Color"])
    separate=nodes.new("ShaderNodeSeparateColor")
    MATERIAL.node_tree.links.new(attr.outputs["Color"],separate.inputs["Color"])
    threshold=nodes.new("ShaderNodeMath");threshold.operation="GREATER_THAN";threshold.inputs[1].default_value=.55
    MATERIAL.node_tree.links.new(separate.outputs["Green"],threshold.inputs[0])
    multiply=nodes.new("ShaderNodeMath");multiply.operation="MULTIPLY";multiply.inputs[1].default_value=.35
    blue=nodes.new("ShaderNodeMath");blue.operation="LESS_THAN";blue.inputs[1].default_value=.12
    MATERIAL.node_tree.links.new(separate.outputs["Blue"],blue.inputs[0])
    eye_mask=nodes.new("ShaderNodeMath");eye_mask.operation="MULTIPLY"
    MATERIAL.node_tree.links.new(threshold.outputs[0],eye_mask.inputs[0])
    MATERIAL.node_tree.links.new(blue.outputs[0],eye_mask.inputs[1])
    MATERIAL.node_tree.links.new(eye_mask.outputs[0],multiply.inputs[0])
    MATERIAL.node_tree.links.new(multiply.outputs[0],bsdf.inputs["Emission Strength"])
    bsdf.inputs["Roughness"].default_value=.86;bsdf.inputs["Specular IOR Level"].default_value=.12
    torso=loft("Carapace", "torso", [.64,.77,.91,1.07,1.22,1.36,1.5],8)
    # Brown joints show between armor shells; the pale belly is a broad bib.
    _,body_y,_,body_depth=section("torso",.90)
    ellipsoid("Abdomen",(0,body_y,.69),(.22,.20,.20),"brown")
    shell("BellyBib",(0,body_y-body_depth+.04,.90),(0,body_y-.13,.52),(.20,.21,.025),"bone",6)
    head=loft("HeadShell","head",[.635,.70,.82,.97,1.12,1.28,1.41,1.48],8,"brown")
    # Rust remains on the crown and sides; the recessed face stays brown.
    attr=head.data.color_attributes["Color"]
    for p in head.data.polygons:
        if p.center.y>-.28 or p.center.z>1.30:
            for i in p.loop_indices:attr.data[i].color=(*linear(PALETTE["rust"]),1)
    face(head);shield(head)
    crest=loft("SweptCrest","crest",[1.26,1.34,1.44,1.57,1.68,1.78,1.8],6)
    crest_x,crest_y,_,_=section("crest",1.32)
    ellipsoid("CrestSocket",(crest_x,crest_y,1.30),(.13,.15,.12),"rust")
    joints={k:Vector(v) for k,v in SHEET["joints"].items()}
    widths=SHEET["shell_widths_m"]
    for sign,side in ((-1,"R"),(1,"L")):
        def mirrored(name):
            p=joints[name].copy();p.x=sign*abs(p.x);return p
        sh,el,wr=[mirrored(k) for k in ("shoulder","elbow","wrist")]
        if side=="L":
            # The small hand hangs behind the body in the side view.
            sh.y=(685-674)*SHEET["meters_per_pixel"]
            el.y=(685-664)*SHEET["meters_per_pixel"]
            wr.y=(685-655)*SHEET["meters_per_pixel"]
        ellipsoid(f"ShoulderJoint.{side}",sh,(.12,.13,.12),"brown")
        ellipsoid(f"ShoulderPlate.{side}",sh+Vector((sign*.018,0,.025)),(.15,.17,.145))
        shell(f"UpperArm.{side}",sh+Vector((sign*.065,0,-.06)),el,(.065,.080,.06))
        ellipsoid(f"Elbow.{side}",el,(.087,.085,.083),"brown")
        shell(f"Forearm.{side}",el,wr,(.074,widths["forearm"]/2,.075))
        ellipsoid(f"WristPlate.{side}",wr,(.14,.13,.125))
        if side=="L":
            p=wr+Vector((sign*.025,.055,-.11))
            shell("SmallPalm.L",wr,p,(.085,.10,.075),"brown")
            for dx,dz in ((-.055,-.07),(.04,-.10)):
                q=p+Vector((dx,.04,dz))
                r=q+Vector((-sign*.047,-.025,-.06))
                shell("Finger.L",p+Vector((dx,0,0)),q,(.038,.043,.03))
                shell("FingerTip.L",q,r,(.026,.029,.005),"brown",5)
        hip,knee,ankle,toe=[mirrored(k) for k in ("hip","knee","ankle","toe")]
        ellipsoid(f"HipJoint.{side}",hip,(.10,.10,.115),"brown")
        shell(f"ThighPlate.{side}",hip,knee,(.075,widths["thigh"]/2,.08))
        ellipsoid(f"Knee.{side}",knee,(.099,.105,.088),"brown")
        shell(f"ShinPlate.{side}",knee,ankle,(.07,widths["shin"]/2,.075))
        toe.z=.064
        shell(f"Ankle.{side}",ankle,toe+Vector((0,.09,.025)),(.071,.08,.069),"brown")
        ellipsoid(f"Foot.{side}",toe,(widths["foot"]/2,.20,.075),"rust")
        for j in (-1,0,1):
            start=toe+Vector((j*.075,-.13,.005))
            tip=toe+Vector((j*.098,-.25,-.038))
            shell(f"Toe.{side}.{j+1}",start,tip,(.043,.045,.008),"brown",5)
    claw()
    # Faceted scapulae break up the back without adding little chips.
    _,rear_y,_,rear_depth=section("torso",1.13)
    back=rear_y+rear_depth-.02
    for sign,side in ((-1,"R"),(1,"L")):
        shell(f"Scapula.{side}",(sign*.08,back,1.22),(sign*.17,back,.97),(.09,.13,.045))
    shell("BackKeel",(0,back,1.17),(0,back+.04,.29),(.075,.105,.008))
    # Ground the complete figure, including the low claw tip.
    bpy.context.view_layer.update()
    points=[o.matrix_world@v.co for o in PARTS for v in o.data.vertices]
    floor=min(v.z for v in points)
    for obj in PARTS: obj.location.z-=floor
    bpy.context.view_layer.update()
    points=[o.matrix_world@v.co for o in PARTS for v in o.data.vertices]
    # The front's crest-to-claw height is the common scale anchor.
    factor=1.8/(max(v.z for v in points)-min(v.z for v in points))
    for obj in PARTS:
        obj.location*=factor
        for v in obj.data.vertices:v.co*=factor
    bpy.context.view_layer.update()
    points=[o.matrix_world@v.co for o in PARTS for v in o.data.vertices]
    triangles=sum(len(p.vertices)-2 for o in PARTS for p in o.data.polygons)
    bounds=[[min(v[i] for v in points),max(v[i] for v in points)] for i in range(3)]
    audit={"status":"static model review; not integrated","triangles":triangles,
           "materials":len({m.name for o in PARTS for m in o.data.materials}),
           "mesh_objects":len(PARTS),"bones":0,"actions":0,"bounds_m":bounds,
           "height_m":bounds[2][1]-bounds[2][0],"width_m":bounds[0][1]-bounds[0][0],
           "depth_m":bounds[1][1]-bounds[1][0],"objects":[o.name for o in PARTS]}
    assert triangles<2000,triangles
    assert audit["materials"]==1
    (HERE/"audit.json").write_text(json.dumps(audit,indent=2)+"\n")
    scene=bpy.context.scene;scene.unit_settings.system="METRIC"
    # Helpful solid-mode colors and framing when the source is opened.
    for obj in PARTS:obj.color=(*linear(PALETTE["rust"]),1)
    bpy.ops.object.select_all(action="DESELECT");head.select_set(True);bpy.context.view_layer.objects.active=head
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                area.spaces.active.shading.type="MATERIAL"
                area.spaces.active.region_3d.view_distance=4
                area.spaces.active.region_3d.view_location=(0,0,.9)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"chaser-production.blend"))
    print(json.dumps(audit))

main()
