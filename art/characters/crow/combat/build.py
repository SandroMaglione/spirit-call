"""Author the armed crow study without modifying either earlier Blender source.

blender --background --python-exit-code 1 --python art/characters/crow/combat/build.py
"""
import importlib.util
import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector, Euler

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
spec = importlib.util.spec_from_file_location("old_export", ROOT / "export/export-glb.py")
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
FPS = 30


def material(name, color, metal=0, rough=0.65):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = rough
    return mat


def mesh(name, vertices, faces, mat, collection):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    bm=bmesh.new();bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data);bm.free()
    data.materials.append(mat)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    return obj


def prism(name, outline, depth, mat, collection):
    n = len(outline)
    vertices = [(x, y, z) for y in [-depth / 2, depth / 2] for x, z in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return mesh(name, vertices, faces, mat, collection)


def build_weapons():
    steel = material("Blade | pale steel", (0.49, 0.60, 0.66), 0.65, 0.35)
    edge = material("Edge | silver", (0.79, 0.87, 0.89), 0.7, 0.28)
    leather = material("Grip | oxblood", (0.105, 0.036, 0.035))
    brass = material("Guard | worn brass", (0.45, 0.27, 0.095), 0.65, 0.4)
    dark = material("Guard | gunmetal", (0.085, 0.115, 0.13), 0.55, 0.45)
    blue = material("Crescendo | blue steel", (0.14, 0.30, 0.40), 0.65, 0.32)
    result = {}
    for name in ["trainingBlade", "crescendo"]:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
        root = bpy.data.objects.new(name, None)
        col.objects.link(root)
        ornate = name == "crescendo"
        # Center ridge and beveled edges, a closed blade rather than a flat card.
        rings = [(0.20, 0.0, 0.105), (0.34, 0.0, 0.12), (0.98, 0.0, 0.085)]
        if ornate:
            rings = [(0.20, 0.0, 0.095), (0.36, 0.015, 0.125), (0.75, 0.095, 0.125), (1.02, 0.20, 0.08)]
        verts = []
        for z, x, width in rings:
            verts.extend([(x-width, 0, z), (x, -0.032, z), (x+width, 0, z), (x, 0.032, z)])
        verts.append((0.28 if ornate else 0, 0, 1.18))
        faces = [(3, 2, 1, 0)]
        for k in range(len(rings)-1):
            for i in range(4):
                faces.append((k*4+i, k*4+(i+1)%4, (k+1)*4+(i+1)%4, (k+1)*4+i))
        for i in range(4):
            faces.append(((len(rings)-1)*4+i, (len(rings)-1)*4+(i+1)%4, len(verts)-1))
        blade = mesh(name+" | blade", verts, faces, blue if ornate else steel, col)
        blade.data.materials.append(edge)
        for face in blade.data.polygons:
            face.material_index = 1 if face.index % 4 in (1, 2) else 0
        guard = [(-.23,.15),(-.23,.21),(-.08,.24),(.08,.24),(.23,.21),(.23,.15),(.07,.18),(-.07,.18)]
        if ornate:
            guard = [(-.29,.12),(-.25,.23),(-.10,.29),(.06,.24),(.28,.13),(.32,.02),(.25,.05),(.05,.17),(-.10,.21),(-.23,.16)]
        prism(name+" | guard", guard, .085, brass if ornate else dark, col)
        prism(name+" | handle", [(-.045,-.13),(.045,-.13),(.052,.18),(-.052,.18)], .072, leather, col)
        prism(name+" | pommel", [(-.075,-.13),(-.065,-.20),(0,-.245),(.065,-.20),(.075,-.13)], .09, brass if ornate else dark, col)
        for z in [-.08, -.015, .05, .115]:
            prism(name+" | grip binding", [(-.05,z),(.05,z+.025),(.05,z+.036),(-.05,z+.011)], .081, brass if ornate else dark, col)
        for obj in list(col.objects):
            if obj != root:
                obj.parent = root
        for marker, z in [("blade_base", .23), ("blade_tip", 1.18)]:
            obj = bpy.data.objects.new(name+"_"+marker, None)
            col.objects.link(obj)
            obj.parent = root
            obj.location = ((.28 if ornate else 0) if marker == "blade_tip" else 0, 0, z)
        result[name] = (col, root)
    return result


bpy.ops.wm.open_mainfile(filepath=str(ROOT / "crow-animated.blend"))
scene = bpy.context.scene
scene.render.fps = FPS
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
collection = bpy.data.collections["CROW | editable character"]
rig = next(o for o in collection.objects if o.type == "ARMATURE")
root = bpy.data.objects["Crow | model root"]
meshes = [o for o in collection.objects if o.type == "MESH"]
rig.animation_data_clear()
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
for p in rig.pose.bones:
    p.matrix_basis.identity()
rig.name = "Crow combat rig"
rig.data.pose_position = "REST"
bpy.context.view_layer.update()
ground = old.bounds(meshes)[0][2]
for obj in meshes:
    for v in obj.data.vertices:
        v.co.z -= ground
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for b in rig.data.edit_bones:
    b.head.z -= ground
    b.tail.z -= ground


def bone(name, head, tail, parent):
    b = rig.data.edit_bones.new(name)
    b.head, b.tail = head, tail
    b.parent = rig.data.edit_bones[parent]
    return b


bone("pelvis", (0,0,.47-ground), (0,0,.80-ground), "root")
rig.data.edit_bones["body"].parent = rig.data.edit_bones["pelvis"]
for side, label in [(-1,"L"),(1,"R")]:
    wing = rig.data.edit_bones[f"wing.{label}"]
    wing.tail = (side*.48, -.04, .98-ground)
    bone(f"forewing.{label}", wing.tail, (side*.65,-.06,.55-ground), f"wing.{label}")
    bone(f"wrist.{label}", (side*.65,-.06,.55-ground), (side*.65,-.06,.48-ground), f"forewing.{label}")
    bone(f"toe.{label}", (side*.225,-.12,.075-ground), (side*.225,-.30,.075-ground), f"foot.{label}")
    rig.data.edit_bones[f"thigh.{label}"].parent = rig.data.edit_bones["pelvis"]
bone("weapon_grip", (.65,-.06,.48-ground), (.65,-.06,.63-ground), "wrist.R")
bpy.ops.object.mode_set(mode="OBJECT")
rig.data.pose_position = "POSE"

# The original folded wing had no elbow topology. Give the combat wing a
# narrow joint and a tapered feather fan so it can bend without folding a slab.
wing_material = bpy.data.materials["Wings | charcoal"]
for label,side in [("L",-1),("R",1)]:
    for obj in list(meshes):
        if obj.name.startswith(f"Wing {label}"):
            meshes.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
    sections=[(.29,1.49,.10,.09),(.32,1.38,.145,.115),(.40,1.20,.13,.105),
              (.475,1.02,.09,.08),(.49,.96,.085,.075),(.55,.82,.14,.10),
              (.60,.68,.165,.095),(.65,.53,.12,.065),(.66,.43,.055,.03)]
    vertices=[];faces=[];segments=12
    for x,z,width,depth in sections:
        for i in range(segments):
            angle=math.tau*i/segments
            vertices.append((side*(x+width*math.cos(angle)),-.045+depth*math.sin(angle),z-ground))
    faces.append(tuple(reversed(range(segments))))
    for k in range(len(sections)-1):
        for i in range(segments):
            faces.append((k*segments+i,k*segments+(i+1)%segments,(k+1)*segments+(i+1)%segments,(k+1)*segments+i))
    faces.append(tuple(range((len(sections)-1)*segments,len(sections)*segments)))
    obj=mesh(f"Wing {label} | articulated",vertices,faces,wing_material,collection)
    obj.parent=root;obj.modifiers.new("Crow skin","ARMATURE").object=rig
    for polygon in obj.data.polygons:polygon.use_smooth=True
    meshes.append(obj)

for obj in meshes:
    obj.vertex_groups.clear()
    groups = {b.name: obj.vertex_groups.new(name=b.name) for b in rig.data.bones}
    for v in obj.data.vertices:
        z = v.co.z + ground
        if obj.name.startswith("Body"):
            head = max(0,min(1,(z-1.15)/.5))
            hip = max(0,min(1,(.90-z)/.35))
            w = {"head":head,"body":(1-head)*(1-hip),"pelvis":(1-head)*hip}
        elif obj.name.startswith("Wing"):
            label = obj.name.split()[1]
            fore = max(0,min(1,(1.06-z)/.16))
            w = {f"wing.{label}":1-fore,f"forewing.{label}":fore}
        elif obj.name.startswith("Leg"):
            label=obj.name.split()[1]; thigh=max(0,min(1,(z-.20)/.10))
            w={f"thigh.{label}":thigh,f"shin.{label}":1-thigh}
        elif obj.name.startswith("Foot"):
            label=obj.name.split()[1]
            toe=max(0,min(1,(-v.co.y-.11)/.08)) if "rear" not in obj.name else 0
            w={f"foot.{label}":1-toe,f"toe.{label}":toe}
        elif obj.name.startswith("Tail"):
            w={"tail":1}
        else:
            w={"head":1}
        for name,weight in w.items():
            if weight>0: groups[name].add([v.index],weight,"REPLACE")

# A small feathered clasp closes around the grip, weighted to the socket.
mat = bpy.data.materials["Wings | charcoal"]
for i in range(3):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, location=(.65 + (i-1)*.036,-.085,.49-ground))
    obj=bpy.context.object; obj.name=f"Grip feather {i+1}"
    for col in list(obj.users_collection): col.objects.unlink(obj)
    collection.objects.link(obj);obj.parent=root
    obj.scale=(.032,.075,.085)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obj.data.materials.append(mat)
    group=obj.vertex_groups.new(name="weapon_grip")
    group.add(list(range(len(obj.data.vertices))),1,"REPLACE")
    obj.modifiers.new("Crow skin","ARMATURE").object=rig
    meshes.append(obj)


