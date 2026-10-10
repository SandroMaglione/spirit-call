"""Build closed faceted core, three crescent volumes and detached fins.

Front-image traces live in sheet.json. Native meters, +Z up, +Y forward.
"""
import json
import math
import random
from pathlib import Path
import bmesh
import bpy
from mathutils import Vector, Matrix

HERE=Path(__file__).resolve().parent
S=json.loads((HERE/"sheet.json").read_text())
RNG=random.Random(71)
SCALE=S["meters_per_pixel"]

def linear(h):
    rgb=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)

def material(name,color=None,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes["Principled BSDF"]
    bs.inputs["Roughness"].default_value=.8
    bs.inputs["Specular IOR Level"].default_value=.12
    if color:
        bs.inputs["Base Color"].default_value=(*linear(color),1)
    else:
        a=m.node_tree.nodes.new("ShaderNodeVertexColor");a.layer_name="Color"
        m.node_tree.links.new(a.outputs["Color"],bs.inputs["Base Color"])
    if emission:
        bs.inputs["Emission Color"].default_value=(*linear(color),1)
        bs.inputs["Emission Strength"].default_value=emission
    return m

def point(x,z,y=0):
    return Vector((-(x-S["center_px"])*SCALE,y,(S["ground_px"]-z)*SCALE))

def mesh(name,verts,faces,mat):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.materials.append(mat)
    bm=bmesh.new();bm.from_mesh(m)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(m);bm.free();m.update()
    obj=bpy.data.objects.new(name,m);bpy.context.scene.collection.objects.link(obj)
    pivot=sum((v.co for v in m.vertices),Vector())/len(m.vertices)
    for v in m.vertices:v.co-=pivot
    obj.location=pivot
    bpy.context.view_layer.update()
    return obj

def blend(a,b,t):return tuple(x+(y-x)*t for x,y in zip(a,b))

def shade(obj,role):
    m=obj.data;m.update();attr=m.color_attributes.new("Color","FLOAT_COLOR","CORNER")
    pale,aqua,sky,royal,lav=[linear(S["swatches"][k]) for k in ("pale","aqua","sky","royal","lavender")]
    for p in m.polygons:
        q=obj.matrix_world@p.center
        noise=RNG.uniform(-.15,.15)
        if role=="core":
            high=max(0,min(1,(q.z-.12)/.31))
            bright=max(.14,min(.95,.24+.45*high+.15*p.normal.z+noise*.6))
            rgb=tuple(c*bright for c in royal)
            if q.z>.34 and p.normal.z>.4:rgb=blend(rgb,sky,.13)
        else:
            high=max(0,min(1,q.z/.6))
            front=p.normal.y
            bright=max(0,min(1,.28+.24*front+.15*p.normal.z+noise))
            if role=="shell":
                rows=S["main_shell_rows"] if obj.name=="Shell.Main" else S["right_shell_rows"]
                z=S["ground_px"]-q.z/SCALE;x=S["center_px"]-q.x/SCALE
                for a,b in zip(rows,rows[1:]):
                    if a[2]<=z<=b[2]:
                        t=(z-a[2])/(b[2]-a[2]);lo=a[0]+(b[0]-a[0])*t;hi=a[1]+(b[1]-a[1])*t
                        u=max(0,min(1,(x-lo)/max(1,hi-lo)))
                        if obj.name!="Shell.Main":u=1-u
                        bright=max(0,min(1,1.25-1.15*u+noise))
                        break
                if obj.name=="Shell.Crest":bright=max(0,min(1,.73+.13*p.normal.z+noise*.5))
            rgb=blend(royal,sky,bright*2) if bright<.5 else blend(sky,pale,(bright-.5)*2)
            if role=="shell" and obj.name!="Shell.Crest" and bright>.75:rgb=blend(rgb,(1,1,1),(bright-.75)*1.2)
            # The exposed inner edge and lower point have a blue/lavender seam.
            lavender_height=.24 if obj.name=="Shell.Right" else .13
            if role=="shell" and q.z<lavender_height:
                rgb=blend(rgb,lav,.85*(1-q.z/lavender_height))
            if role=="shell" and p.normal.y<-.45:rgb=blend(rgb,royal,.25)
        for i in p.loop_indices:attr.data[i].color=(*rgb,1)
        p.use_smooth=False
    obj["role"]=role

def crescent(name,rows,y,depth,mat,horizontal=False):
    # Lenticular sections have shared knife edges, a raised front keel and a
    # rear keel. Alternating diagonals make broad crystalline planes.
    to_point=lambda x,z,depth:point(z,x,depth) if horizontal else point(x,z,depth)
    verts=[to_point(rows[0][0],rows[0][2],y)];rings=[]
    for j,(left,right,z) in enumerate(rows[1:-1]):
        t=(j+1)/(len(rows)-1)
        width=(right-left)*SCALE
        center_y=y+.015*math.sin(t*math.pi)
        ids=[]
        for u,h in ((0,0),(.33,.82),(.66,1),(1,0),(.66,-.7),(.33,-.8)):
            stagger=0
            ids.append(len(verts));verts.append(to_point(left+(right-left)*u,z+stagger,center_y+h*min(depth,width*.9)))
        rings.append(ids)
    end=len(verts);verts.append(to_point(rows[-1][0],rows[-1][2],y))
    faces=[]
    for i in range(6):faces.append((0,rings[0][i],rings[0][(i+1)%6]))
    for j,(a,b) in enumerate(zip(rings,rings[1:])):
        for i in range(6):
            k=(i+1)%6
            if (i+j)%2:faces.extend(((a[i],b[i],a[k]),(a[k],b[i],b[k])))
            else:faces.extend(((a[i],b[i],b[k]),(a[i],b[k],a[k])))
    for i in range(6):faces.append((rings[-1][i],end,rings[-1][(i+1)%6]))
    obj=mesh(name,verts,faces,mat);shade(obj,"shell");return obj

def fin(name,outline,mat):
    pts=[point(x,z,-.02) for x,z in outline]
    center=sum(pts,Vector())/len(pts)
    verts=pts+[center+Vector((0,.038,0)),center-Vector((0,.040,0))]
    n=len(pts);faces=[]
    for i in range(n):faces.extend(((i,(i+1)%n,n),((i+1)%n,i,n+1)))
    obj=mesh(name,verts,faces,mat);shade(obj,"fin");return obj

def eye(name,cx,cz,mat,core):
    # Cast every vertex onto the actual triangle surface. A closed thin lens
    # conforms to the core rather than sinking through its flat facets.
    center=point(cx,cz,0);rx,rz=[v*SCALE for v in S["eye_radii_px"]]
    verts=[];rings=[];n=32
    profiles=[(0,.005)]+[(i/8,.005) for i in range(1,9)]
    profiles += [(1,.001),(0,.001)]
    for radius,offset in profiles:
        ids=[]
        for i in range(1 if radius==0 else n):
            a=math.tau*i/n
            world=Vector((center.x+rx*radius*math.cos(a),1,center.z+rz*radius*math.sin(a)))
            hit,loc,normal,index=core.ray_cast(core.matrix_world.inverted()@world,Vector((0,-1,0)))
            assert hit,(name,world)
            world=core.matrix_world@loc;world.y+=offset
            ids.append(len(verts));verts.append(world)
        rings.append(ids)
    faces=[]
    for a,b in zip(rings,rings[1:]):
        for i in range(n):
            k=(i+1)%n
            if len(a)==1:faces.append((a[0],b[i],b[k]))
            elif len(b)==1:faces.append((a[i],b[0],a[k]))
            else:faces.extend(((a[i],b[i],b[k]),(a[i],b[k],a[k])))
    obj=mesh(name,verts,faces,mat);obj["role"]="eye";return obj

bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.unit_settings.system="METRIC";scene.unit_settings.scale_length=1
palette=material("Water • faceted vertex palette")
glow=material("Eyes • cyan emission","#9df8ff",1.8)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=1)
core=bpy.context.object;core.name="WaterCore";core.data.materials.append(palette)
core.location=point(*S["core"]["center"])
rx,rz=S["core"]["radii_px"]
core.scale=(rx*SCALE,rz*SCALE,rz*SCALE)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.context.view_layer.update();shade(core,"core")
crescent("Shell.Main",S["main_shell_rows"],.056,.085,palette)
crescent("Shell.Right",S["right_shell_rows"],.010,.070,palette)
# The third piece is the pale crest over the dark core in the front/hero.
# Its closed section gives the cap depth while leaving the face exposed.
crest=crescent("Shell.Crest",S["crest_shell_rows"],.072,.054,palette,horizontal=True)
bm=bmesh.new();bm.from_mesh(crest.data)
bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=3,use_grid_fill=True)
bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(crest.data);bm.free()
for v in crest.data.vertices:
    world=crest.matrix_world@v.co
    hit,loc,normal,index=core.ray_cast(core.matrix_world.inverted()@Vector((world.x,1,world.z)),Vector((0,-1,0)))
    if hit:
        surface=core.matrix_world@loc
        world.y=surface.y+.007+(world.y-.08)*.12
        v.co=crest.matrix_world.inverted()@world
