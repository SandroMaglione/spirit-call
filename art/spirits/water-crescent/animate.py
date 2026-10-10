"""Fluid object clips over the approved crescent Water Spirit geometry.

Native animated source faces -Y for the shared spirit moves. The static
source remains +Y-facing. Eyes follow the core; shells and fins lag it.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import moves

FPS = 30
BODY = "WaterCore"
EYES = ("Eye.L", "Eye.R")
SHELLS = ("Shell.Main", "Shell.Right")
FINS = ("Fin.Upper", "Fin.Tail", "Fin.Lower")
NAMES = (BODY, *SHELLS, *FINS, *EYES)
STYLE = {"lunge": .035, "back": .024, "twist": .55, "roll": .09,
         "hop": .016, "spin": True, "cast": .10}

def prepare():
    objects = {name: bpy.data.objects[name] for name in NAMES}
    bpy.ops.object.select_all(action="DESELECT")
    rotation = Matrix.Rotation(math.pi, 4, "Z")
    for obj in objects.values():
        obj.matrix_world = rotation @ obj.matrix_world
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[BODY]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.view_layer.update()
    body = objects[BODY]
    for name, obj in objects.items():
        if name == BODY:
            continue
        local = body.matrix_world.inverted() @ obj.matrix_world
        obj.parent = body
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = local
    bpy.context.view_layer.update()
    return objects

def loop_pose(t, base, running):
    wave = math.sin(t * math.tau)
    body = base[BODY]["location"]
    poses = {BODY: {
        "location": (body[0], body[1], body[2] + (.030 if running else .022) + .009*wave),
        "rotation_euler": ((.14+.022*wave) if running else .015*math.sin(t*math.tau+.8),
                           .012*math.sin(t*math.tau+.5), .012*wave),
        "scale": (.99,1.055,1.012) if running else (1-.009*wave,1-.009*wave,1+.014*wave),
    }}
    distance = (t-.70)*60
    blink = 0 if running else max(0,1-abs(distance)/(2 if distance<0 else 3))
    for name in EYES:
        poses[name] = {**base[name], "scale": (1,1,1-.92*blink)}
    for index, name in enumerate((*SHELLS,*FINS)):
        x,y,z = base[name]["location"]
        side = -1 if x<0 else 1
        shell = name in SHELLS
        phase = t*math.tau + index*.85 + .6
        sway = .0025 if shell else .007
        poses[name] = {
            "location": (x+side*sway*math.sin(phase),
                         y+(.009 if shell else .025)*running+sway*math.cos(phase),
                         z+sway*math.sin(phase-.8)),
            "rotation_euler": ((-.035 if shell else -.09)*running+.016*math.sin(phase),
                               side*(.018 if shell else .04)*math.sin(phase+.5),
                               side*(.018 if shell else .055)*math.sin(phase)),
            "scale": base[name]["scale"],
        }
    return poses

def combat_pose(clip, frame, base):
    p = moves.at(moves.clips(STYLE)[clip],frame)
    # Preserve the sharp crescents while allowing the round water core to flex.
    for channel in ("wide","deep","tall"):
        p[channel] *= .75
    poses = {}
    for name in NAMES:
        poses[name] = {**base[name], **moves.values(p,name,base,BODY,EYES,())}
        if name == BODY:
            poses[name]["location"] = tuple(Vector(base[name]["location"])+Vector(poses[name]["location"]))
        elif name in SHELLS:
            x,y,z = base[name]["location"]
            side = -1 if x<0 else 1
            poses[name]["location"] = (x+side*.013*p["spread"],y+.012*p["trail"],z+.007*p["spread"])
            poses[name]["rotation_euler"] = (-.035*p["trail"],side*.035*p["spread"],side*.045*p["spread"])
        elif name in FINS:
            side = -1 if base[name]["location"][0]<0 else 1
            poses[name]["rotation_euler"] = (-.12*p["trail"],side*.10*p["spread"],side*.13*p["spread"])
    return poses

def apply_frame(clip, frame, base):
    frames = 60 if clip=="Idle" else 16
    poses = loop_pose(frame/frames,base,clip=="Run") if clip in ("Idle","Run") else combat_pose(clip,frame,base)
    for name,values in poses.items():
        for prop,value in values.items():
            setattr(bpy.data.objects[name],prop,value)
    bpy.context.view_layer.update()
    # The lower detached fin reaches the rest ground line. Check every part,
    # not just the sphere, when the whole assembly leans or lands.
    lowest = min((bpy.data.objects[name].matrix_world@v.co).z
                 for name in NAMES for v in bpy.data.objects[name].data.vertices)
    if lowest < 0:
        x,y,z = poses[BODY]["location"]
        poses[BODY]["location"] = (x,y,z-lowest)
        bpy.data.objects[BODY].location = poses[BODY]["location"]
        bpy.context.view_layer.update()
    return poses

def add_clips():
    objects = prepare()
    base = {name:{"location":tuple(o.location),"rotation_euler":tuple(o.rotation_euler),
                  "scale":tuple(o.scale)} for name,o in objects.items()}
    definitions = {"Idle":60,"Run":16, **{name:keys[-1][0]+1 for name,keys in moves.clips(STYLE).items()}}
    timing = {}
    for clip,frames in definitions.items():
        actions = {}
        for name,obj in objects.items():
            obj.animation_data_create()
            action = bpy.data.actions.new(f"{clip}.{name}")
            obj.animation_data.action = action
            actions[name] = action
        for frame in range(frames):
            poses = apply_frame(clip,frame,base)
            for name,values in poses.items():
                for prop in values:
                    objects[name].keyframe_insert(prop,frame=frame)
        for name,obj in objects.items():
            action = actions[name]
            for slot in action.slots:
                for layer in action.layers:
                    for strip in layer.strips:
                        bag = strip.channelbag(slot)
                        if bag:
                            for curve in bag.fcurves:
                                for key in curve.keyframe_points:
                                    key.interpolation="LINEAR"
            track = obj.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip,0,action)
            track.mute = True
            obj.animation_data.action = None
            for prop,value in base[name].items():
                setattr(obj,prop,value)
        timing[clip] = {"lastKeySeconds":(frames-1)/FPS,
                       "loopSeconds":frames/FPS if clip in ("Idle","Run") else None}
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = 59
    bpy.context.view_layer.update()
    return timing,base