def pose(name, translation=(0,0,0), angles=(0,0,0)):
    p=rig.pose.bones[name]; basis=rig.data.bones[name].matrix_local.to_3x3()
    p.location=basis.inverted()@Vector(translation)
    p.rotation_mode="QUATERNION"
    p.rotation_quaternion=basis.to_quaternion().inverted()@Euler(angles).to_quaternion()@basis.to_quaternion()
    p.scale=(1,1,1)


def align(name, head, direction, guide):
    y=Vector(direction).normalized()
    x=Vector(guide)-y*Vector(guide).dot(y)
    if x.length<.01: x=Vector((0,0,1)).cross(y)
    x.normalize();z=x.cross(y).normalized()
    matrix=Matrix((x,y,z)).transposed().to_4x4();matrix.translation=head
    rig.pose.bones[name].matrix=matrix
    bpy.context.view_layer.update()


def arm(label, hand, direction, spin=0):
    rotation=Matrix.Rotation(spin,3,"Z")
    hand=rotation@Vector(hand);direction=(rotation@Vector(direction)).normalized()
    shoulder=rig.pose.bones[f"body"].matrix @ rig.data.bones["body"].matrix_local.inverted() @ rig.data.bones[f"wing.{label}"].head_local
    wrist=hand-direction*.07
    offset=wrist-shoulder
    upper=rig.data.bones[f"wing.{label}"].length; lower=rig.data.bones[f"forewing.{label}"].length
    distance=min(offset.length,upper+lower-.008)
    wrist=shoulder+offset.normalized()*distance;hand=wrist+direction*.07
    axis=(wrist-shoulder).normalized()
    guide=rotation@Vector((1 if label=="R" else -1,.4,0))
    bend=guide-axis*guide.dot(axis)
    if bend.length<.01:bend=Vector((0,1,0))
    bend.normalize()
    along=(upper*upper-lower*lower+distance*distance)/(2*distance)
    elbow=shoulder+axis*along+bend*math.sqrt(max(0,upper*upper-along*along))
    roll=rotation@Vector((1,0,0))
    align(f"wing.{label}",shoulder,elbow-shoulder,roll)
    align(f"forewing.{label}",elbow,wrist-elbow,roll)
    align(f"wrist.{label}",wrist,direction,roll)
    if label=="R":align("weapon_grip",hand,direction,roll)