bm=bmesh.new();bm.from_mesh(crest.data)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(crest.data);bm.free()
for name,outline in S["fins"].items():fin(name,outline,palette)
for name,cx in zip(("Eye.L","Eye.R"),(160,185)):
    eye(name,cx,238,glow,core)
bpy.context.view_layer.update()
# Face the midpoint of the surface eyes along native +Y. Reference review
# cameras compensate for the supplied sheet's turned face.
rotation=Matrix.Rotation(math.radians(-16),4,"Z")
for o in list(scene.objects):o.matrix_world=rotation@o.matrix_world
scene["asset"]="Water Spirit • crescent shell static study"
scene["native_axes"]="meters; Z up; +Y forward; ground under floating body"
scene["reference_policy"]="Front/hero landmarks; inferred shell depth; provisional .60 m. See sheet.json."
scene["stage"]="Static geometry only. No clips or skeleton."
bpy.context.view_layer.objects.active=core
bpy.ops.object.select_all(action="SELECT")
bpy.context.preferences.filepaths.save_version=0
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=="VIEW_3D":
            space=area.spaces.active;space.shading.type="MATERIAL"
            space.region_3d.view_location=(0,0,.3);space.region_3d.view_distance=1.3
            space.region_3d.view_rotation=Vector((-.3,-1,-.1)).to_track_quat("-Z","Y")
            space.region_3d.view_perspective="ORTHO"
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"water-crescent.blend"))
print("Saved",sum(len(o.data.polygons) for o in scene.objects),"triangles")
