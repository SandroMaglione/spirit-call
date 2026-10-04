"""Object clips for Thunder: a hovering idle and a quick forward glide.

One muted NLA track per object per clip. The closing pose is omitted;
the game closes each loop at its generated loopSeconds. Motion stays
vertical, with no root movement on the floor.
"""
import math

import bpy

FPS = 30
NAMES = ["ThunderSpirit", "LightningCrest", "Halo", "LightningWing.L", "LightningWing.R",
         "VioletFin.L", "VioletFin.R", "Eye.L", "Eye.R", "Rim.L", "Rim.R"]


def wave(t, phase=0.0):
    return math.sin(2 * math.pi * t + phase)


def pose(t, base, running):
    bob = wave(t)
    shut = 0 if running else max(0, 1 - abs((t - 0.65) * 60) / (3 if t < 0.65 else 4))
    values = {
        "ThunderSpirit": {
            "location": (0, 0, (0.015 if running else 0.008) * (1 + bob)),
            "rotation_euler": (0.15 + 0.025 * bob if running else 0.018 * wave(t, 0.7), 0.018 * wave(t, 1.2), 0),
            "scale": (1 - 0.012 * bob, 1 - 0.012 * bob, 1 + 0.018 * bob),
        },
    }
    for name in NAMES[1:]:
        x, y, z = base[name]["location"]
        if name.startswith(("Eye.", "Rim.")):
            values[name] = {"scale": (1, 1, 1 - 0.9 * shut)}
        elif name == "Halo":
            values[name] = {
                "location": (x, y + (0.018 if running else 0), z + 0.008 * wave(t, -0.8)),
                "rotation_euler": (-0.08 if running else 0.025 * wave(t, 0.4), 0.02 * wave(t, 1.2), 2 * math.pi * t),
            }
        elif name == "LightningCrest":
            values[name] = {
                "location": (x, y + (0.014 if running else 0), z + 0.009 * wave(t, -1.0)),
                "rotation_euler": (-0.1 if running else 0.035 * wave(t, 1.1), 0.04 * wave(t, -0.6), 0),
            }
        else:
            side = 1 if name.endswith(".L") else -1
            values[name] = {
                "location": (x, y + (0.022 if running else 0), z + 0.004 * wave(t, side * 0.6)),
                "rotation_euler": (-0.09 if running else 0.025 * wave(t, side), side * 0.035 * wave(t, -0.5), 0),
            }
    return values


def add_clips():
    # Give parts modeled in world coordinates a local pivot at their center.
    # Moving the pivot and vertices together leaves the approved rest pose.
    for name in ("Halo", "LightningCrest", "VioletFin.L", "VioletFin.R"):
        obj = bpy.data.objects[name]
        center = sum((v.co for v in obj.data.vertices), obj.location.copy() * 0) / len(obj.data.vertices)
        for vertex in obj.data.vertices:
            vertex.co -= center
        obj.location += center
    objects = {name: bpy.data.objects[name] for name in NAMES}
    base = {name: {"location": tuple(o.location), "rotation_euler": tuple(o.rotation_euler), "scale": tuple(o.scale)} for name, o in objects.items()}
    timing = {}
    for clip, frames in (("Idle", 60), ("Run", 16)):
        for name, obj in objects.items():
            obj.animation_data_create()
            action = bpy.data.actions.new(f"{clip}.{name}")
            obj.animation_data.action = action
            for frame in range(frames):
                for prop, value in pose(frame / frames, base, clip == "Run")[name].items():
                    setattr(obj, prop, value)
                    obj.keyframe_insert(prop, frame=frame)
            track = obj.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip, 0, action)
            track.mute = True
            obj.animation_data.action = None
        timing[clip] = {"lastKeySeconds": (frames - 1) / FPS, "loopSeconds": frames / FPS}
    for name, obj in objects.items():
        for prop, value in base[name].items():
            setattr(obj, prop, value)
    bpy.context.scene.render.fps = FPS
    bpy.context.view_layer.update()
    return timing
