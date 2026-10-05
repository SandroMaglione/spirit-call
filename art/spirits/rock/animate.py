"""Rock's planted shuffle, floating ornaments, and heavy object combat clips."""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import moves

FPS = 30
STYLE = {"lunge": -.014, "back": .018, "twist": .16, "roll": .06,
         "hop": .008, "spin": False, "cast": .08}
NAMES = ["RockSpirit", "TopRock", "Float.L", "Float.R", "Foot.L", "Foot.R",
         "RearRock", "Eye.L", "Eye.R"]
SUPPORT = {"Foot.L", "Foot.R", "RearRock"}


def loop_pose(t, base, running):
    wave = math.sin(t * math.tau)
    # A small weight shift, with no hover. The feet below compensate for
    # the body's transform so the supporting sole stays on the floor.
    body = bpy.data.objects["RockSpirit"]
    root = Vector(base["RockSpirit"]["location"])
    body.location = root
    body.rotation_euler = (0, .009 * wave if running else 0, 0)
    body.scale = (1, 1, 1 - .003 * abs(wave) if running else 1)
    bpy.context.view_layer.update()
    result = {"RockSpirit": {"location": tuple(body.location),
              "rotation_euler": tuple(body.rotation_euler), "scale": tuple(body.scale)}}
    blink = 0 if running else max(0, 1 - abs(t - .7) * 60 / 3)
    for name in NAMES[1:]:
        x, y, z = base[name]["location"]
        if name.startswith("Eye"):
            result[name] = {"scale": (1, 1, 1 - .92 * blink)}
        elif name in SUPPORT:
            lift, stride = 0, 0
            if running and name != "RearRock":
                phase = t * math.tau + (math.pi if name.endswith("R") else 0)
                # One foot lifts on its return; the opposite one bears weight.
                lift = .012 * max(0, math.sin(phase)) ** 2
                stride = .018 * math.cos(phase)
            world = Vector((x, y + stride, z)) + root
            world.z += lift
            result[name] = {"location": tuple(body.matrix_world.inverted() @ world),
                            "rotation_euler": tuple(body.rotation_euler.to_matrix().inverted().to_euler())}
        else:
            phase = -.7 if name == "TopRock" else (1 if name.endswith("L") else -1)
            result[name] = {"location": (x, y + .012 + (.012 if running else 0), z + .007 * math.sin(t * math.tau + phase)),
                            "rotation_euler": (.018 * wave, .025 * math.sin(t * math.tau + phase), .025 * wave)}
    return result


def combat_pose(clip, keys, frame, name, base):
    p = moves.at(keys, frame)
    if clip == "Cast":
        # Summon while planted: the stones rise, the boulder braces.
        p["up"] = 0
        p["tall"] *= .25
        p["wide"] *= .35
        p["deep"] *= .35
    elif clip == "Ultimate":
        # Immediate downward impact, then a short recoil. No airborne spin.
        p = moves.at([(0, {}), (2, {"tall": -.13, "wide": .06, "deep": .06,
             "pitch": .09, "squint": .6, "spread": 1.4}),
             (7, {"tall": .025, "open": 1, "spread": .6}), (17, {})], frame)
    if name in SUPPORT:
        return {prop: value for prop, value in base[name].items()}
    result = moves.values(p, name, base, "RockSpirit", ("Eye.L", "Eye.R"), ())
    if name == "RockSpirit":
        result["location"] = tuple(Vector(result["location"]) + Vector(base[name]["location"]))
    return result


def add_clips():
    objects = {name: bpy.data.objects[name] for name in NAMES}
    base = {name: {"location": tuple(o.location), "rotation_euler": tuple(o.rotation_euler),
                  "scale": tuple(o.scale)} for name, o in objects.items()}
    timing = {}
    definitions = {"Idle": 60, "Run": 16}
    combat = moves.clips(STYLE)
    definitions.update({name: keys[-1][0] + 1 for name, keys in combat.items()})
    for clip, frames in definitions.items():
        actions = {}
        for name, obj in objects.items():
            obj.animation_data_create()
            action = bpy.data.actions.new(f"{clip}.{name}")
            obj.animation_data.action = action
            actions[name] = action
        for frame in range(frames):
            values = loop_pose(frame / frames, base, clip == "Run") if clip in ("Idle", "Run") else {
                name: combat_pose(clip, combat[clip], frame, name, base) for name in NAMES}
            if clip not in ("Idle", "Run"):
                body = objects["RockSpirit"]
                for prop, value in values["RockSpirit"].items():
                    setattr(body, prop, value)
                bpy.context.view_layer.update()
                for name in SUPPORT:
                    world = Vector(base[name]["location"]) + Vector(base["RockSpirit"]["location"])
                    values[name] = {"location": tuple(body.matrix_world.inverted() @ world),
                                   "rotation_euler": tuple(body.rotation_euler.to_matrix().inverted().to_euler()),
                                   "scale": tuple(1 / v for v in body.scale)}
            for name, obj in objects.items():
                for prop, value in values[name].items():
                    setattr(obj, prop, value)
                    obj.keyframe_insert(prop, frame=frame)
        for name, obj in objects.items():
            track = obj.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip, 0, actions[name])
            track.mute = True
            obj.animation_data.action = None
            for prop, value in base[name].items():
                setattr(obj, prop, value)
        timing[clip] = {"lastKeySeconds": (frames - 1) / FPS,
                       "loopSeconds": frames / FPS if clip in ("Idle", "Run") else None}
    bpy.context.scene.render.fps = FPS
    bpy.context.view_layer.update()
    return timing