def sword_direction(yaw,pitch):
    return (math.sin(yaw)*math.cos(pitch),-math.cos(yaw)*math.cos(pitch),math.sin(pitch))


GUARD=dict(hip=(0,0,-.015),twist=0,lean=.04,hand=(.68,-.30,.92),yaw=1.05,pitch=.50,left=(-.58,-.02,.67),feet=(0,0,0,0),spin=0)

foot_meshes={label:[o for o in meshes if o.name.startswith(f"Foot {label}")] for label in ["L","R"]}


def stance(s):
    for name in rig.pose.bones.keys():pose(name)
    spin=s.get("spin",0); twist=s.get("twist",0);lean=s.get("lean",0)
    pose("pelvis",s.get("hip",(0,0,0)),angles=(lean*.35,0,spin+twist*.4))
    pose("body",angles=(lean*.65,0,twist*.6))
    pose("head",angles=(-lean*.55,0,-twist*.6))
    pose("tail",angles=(-lean*.45,0,-twist*.25))
    rotation=Matrix.Rotation(spin,3,"Z")
    feet=s.get("feet",(0,0,0,0))
    for index,label in enumerate(["L","R"]):
        original=rig.data.bones[f"foot.{label}"].head_local
        target=rotation@(original+Vector((0,feet[index*2],feet[index*2+1])))
        pose(f"foot.{label}",target-original,angles=(s.get("roll"+label,0),0,spin+s.get("pivot"+label,0)))
        pose(f"toe.{label}",angles=(-s.get("roll"+label,0)*.8,0,0))
    bpy.context.view_layer.update()
    # Roll around planted toes rather than allowing the heel/toe to enter the floor.
    for label in ["L","R"]:
        lowest=old.bounds(foot_meshes[label])[0][2]
        if lowest<0:
            basis=rig.data.bones[f"foot.{label}"].matrix_local.to_3x3()
            rig.pose.bones[f"foot.{label}"].location+=basis.inverted()@Vector((0,0,-lowest))
            bpy.context.view_layer.update()
    arm("R",s["hand"],sword_direction(s["yaw"],s["pitch"]),spin)
    arm("L",s["left"],(0,0,-1),spin)


