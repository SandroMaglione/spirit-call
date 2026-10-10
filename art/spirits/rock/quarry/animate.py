"""Quarry's diagonal stone run and planted combat, on the accepted geometry."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "tools"))
import moves

FPS = 30
RUN_FRAMES = 24
STANCE = 14 / RUN_FRAMES
STRIDE = .25
LIFT = .10
FEET = ("Stone.Front.L", "Stone.Rear.R", "Stone.Front.R", "Stone.Rear.L")
STYLE = {"lunge": .025, "back": .025, "twist": .20, "roll": .06,
         "hop": 0, "spin": False, "cast": .08}


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
        # The broad stones carry the weight. Torso poses recoil over them;
        # the cap stone responds, but the whole character never levitates.
        torso["location"] = (0,-p["fwd"],.28)
        torso["rotation_euler"] = (p["pitch"]*.55,p["roll"],p["yaw"])
        torso["scale"] = (1+p["wide"]*.5,1+p["deep"]*.45,1+p["tall"]*.5)
        for name in ("Eye.L", "Eye.R"):
            size = 1+.18*p["open"]
            result[name]["scale"] = (size,1,size*(1-.78*p["squint"]))
        x,y,z = base["FloatRock"]["location"]
        result["FloatRock"]["location"] = (x,y+.025*p["trail"],z+.032*p["spread"])
        result["FloatRock"]["rotation_euler"] = (.1*p["spread"],0,-.1*p["yaw"])
        if clip.startswith("Attack") or clip == "Power":
            strength = p["spread"]
            active = "Cheek.R" if clip in ("AttackB", "Power") else "Cheek.L"
            x,y,z = base[active]["location"]
            result[active]["location"] = (x,y-.035*strength,z+.008*strength)
        # Leave a small clearance under the tucked hands during the deepest
        # lean. The four support stones remain planted independently.
        transform = Euler(torso["rotation_euler"]).to_matrix() @ Matrix.Diagonal(Vector(torso["scale"]))
        bottom = min((transform @ (Vector(result[name]["location"])+
            Euler(result[name]["rotation_euler"]).to_matrix() @
            Matrix.Diagonal(Vector(result[name]["scale"])) @ v.co)).z + .28
            for name,obj in objects.items() if obj.type == "MESH" and name not in FEET
            for v in obj.data.vertices)
        if bottom < .003:
            x,y,z = torso["location"]
            torso["location"] = (x,y,z+.003-bottom)
    return result


def build():
    bpy.ops.wm.open_mainfile(filepath=str(HERE/"quarry.blend"))
    root = bpy.data.objects["Quarry"]
    torso = bpy.data.objects.new("Torso",None)
    bpy.context.scene.collection.objects.link(torso)
    torso.parent = root
    torso.location = (0,0,.28)
    for obj in list(root.children):
        if obj == torso or obj.name in FEET:
            continue
        obj.parent = torso
        obj.location.z -= .28
    objects = {o.name:o for o in root.children if o != torso}
    objects.update({o.name:o for o in torso.children})
    objects["Torso"] = torso
    base = {name:{p:tuple(getattr(obj,p)) for p in ("location","rotation_euler","scale")}
            for name,obj in objects.items()}
    combat = moves.clips(STYLE)
    combat["Cast"] = [(0,{}),(2,{"pitch":-.08,"open":1,"spread":2.4}),
                      (6,{"pitch":.04,"tall":-.08,"spread":1}),(14,{})]
    combat["Ultimate"] = [(0,{}),(2,{"pitch":.15,"tall":-.18,"wide":.08,"squint":.6,"spread":2.8}),
                          (6,{"pitch":-.07,"tall":.04,"open":1,"spread":1.8}),
                          (12,{"spread":.4}),(20,{})]
    definitions = {"Idle":90,"Run":RUN_FRAMES,**{n:k[-1][0]+1 for n,k in combat.items()}}
    timing = {}
    for clip, frames in definitions.items():
        actions = {}
        for name,obj in objects.items():
            obj.animation_data_create()
            action = bpy.data.actions.new(f"{clip}.{name}")
            obj.animation_data.action = action
            actions[name] = action
        for frame in range(frames):
            values = poses(clip,frame,base,objects,combat)
            for name,obj in objects.items():
                for prop,value in values[name].items():
                    setattr(obj,prop,value)
                    obj.keyframe_insert(prop,frame=frame)
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
        timing[clip] = {"lastKeySeconds":(frames-1)/FPS,
                       "loopSeconds":frames/FPS if clip in ("Idle","Run") else None}
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = 89
    scene.frame_set(0)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"quarry-animated.blend"))
    out = HERE/"quarry-animated.glb"
    bpy.ops.export_scene.gltf(filepath=str(out),export_format="GLB",export_apply=True,
        export_vertex_color="ACTIVE",export_animations=True,export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,export_cameras=False,export_lights=False)
    audit = json.loads((HERE/"audit.json").read_text())
    metadata = {**audit,"status":"animated review export","clips":timing,
        "contactSeconds":{n:f/FPS for n,f in moves.CONTACT.items()},
        "gait":{"cycleSeconds":RUN_FRAMES/FPS,"stanceFraction":STANCE,
                "strideMeters":STRIDE,"liftMeters":LIFT,
                "travelMetersPerSecond":STRIDE/(STANCE*RUN_FRAMES/FPS),
                "diagonalPairs":[list(FEET[:2]),list(FEET[2:])]},
        "static_source_sha256":hashlib.sha256((HERE/"quarry.blend").read_bytes()).hexdigest(),
        "animated_glb_sha256":hashlib.sha256(out.read_bytes()).hexdigest(),
        "bytes":out.stat().st_size}
    (HERE/"animation.json").write_text(json.dumps(metadata,indent=2)+"\n")
    print(json.dumps({"clips":timing,"gait":metadata["gait"],"bytes":metadata["bytes"]}))


if __name__ == "__main__":
    build()
