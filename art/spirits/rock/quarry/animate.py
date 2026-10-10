"""Quarry's diagonal stone run and planted combat, on the accepted geometry."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "tools"))
import moves

FPS = 30
SAMPLES_PER_FRAME = 4
RUN_FRAMES = 24
STANCE = 14 / RUN_FRAMES
STRIDE = .25
LIFT = .10
FEET = ("Stone.Front.L", "Stone.Rear.R", "Stone.Front.R", "Stone.Rear.L")
STYLE = {"lunge": .025, "back": .025, "twist": .20, "roll": .06,
         "hop": 0, "spin": False, "cast": .08}
JOINTS = {}


def articulated_legs(root):
    """A clear inner face and a short stone neck replace sliding intersections."""
    mat = bpy.data.objects["BodyCore"].data.materials[0]
    for name in FEET:
        foot = bpy.data.objects[name]
        side = -1 if name.endswith("L") else 1
        foot.location.x += side*.035
        for v in foot.data.vertices:
            world = foot.location+v.co
            # Preserve the sole and outer facets. The upper inner plane
            # leaves a visible seam; only the neck enters the socket.
            limit = .35 if world.z > .16 else .32
            if side*world.x < limit:
                v.co.x = side*limit-foot.location.x
        y = foot.location.y
        a = Vector((side*.22,y*.73,.315))
        b = Vector((side*.371,y,.315))
        verts,faces = [],[]
        for z,r in ((-.5,.057),(0,.069),(.5,.057)):
            for i in range(8):
                angle = i*math.tau/8
                verts.append((r*math.cos(angle),r*math.sin(angle),z))
        for row in range(2):
            for i in range(8):
                j = row*8+i
                k = row*8+(i+1)%8
                faces.append((j,k,k+8,j+8))
        faces += [tuple(reversed(range(8))),tuple(range(16,24))]
        data = bpy.data.meshes.new(name+".Joint")
        data.from_pydata(verts,[],faces)
        data.update()
        joint = bpy.data.objects.new(name.replace("Stone.","Joint."),data)
        bpy.context.scene.collection.objects.link(joint)
        joint.parent = root
        data.materials.append(mat)
        colors = data.color_attributes.new(name="Color",type="FLOAT_COLOR",domain="CORNER")
        for poly in data.polygons:
            color = (.19,.155,.12,1) if poly.index%3 else (.24,.20,.16,1)
            for index in poly.loop_indices:
                colors.data[index].color = color
        joint.location = (a+b)/2
        joint.rotation_euler = (b-a).to_track_quat("Z","Y").to_euler()
        joint.scale.z = (b-a).length
        JOINTS[name] = {"name":joint.name,"body":a-Vector((0,0,.28)),
                       "leg":b-foot.location}


def matrix(pose):
    return Matrix.LocRotScale(Vector(pose["location"]),Euler(pose["rotation_euler"]).to_quaternion(),Vector(pose["scale"]))


def connect(result):
    body = matrix(result["Torso"])
    for foot,anchors in JOINTS.items():
        a = body @ anchors["body"]
        b = matrix(result[foot]) @ anchors["leg"]
        result[anchors["name"]] = {"location":tuple((a+b)/2),
            "rotation_euler":tuple((b-a).to_track_quat("Z","Y").to_euler()),
            "scale":(1,1,(b-a).length)}


def leg_pose(result,base,objects,name,fwd=0,lift=0,pitch=0,out=0):
    x,y,z = base[name]["location"]
    side = -1 if name.endswith("L") else 1
    rot = Euler((pitch,0,0)).to_matrix()
    bottom = min((rot @ v.co).z for v in objects[name].data.vertices)
    result[name]["location"] = (x+side*out,y-fwd,lift-bottom)
    result[name]["rotation_euler"] = (pitch,0,0)


def combat_legs(clip,frame,result,base,objects,p):
    if clip in ("AttackA","AttackB"):
        active = "Stone.Front.L" if clip == "AttackA" else "Stone.Front.R"
        # A front-leg strike and a rear push drive the torso through contact.
        strength = p["spread"]
        for foot in FEET:
            leg_pose(result,base,objects,foot,
                fwd=.12*strength if foot == active else -.025*strength,
                lift=.09*strength if foot == active else 0,
                pitch=.28*strength if foot == active else 0)
    elif clip in ("AttackC","Power"):
        # All four supports launch together, then unfold into the landing.
        size = 1 if clip == "AttackC" else 1.35
        tuck = max(0,p["up"])/(.15*size)
        for foot in FEET:
            front = ".Front." in foot
            leg_pose(result,base,objects,foot,fwd=p["fwd"]+(.035 if front else -.025)*tuck,
                lift=p["up"]+.035*tuck,pitch=(-.22 if front else .18)*tuck)
    elif clip == "Cast":
        for foot in FEET:
            front = ".Front." in foot
            leg_pose(result,base,objects,foot,fwd=.075*p["spread"] if front else 0,
                lift=.14*p["up"]/.08 if front else 0,
                pitch=-.32*p["up"]/.08 if front else 0,out=.018*p["spread"])
    elif clip == "Ultimate":
        for foot in FEET:
            front = ".Front." in foot
            lift = p["up"]
            # Rear feet push off last during the opening rear-up.
            if frame <= 2 and not front:
                lift = 0
            elif frame < 4 and not front:
                lift *= (frame-2)/2
            leg_pose(result,base,objects,foot,lift=lift,
                pitch=(-.28 if front else .22)*p["up"]/.24,
                out=.028*p["spread"])


def gait(t, name):
    phase = (t + (0 if name in FEET[:2] else .5)) % 1
    if phase <= STANCE:
        return STRIDE * (phase / STANCE - .5), 0, 0
    u = (phase - STANCE) / (1 - STANCE)
    # Flat, linear stance matches world travel; a quick arcing return reads
    # as a step instead of an ornament orbiting around a floating body.
    return (STRIDE * (.5 - moves.ease(u)), LIFT * math.sin(math.pi*u)**2,
            .27 * math.sin(math.tau*u) * math.sin(math.pi*u))


def poses(clip, frame, base, objects, combat):
    result = {name: {p: tuple(v) for p, v in rest.items()} for name, rest in base.items()}
    torso = result["Torso"]
    if clip in ("Run", "Idle"):
        count = RUN_FRAMES if clip == "Run" else 90
        t = frame/count
        wave = math.sin(math.tau*t)
        if clip == "Run":
            torso["location"] = (.007*wave, 0, .28 + .016 + .014*math.cos(2*math.tau*t))
            torso["rotation_euler"] = (.12 + .026*math.sin(2*math.tau*t), .025*wave, -.012*wave)
            for name in FEET:
                stride, lift, pitch = gait(t, name)
                foot = result[name]
                x,y,z = base[name]["location"]
                rotation = Euler((pitch, 0, 0)).to_matrix()
                bottom = min((rotation @ v.co).z for v in objects[name].data.vertices)
                foot["location"] = (x, y+stride, lift-bottom)
                foot["rotation_euler"] = (pitch,0,0)
            float_wave = .014*math.sin(math.tau*t-.9)
        else:
            torso["rotation_euler"] = (.003*wave, .006*wave, 0)
            float_wave = .012*wave
            blink = max(0, 1-abs(t-.72)/.025)
            for name in ("Eye.L", "Eye.R"):
                result[name]["scale"] = (1,1,1-.86*blink)
        x,y,z = base["FloatRock"]["location"]
        result["FloatRock"]["location"] = (x,y,z+float_wave)
        result["FloatRock"]["rotation_euler"] = (.025*wave,.03*math.sin(math.tau*t-.6),.035*wave)
    else:
        p = moves.at(combat[clip], frame)
        # Legs support the leans and push off for the explicit jump poses.
        torso["location"] = (0,-p["fwd"],.28+p["up"])
        torso["rotation_euler"] = (p["pitch"],p["roll"],p["yaw"])
        torso["scale"] = (1+p["wide"]*.5,1+p["deep"]*.45,1+p["tall"]*.5)
        for name in ("Eye.L", "Eye.R"):
            size = 1+.18*p["open"]
            result[name]["scale"] = (size,1,size*(1-.78*p["squint"]))
        x,y,z = base["FloatRock"]["location"]
        result["FloatRock"]["location"] = (x,y+.025*p["trail"],z+.08*p["spread"]+.025*p["trail"])
        result["FloatRock"]["rotation_euler"] = (.1*p["spread"],0,-.1*p["yaw"])
        if clip.startswith("Attack") or clip == "Power":
            strength = p["spread"]
            active = "Cheek.R" if clip in ("AttackB", "Power") else "Cheek.L"
            x,y,z = base[active]["location"]
            result[active]["location"] = (x,y-.035*strength,z+.008*strength)
        combat_legs(clip,frame,result,base,objects,p)
        # Leave a small clearance under the tucked hands during the deepest
        # lean. The four support stones remain planted independently.
        transform = Euler(torso["rotation_euler"]).to_matrix() @ Matrix.Diagonal(Vector(torso["scale"]))
        bottom = min((transform @ (Vector(result[name]["location"])+
            Euler(result[name]["rotation_euler"]).to_matrix() @
            Matrix.Diagonal(Vector(result[name]["scale"])) @ v.co)).z + torso["location"][2]
            for name,obj in objects.items() if obj.type == "MESH" and name not in FEET and not name.startswith("Joint.")
            for v in obj.data.vertices)
        if bottom < .003:
            x,y,z = torso["location"]
            torso["location"] = (x,y,z+.003-bottom)
        body_matrix = matrix(torso)
        cap_matrix = body_matrix @ matrix(result["FloatRock"])
        moss_matrix = body_matrix @ matrix(result["MossCap"])
        gap = min((cap_matrix@v.co).z for v in objects["FloatRock"].data.vertices)-max(
            (moss_matrix@v.co).z for v in objects["MossCap"].data.vertices)
        if gap < .05:
            x,y,z = result["FloatRock"]["location"]
            result["FloatRock"]["location"] = (x,y,z+(.05-gap)/body_matrix[2][2])
    connect(result)
    return result


def build():
    bpy.ops.wm.open_mainfile(filepath=str(HERE/"quarry.blend"))
    root = bpy.data.objects["Quarry"]
    articulated_legs(root)
    torso = bpy.data.objects.new("Torso",None)
    bpy.context.scene.collection.objects.link(torso)
    torso.parent = root
    torso.location = (0,0,.28)
    for obj in list(root.children):
        if obj == torso or obj.name in FEET or obj.name.startswith("Joint."):
            continue
        obj.parent = torso
        obj.location.z -= .28
    objects = {o.name:o for o in root.children if o != torso}
    objects.update({o.name:o for o in torso.children})
    objects["Torso"] = torso
    base = {name:{p:tuple(getattr(obj,p)) for p in ("location","rotation_euler","scale")}
            for name,obj in objects.items()}
    combat = moves.clips(STYLE)
    for clip,side in (("AttackA",1),("AttackB",-1)):
        combat[clip] = [(0,{}),(2,{"fwd":-.035,"pitch":-.12,"yaw":-.22*side,"tall":-.10,"squint":.5}),
            (4,{"fwd":.045,"pitch":.20,"yaw":.18*side,"spread":1,"squint":1}),
            (7,{"pitch":.05,"spread":.3}),(14,{})]
    for clip,size,end in (("AttackC",1,22),("Power",1.35,26)):
        combat[clip] = [(0,{}),(3,{"fwd":-.045,"pitch":-.14,"tall":-.18,"squint":.7}),
            (5,{"fwd":.08*size,"up":.15*size,"pitch":.10,"spread":1,"squint":1}),
            (6,{"fwd":.15*size,"up":.13*size,"pitch":.36,"spread":1.5,"squint":1}),
            (8,{"fwd":.13*size,"up":.09*size,"pitch":.24,"spread":.8}),
            (10,{"fwd":.07*size,"pitch":.14,"tall":-.20,"wide":.08,"spread":.3,"squint":.6}),
            (14,{"pitch":-.06,"tall":.03,"open":.3}),(end,{})]
    combat["Cast"] = [(0,{}),(2,{"pitch":-.25,"up":.08,"open":1,"spread":1.3}),
        (5,{"pitch":-.16,"up":.055,"spread":1}),
        (7,{"pitch":.23,"tall":-.18,"wide":.07,"spread":.6,"squint":.7}),
        (11,{"pitch":-.06,"open":.4,"spread":.3}),(20,{})]
    combat["Ultimate"] = [(0,{}),(2,{"pitch":-.26,"up":.10,"open":1,"spread":1.2}),
        (4,{"pitch":-.16,"up":.24,"spread":2.5,"open":1}),
        (6,{"pitch":.06,"up":.21,"spread":2}),
        (9,{"pitch":.25,"tall":-.24,"wide":.12,"spread":.6,"squint":1}),
        (12,{"pitch":-.10,"tall":.06,"spread":1,"open":1}),
        (18,{"spread":.25}),(28,{})]
    definitions = {"Idle":90,"Run":RUN_FRAMES,**{n:k[-1][0]+1 for n,k in combat.items()}}
    timing = {}
    for clip, frames in definitions.items():
        actions = {}
        for name,obj in objects.items():
            obj.animation_data_create()
            action = bpy.data.actions.new(f"{clip}.{name}")
            obj.animation_data.action = action
            actions[name] = action
        samples = frames*SAMPLES_PER_FRAME if clip in ("Idle","Run") else (frames-1)*SAMPLES_PER_FRAME+1
        for sample in range(samples):
            values = poses(clip,sample/SAMPLES_PER_FRAME,base,objects,combat)
            for name,obj in objects.items():
                for prop,value in values[name].items():
                    setattr(obj,prop,value)
                    obj.keyframe_insert(prop,frame=sample)
        for name,obj in objects.items():
            for curve in actions[name].fcurves:
                for key in curve.keyframe_points:
                    key.interpolation = "LINEAR"
            track = obj.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip,0,actions[name])
            track.mute = True
            obj.animation_data.action = None
            for prop,value in base[name].items():
                setattr(obj,prop,value)
        timing[clip] = {"lastKeySeconds":(samples-1)/(FPS*SAMPLES_PER_FRAME),
                       "loopSeconds":frames/FPS if clip in ("Idle","Run") else None}
    scene = bpy.context.scene
    scene.render.fps = FPS*SAMPLES_PER_FRAME
    scene.frame_start = 0
    scene.frame_end = 90*SAMPLES_PER_FRAME-1
    scene.frame_set(0)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"quarry-animated.blend"))
    out = HERE/"quarry-animated.glb"
    bpy.ops.export_scene.gltf(filepath=str(out),export_format="GLB",export_apply=True,
        export_vertex_color="ACTIVE",export_animations=True,export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,export_cameras=False,export_lights=False)
    audit = json.loads((HERE/"audit.json").read_text())
    triangles = sum(len(p.vertices)-2 for obj in objects.values() if obj.type == "MESH" for p in obj.data.polygons)
    meshes = [obj for obj in objects.values() if obj.type == "MESH"]
    vertices = [obj.matrix_world@v.co for obj in meshes for v in obj.data.vertices]
    bounds = [[min(v[axis] for v in vertices),max(v[axis] for v in vertices)] for axis in range(3)]
    metadata = {**audit,"status":"animated review export","clips":timing,
        "triangles":triangles,"parts":17,"articulatedLegs":True,
        "animations":len(timing),"objects":sorted(obj.name for obj in meshes),
        "part_triangles":{obj.name:sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in meshes},
        "bounds_blender_m":bounds,"width_m":bounds[0][1]-bounds[0][0],
        "closed_meshes":{**audit["closed_meshes"],**{data["name"]:True for data in JOINTS.values()}},
        "sampleRateHz":FPS*SAMPLES_PER_FRAME,
        "jointAnchors":{foot:{"name":data["name"],"body":list(data["body"]),"leg":list(data["leg"])} for foot,data in JOINTS.items()},
        "airborneWindows":{"AttackC":[3/FPS,10/FPS],"Power":[3/FPS,10/FPS],"Ultimate":[2/FPS,9/FPS]},
        "impactSeconds":{"Cast":7/FPS,"Ultimate":9/FPS},
        "contactSeconds":{n:f/FPS for n,f in moves.CONTACT.items()},
        "gait":{"cycleSeconds":RUN_FRAMES/FPS,"stanceFraction":STANCE,
                "strideMeters":STRIDE,"liftMeters":LIFT,
                "travelMetersPerSecond":STRIDE/(STANCE*RUN_FRAMES/FPS),
                "diagonalPairs":[list(FEET[:2]),list(FEET[2:])]},
        "static_source_sha256":hashlib.sha256((HERE/"quarry.blend").read_bytes()).hexdigest(),
        "animated_glb_sha256":hashlib.sha256(out.read_bytes()).hexdigest(),
        "bytes":out.stat().st_size}
    (HERE/"animation.json").write_text(json.dumps(metadata,indent=2)+"\n")
    import export
    export.write_spec()
    print(json.dumps({"clips":timing,"gait":metadata["gait"],"bytes":metadata["bytes"]}))


if __name__ == "__main__":
    build()
