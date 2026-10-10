"""Build a static, closed Ice Spirit from the supplied sheet's landmarks.

Native Blender: meters, Z up, +Y forward, ground origin at (0,0,0).
No rig, clips, textures, or runtime registration are created.
"""
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
SHEET = json.loads((HERE / "sheet.json").read_text())
RNG = random.Random(121)

def linear(hex_color):
    rgb = [int(hex_color[i:i+2], 16) / 255 for i in (1,3,5)]
    return tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in rgb)

def material(name, color=None, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = .78
    bsdf.inputs["Specular IOR Level"].default_value = .12
    if color:
        bsdf.inputs["Base Color"].default_value = (*linear(color), 1)
    else:
        attr = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Color"
        mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*linear(color), 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat

def point(px, depth):
    x, y = px
    # A camera on native +Y sees +X on its left. Mirror the sheet's image X
    # so the rendered front preserves the supplied drawing's handedness.
    return Vector((-(x-SHEET["center_px"])*SHEET["meters_per_pixel_x"], depth,
                   (SHEET["ground_px"]-y)*SHEET["meters_per_pixel_z"]))

def mesh_object(name, vertices, faces, materials, indices=None, pivot=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    for mat in materials:
        mesh.materials.append(mat)
    if indices:
        for poly, index in zip(mesh.polygons, indices):
            poly.material_index = index
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if pivot is None:
        lo = Vector(tuple(min(v.co[k] for v in mesh.vertices) for k in range(3)))
        hi = Vector(tuple(max(v.co[k] for v in mesh.vertices) for k in range(3)))
        pivot = (lo+hi)/2
    pivot = Vector(pivot)
    for v in mesh.vertices:
        v.co -= pivot
    obj.location = pivot
    return obj

def shade(obj):
    mesh = obj.data
    mesh.update()
    colors = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    white, ice, blue = [linear(SHEET["swatches"][k]) for k in ("white", "ice", "blue")]
    for poly in mesh.polygons:
        if poly.material_index == 1:
            for loop in poly.loop_indices:
                colors.data[loop].color=(1,1,1,1)
            continue
        # Wide color planes carry the drawing's pale left crown and blue right
        # flank. Small deterministic differences reveal the triangular planes.
        world_center = obj.matrix_world @ poly.center
        left = max(-1, min(1, world_center.x/.17))
        high = max(0, min(1, (world_center.z-.38)/.42))
        brightness = .48 + .35*left + .23*high + RNG.uniform(-.18,.18)
        if obj.name.startswith("Shard"):
            height=max(v.co.z for v in mesh.vertices)-min(v.co.z for v in mesh.vertices)
            local_height=(poly.center.z-min(v.co.z for v in mesh.vertices))/height-.5
            brightness=.51+.95*local_height+.1*poly.normal.x+RNG.uniform(-.07,.07)
        if poly.normal.y < -.35:
            brightness -= .14
        brightness = max(.08, min(.97, brightness))
        a, b, t = (blue, ice, brightness*2) if brightness < .5 else (ice, white, (brightness-.5)*2)
        rgb = tuple(x+(y-x)*t for x,y in zip(a,b))
        for loop in poly.loop_indices:
            colors.data[loop].color = (*rgb, 1)

def shell(ice, face):
    outer = [point(p, y) for p,y in zip(SHEET["body_outline"], (.01,0,.005,0,.005,0))]
    lip = [point(p,y) for p,y in zip(SHEET["face_outline"], (.105,.135,.133,.112,.133,.135))]
    verts, faces, indices = list(outer) + list(lip), [], []
    def tri(a,b,c, material=0):
        faces.append((a,b,c)); indices.append(material)
    # Triangles follow the sheet's broad, irregular planes rather than long
    # concentric strips. The central face is a genuine hole in this surface.
    def add(px,depth):
        index=len(verts);verts.append(point(px,depth));return index
    middle=add((222,328),.074)
    boundary_extras={}
    for side in (1,-1):
        mirror=lambda p:(222+side*(p[0]-222),p[1])
        B,C,b,c=(1,2,7,8) if side==1 else (5,4,11,10)
        R=add(mirror((260,337)),.067)
        S=add(mirror((271,383)),.103)
        T=add(mirror((289,418)),.070)
        H=add(SHEET["body_shoulders"]["right" if side==1 else "left"],.014)
        boundary_extras[0 if side==1 else 5]=H
        for f in ((0,middle,R),(0,R,H),(H,R,B),(middle,6,R),(6,S,R),(R,S,B),
                  (6,b,S),(S,b,T),(S,T,B),(B,T,b)):
            tri(*f)
        P=add(mirror((286,440)),.075)
        for f in ((B,C,P),(C,c,P),(c,b,P),(b,B,P)):
            tri(*f)
        P=add(mirror((253,505)),.091)
        Q=add(mirror((239,551)),.057)
        K=add(SHEET["body_lower_corners"]["right" if side==1 else "left"],.007)
        boundary_extras[2 if side==1 else 3]=K
        for f in ((C,P,c),(c,P,9),(P,Q,9),(P,C,K),(P,K,Q),(K,3,Q),(3,9,Q)):
            tri(*f)
    # A shallow bevel leads down to a closed, dark indigo backing.
    face_center = sum(lip, Vector())/6
    recess_start=len(verts)
    for p in lip:
        q = face_center+(p-face_center)*.97
        q.y = .084
        verts.append(q)
    for i in range(6):
        a=6+i; b=6+(i+1)%6; c=recess_start+(i+1)%6; d=recess_start+i
        tri(a,b,c,1); tri(a,c,d,1)
    center = len(verts); verts.append(Vector((0,.084,face_center.z)))
    for i in range(6):
        tri(recess_start+i,recess_start+(i+1)%6,center,1)
    # Rear depth follows the top view's pointed diamond section. A central
    # rear keel gives the back a crystal ridge without inventing ornaments.
    rear_start = len(verts)
    for i,p in enumerate(outer):
        verts.append(p.copy() if i in (0,3) else Vector((p.x*.65, -.115, p.z)))
    # Side walls use the same extra boundary corners as the front surface.
    for i in range(6):
        a=i; b=(i+1)%6; c=rear_start+(i+1)%6; d=rear_start+i
        extra=boundary_extras.get(i)
        if extra is None:
            tri(a,b,c);tri(a,c,d)
        else:
            tri(a,extra,d);tri(extra,b,c);tri(extra,c,d)
    rear_center=len(verts); verts.append(Vector((0,-.175,.43)))
    for i in range(6):
        tri(rear_start+i,rear_start+(i+1)%6,rear_center)
    obj = mesh_object("IceSpirit", verts, faces, [ice,face], indices, (0,0,.45))
    bpy.context.view_layer.update()
    shade(obj)
    # Preserve broad flat planes while meeting the sheet's 800–1200 triangle
    # production budget. Subdivision carries the parent facet's corner color.
    bm=bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=2, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data); bm.free()
    return obj

def crown(body):
    """The top is its own object, joined flush as the front drawing shows."""
    crown_mesh=body.data.copy()
    top=bpy.data.objects.new("Crown",crown_mesh)
    bpy.context.scene.collection.objects.link(top)
    top.location=body.location
    for obj, clear_inner, clear_outer in ((body,False,True),(top,True,False)):
        bm=bmesh.new(); bm.from_mesh(obj.data)
        result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=.0000001, plane_co=(0,0,.665-obj.location.z),plane_no=(0,0,1),
            clear_inner=clear_inner,clear_outer=clear_outer)
        edges=[e for e in result["geom_cut"] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
        if edges:
            filled=bmesh.ops.holes_fill(bm,edges=edges,sides=0)
            bmesh.ops.triangulate(bm,faces=filled["faces"])
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data);bm.free()
        for poly in obj.data.polygons:
            poly.use_smooth=False
    delta=Vector((0,0,.73))-top.location
    for v in top.data.vertices:
        v.co -= delta
    top.location+=delta
    return top