def mix(a,b,t):
    out={}
    for key in GUARD.keys() | a.keys() | b.keys():
        av=a.get(key,GUARD.get(key,0));bv=b.get(key,GUARD.get(key,0))
        out[key]=tuple(x+(y-x)*t for x,y in zip(av,bv)) if isinstance(av,tuple) else av+(bv-av)*t
    return out


def idle(phase):
    s=dict(GUARD);breath=math.sin(phase*math.tau)
    s.update(hip=(.012*breath,0,-.015+.025*breath),lean=.04+.025*breath,
             hand=(.68,-.30,.92+.02*breath),pitch=.50+.04*breath,left=(-.58,-.02,.67+.025*breath))
    return s


def run(phase):
    phase%=1
    feet=[];rolls={}
    for offset,label in [(0,"L"),(.5,"R")]:
        cycle=(phase+offset)%1
        if cycle<.38:
            t=cycle/.38;y=-.30+.66*t;z=0
            roll=.35*max(0,(t-.62)/.38)
        else:
            t=(cycle-.38)/.62;y=.36-.66*(t*t*(3-2*t));z=.28*math.sin(math.pi*t)**2
            roll=.20*math.sin(math.pi*t)
        feet.extend([y,z]);rolls["roll"+label]=roll
    pulse=math.cos(phase*math.tau*2+.7)
    s=dict(GUARD)
    s.update(hip=(.028*math.sin(phase*math.tau),-.09,-.065+.075*pulse),
             lean=.64+.085*pulse,twist=.08*math.sin(phase*math.tau),
             hand=(.63,.16,.89+.025*math.sin(phase*math.tau)),yaw=2.35,pitch=.05,
             left=(-.57,.15+.14*math.sin(phase*math.tau),.90),feet=tuple(feet),**rolls)
    return s


