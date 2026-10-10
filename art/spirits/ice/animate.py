"""Ice Spirit's object clips: steady hover, gliding, and sharp crystal strikes.

The accepted +Y-facing static source is untouched. The animated scene uses
the spirits' standard Blender -Y forward convention, then exports to +Z.
The joined crown and recessed eyes follow the body; detached shards lag it.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import moves

FPS = 30
BODY = "IceSpirit"
EYES = ("Eye.L", "Eye.R")
SHARDS = ("Shard.Upper.L", "Shard.Upper.R", "Shard.Lower.L", "Shard.Lower.R")
NAMES = (BODY, "Crown", *SHARDS, *EYES)
STYLE = {"lunge": .028, "back": .026, "twist": .44, "roll": .065,
         "hop": .012, "spin": False, "cast": .08}

def prepare():
    """Orient the approved meshes, then keep all pieces relative to the body."""
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
    poses = {
        BODY: {
            "location": (body[0], body[1], body[2] + (.034 if running else .026) + .008 * wave),
            "rotation_euler": ((.16 + .025*wave) if running else .012*math.sin(t*math.tau+.8),
                               .012*math.sin(t*math.tau+.5), 0),
            "scale": ((.988,1.045,1.012) if running else (1-.006*wave,1-.006*wave,1+.009*wave)),
        },
        "Crown": base["Crown"].copy(),
    }
    # A brief, mirrored blink every two seconds. Running keeps the eyes open.
    distance = (t-.70)*60
    blink = 0 if running else max(0,1-abs(distance)/(2 if distance<0 else 3))
    for name in EYES:
        poses[name] = {**base[name], "scale": (1,1,1-.92*blink)}
    for index, name in enumerate(SHARDS):
        x,y,z = base[name]["location"]
        side = -1 if x<0 else 1
        phase = t*math.tau + (.85 if side<0 else -.85) + (1.2 if "Lower" in name else 0)
        poses[name] = {
            "location": (x+side*(.008 if running else .003)*(1+math.sin(phase)),
                         y+(.026 if running else .003*math.cos(phase)),z+.009*math.sin(phase)),
            "rotation_euler": ((-.09 if running else .02)*math.sin(phase),
                               side*.04*math.sin(phase+.5),side*.025*math.sin(phase)),
            "scale": base[name]["scale"],
        }
    return poses

def combat_pose(clip, frame, base):
    p = moves.at(moves.clips(STYLE)[clip],frame)
    # The shared contact frames are the same ones used by spiritMoments.
    # Ice stays sharp and upright; squash is restrained compared with Water.
    for channel in ("wide", "deep", "tall"):
        p[channel] *= .65
    poses = {}
    for name in NAMES:
        if name == "Crown":
            poses[name] = base[name].copy()
            continue
        poses[name] = {**base[name], **moves.values(p,name,base,BODY,EYES,())}
        if name == BODY:
            poses[name]["location"] = tuple(Vector(base[name]["location"])+Vector(poses[name]["location"]))
        elif name in SHARDS:
            side = -1 if base[name]["location"][0]<0 else 1
            lower = "Lower" in name
            poses[name]["rotation_euler"] = (-.1*p["trail"],side*.10*p["spread"],
                                              side*(.13 if lower else .07)*p["spread"])
    return poses

def keep_above_floor(poses):
    """Lean about the accepted pivot without pushing the crystal tip underground."""
    body = bpy.data.objects[BODY]
    values = poses[BODY]
    for prop,value in values.items():
        setattr(body,prop,value)
    bpy.context.view_layer.update()
    lowest = min((body.matrix_world@v.co).z for v in body.data.vertices)
    if lowest < 0:
        x,y,z = values["location"]
        values["location"] = (x,y,z-lowest)

def apply_frame(clip, frame, base):
    frames = 60 if clip=="Idle" else 16
    poses = loop_pose(frame/frames,base,clip=="Run") if clip in ("Idle","Run") else combat_pose(clip,frame,base)
    keep_above_floor(poses)
    for name,values in poses.items():
        for prop,value in values.items():
            setattr(bpy.data.objects[name],prop,value)
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
            # Every frame is sampled. Linear keys prevent hidden Bezier
            # overshoot between the poses that were checked for clearance.
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