def shard(name, coords, ice):
    outline=[point(p,0) for p in coords]
    center=sum(outline,Vector())/4
    upper="Upper" in name
    center.y=-.018 if upper else .035
    depth=.043 if upper else .032
    vertices=[p+Vector((0,center.y,0)) for p in outline]
    vertices.extend([center+Vector((0,depth,0)),center-Vector((0,depth,0))])
    faces=[]
    for i in range(4):
        faces.extend([(i,(i+1)%4,4),((i+1)%4,i,5)])
    obj=mesh_object(name,vertices,faces,[ice])
    bpy.context.view_layer.update();shade(obj)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data);bm.free()
    return obj

def eye(name, px, mat):
    # Thin closed ellipsoids sit 2 mm above the recessed face. Their origins
    # are independent and centered so a later blink can scale local Z.
    center=point(px,.090)
    rx=SHEET["eyes_px"]["width"]*SHEET["meters_per_pixel_x"]/2
    rz=SHEET["eyes_px"]["height"]*SHEET["meters_per_pixel_z"]/2
    verts=[(0,-.004,0)]
    n=14
    for j in range(1,5):
        latitude=-math.pi/2+j*math.pi/5
        for i in range(n):
            a=math.tau*i/n
            verts.append((rx*math.cos(latitude)*math.cos(a),.004*math.sin(latitude),
                          rz*math.cos(latitude)*math.sin(a)))
    end=len(verts);verts.append((0,.004,0))
    faces=[]
    for i in range(n):
        faces.extend([(0,1+(i+1)%n,1+i),(end,1+3*n+i,1+3*n+(i+1)%n)])
    for j in range(3):
        for i in range(n):
            a=1+j*n+i;b=1+j*n+(i+1)%n;c=b+n;d=a+n
            faces.extend([(a,b,c),(a,c,d)])
    obj=mesh_object(name,[Vector(v)+center for v in verts],faces,[mat],pivot=center)
    return obj

bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system="METRIC"
scene.unit_settings.scale_length=1
scene.unit_settings.length_unit="METERS"
ice=material("Ice • faceted vertex palette")
face=material("Face • dark indigo",SHEET["swatches"]["indigo"])
eyes=material("Eyes • cyan emission","#73f4ff",1.7)
body=shell(ice,face)
top=crown(body)
for name,coords in SHEET["shards"].items():
    shard(name,coords,ice)
for name,px in zip(("Eye.L","Eye.R"),SHEET["eyes_px"]["centers"]):
    eye(name,px,eyes)
bpy.context.view_layer.update()
# Match the stated total depth without moving any traced X/Z landmark.
mesh_objects=[o for o in scene.objects if o.type=="MESH"]
points=[o.matrix_world@v.co for o in mesh_objects for v in o.data.vertices]
lo=min(p.y for p in points);hi=max(p.y for p in points)
depth_factor=SHEET["depth_m"]/(hi-lo)
for obj in mesh_objects:
    obj.location.y*=depth_factor
    for v in obj.data.vertices:
        v.co.y*=depth_factor
    obj["role"]="eye" if obj.name.startswith("Eye") else "crystal"
    for poly in obj.data.polygons:
        poly.use_smooth=False
scene["asset"]="Ice Spirit • static reference model"
scene["native_axes"]="meters; Z up; +Y forward; base at world origin"
scene["reference_policy"]="Front landmarks, overall 0.80 x 0.55 x 0.35 m. See sheet.json."
scene["stage"]="Static geometry only. No armature or animation."
bpy.context.view_layer.objects.active=body
body.select_set(True)
bpy.context.preferences.filepaths.save_version=0
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=="VIEW_3D":
            space=area.spaces.active
            space.shading.type="MATERIAL"
            space.region_3d.view_location=(0,0,.4)
            space.region_3d.view_distance=1.45
            space.region_3d.view_rotation=Vector((.35,-1,-.2)).to_track_quat("-Z","Y")
            space.region_3d.view_perspective="ORTHO"
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"ice-spirit.blend"))
print("Saved static Ice Spirit",sum(len(o.data.polygons) for o in mesh_objects),"triangles")