# Pose-to-pose choreography: load, rapid strike, overshoot, then prepare the next hit.
KEYS=[
 (1,GUARD),
 (7,dict(hip=(.06,.06,-.13),twist=.62,lean=-.08,hand=(.64,.14,1.56),yaw=2.0,pitch=.70,left=(-.57,-.13,.95),feet=(.10,0,-.10,0))),
 (10,dict(hip=(-.06,-.10,-.07),twist=-.62,lean=.23,hand=(.04,-.65,.95),yaw=-1.05,pitch=-.24,left=(-.70,.18,1.04),feet=(-.16,0,.10,.03))),
 (14,dict(hip=(-.05,-.06,-.08),twist=-.72,lean=.18,hand=(-.18,-.48,.83),yaw=-1.65,pitch=-.24,left=(-.71,.17,1.0),feet=(-.16,0,.08,0))),
 (18,dict(hip=(-.06,.02,-.14),twist=-.75,lean=.11,hand=(-.10,-.35,.75),yaw=-1.7,pitch=-.12,left=(-.67,.05,.92),feet=(-.1,0,.08,0))),
 (21,dict(hip=(.06,-.09,-.025),twist=.65,lean=.18,hand=(.72,-.42,1.35),yaw=1.28,pitch=.65,left=(-.57,.21,.9),feet=(.03,.025,-.16,0))),
 (25,dict(hip=(.06,-.02,-.02),twist=.66,lean=.08,hand=(.74,-.20,1.46),yaw=1.6,pitch=.75,left=(-.57,.21,.9),feet=(.03,0,-.16,0))),
 (30,dict(hip=(.02,.08,-.14),twist=.40,lean=-.05,hand=(.40,-.04,1.02),yaw=.02,pitch=.04,left=(-.42,-.18,1.00),feet=(-.08,0,.16,0))),
 (33,dict(hip=(0,-.16,-.05),twist=-.22,lean=.30,hand=(.22,-.92,1.05),yaw=0,pitch=.04,left=(-.64,.20,1.03),feet=(-.24,0,.16,.06))),
 (38,dict(hip=(0,-.06,-.07),twist=-.15,lean=.18,hand=(.31,-.70,1.02),yaw=.1,pitch=.02,left=(-.61,.18,1.0),feet=(-.19,0,.12,0))),
 (44,dict(hip=(.02,.02,-.18),twist=.65,lean=.04,hand=(.62,.10,1.0),yaw=2.2,pitch=.08,left=(-.43,-.19,.95),feet=(-.08,0,.08,0))),
 (48,dict(hip=(0,0,-.03),twist=.35,lean=.16,hand=(.89,-.16,1.13),yaw=1.4,pitch=.04,left=(-.72,0,1.12),feet=(0,.10,0,.04),spin=-2.4)),
 (52,dict(hip=(0,0,.04),twist=.1,lean=.12,hand=(.90,-.18,1.12),yaw=1.35,pitch=.07,left=(-.73,0,1.10),feet=(0,.15,0,.14),spin=-4.8)),
 (56,dict(hip=(0,-.05,-.16),twist=-.55,lean=.22,hand=(.16,-.62,.84),yaw=-1.2,pitch=-.18,left=(-.68,.16,.93),feet=(-.10,0,.08,0),spin=-math.tau)),
 (61,dict(hip=(0,-.02,-.09),twist=-.35,lean=.12,hand=(.30,-.48,.84),yaw=-.70,pitch=-.05,left=(-.61,.1,.82),feet=(-.04,0,.03,0),spin=-math.tau)),
 (67,{**GUARD,"spin":-math.tau}),
]


def combo(frame):
    a,b=next((a,b) for a,b in zip(KEYS,KEYS[1:]) if a[0]<=frame<=b[0])
    t=(frame-a[0])/(b[0]-a[0])
    # The dense bake preserves these intentional accelerations in glTF.
    t=t*t*(3-2*t)
    return mix(a[1],b[1],t)


clips={"Idle":(60,True,lambda f:idle((f-1)/60)),
       "Run":(16,True,lambda f:run((f-1)/16)),
       "AttackCombo":(67,False,combo),
       "RunStart":(9,False,lambda f:mix(GUARD,run(0),((f-1)/8)**.65)),
       "RunStop":(10,False,lambda f:mix(run(0),GUARD,(f-1)/9))}
for hit,frame in enumerate([14,25,38],1):
    clips[f"Recover{hit}"]=(10,False,lambda f,frame=frame:mix(combo(frame),GUARD,((f-1)/9)**.7))

rig.animation_data_create()
for name,(frames,loop,evaluate) in clips.items():
    action=bpy.data.actions.new(name);action.use_fake_user=True
    rig.animation_data.action=action
    for frame in range(1,frames+2 if loop else frames+1):
        stance(evaluate(frame))
        for p in rig.pose.bones:
            p.keyframe_insert("location",frame=frame,group=p.name)
            p.keyframe_insert("rotation_quaternion",frame=frame,group=p.name)
            p.keyframe_insert("scale",frame=frame,group=p.name)
    for curve in old.curves(action):
        for key in curve.keyframe_points:key.interpolation="LINEAR"
    action.use_frame_range=True;action.frame_start=1;action.frame_end=frames

weapons=build_weapons()
# The editable scene includes one attached sword, while runtime exports stay modular.
training=weapons["trainingBlade"][1]
rig.animation_data.action=bpy.data.actions["Idle"];scene.frame_set(1)
training.parent=rig;training.parent_type="BONE";training.parent_bone="weapon_grip"
training.matrix_world=rig.matrix_world@rig.pose.bones["weapon_grip"].matrix@Matrix.Rotation(-math.pi/2,4,"X")
bpy.context.view_layer.update()
grip_world=rig.matrix_world@rig.pose.bones["weapon_grip"].matrix
assert (training.matrix_world.translation-grip_world.translation).length<1e-5
assert (training.matrix_world.to_3x3()@Vector((0,0,1))).normalized().dot((grip_world.to_3x3()@Vector((0,1,0))).normalized())>.9999
weapons["crescendo"][1].location=(3,0,0)
scene.frame_start,scene.frame_end=1,67
root["scope"]="Armed crow v2; independent weapons; four-hit combo; root displacement supplied by game."
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/"crow-combat.blend"))

metadata={"schema_version":2,"fps":FPS,"height_meters":2.19648814201355,
          "up":"+Y","forward":"+Z","root_motion":False,"grip":"weapon_grip",
          "weapon_axis":"+Y along blade; +Z blade face; origin at handle center",
          "run_stride_meters":1.74,
          "clips":{name:{"frames":[1,n],"samples":n,"last_key_seconds":(n-1)/FPS,
                         "loop_seconds":n/FPS if loop else None,"duration_seconds":(n if loop else n-1)/FPS}
                   for name,(n,loop,_) in clips.items()},
          "combo":[{"name":name,"start":(start-1)/FPS,"end":(end-1)/FPS,
                     "active":[(hit-1)/FPS,(hit+1)/FPS],"recover":recover}
                   for name,start,end,hit,recover in [("Opening cut",1,14,10,"Recover1"),("Rising backhand",14,25,21,"Recover2"),
                                                     ("Driving thrust",25,38,33,"Recover3"),("Spinning finisher",38,67,52,None)]],
          "weapons":{"trainingBlade":{"file":"training-blade.glb","label":"Training Blade"},
                     "crescendo":{"file":"crescendo.glb","label":"Crescendo"}}}
(HERE/"model-info.json").write_text(json.dumps(metadata,indent=2)+"\n")
print("COMBAT_AUTHORED",len(rig.data.bones),"bones",list(clips))
