"""The water spirit's clips, keyed on its objects (no skeleton): the body (which carries its eyes and nub), the nub, and the eyes.

- Idle (2 s loop): a gentle bob, squashing a little at the bottom; the nub
  floats out of step, circling and spinning slowly; one blink.
- Run (one hop every 16 frames): a small hop, squashing as it lands, leaning
  into the run; the nub trailing behind and lagging the hop.

Each clip is one NLA track per object (named after the clip), so the glTF
export merges them into one animation. Keys run from frame 0 to the last
frame before the loop closes (the game puts the first pose back at the
loop's end, see `closeLoop`).

    import animate; timing = animate.add_clips()   (from export.py)
"""
import math

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import moves  # noqa: E402

FPS = 30
# The Tidecaller throws: she winds far round and snaps through, turning with her big throws.
STYLE = {"lunge": 0.05, "back": 0.03, "twist": 0.7, "roll": 0.16, "hop": 0.01, "spin": True, "cast": 0.12}


def wave(t, phase=0.0):
    return math.sin(2 * math.pi * t + phase)


def idle(t, base):
    """Poses at `t` (0..1 of the loop) for the idle: {object: {property: value}}."""
    bob = wave(t)
    nub = base["Nub"]["location"]
    # One blink, about two thirds into the loop: closed over 3 frames, open over 4.
    blink_at = 0.68
    d = (t - blink_at) * 60
    closed = max(0.0, 1 - abs(d) / (3 if d < 0 else 4))
    eye_scale = (1, 1, 1 - 0.9 * closed)
    return {
        "WaterSpirit": {
            "location": (0, 0, 0.012 * (bob + 1)),
            # Wider and lower at the bottom of the bob.
            "scale": (1 - 0.014 * bob, 1 - 0.014 * bob, 1 + 0.022 * bob),
            "rotation_euler": (0.03 * wave(t, 1.3), 0.025 * wave(t, 2.1), 0),
        },
        "Nub": {
            # A slow circle and a bob a quarter-loop behind the body's.
            "location": (nub[0] + 0.013 * math.cos(2 * math.pi * t), nub[1] + 0.013 * math.sin(2 * math.pi * t), nub[2] + 0.018 * wave(t, -1.6)),
            "rotation_euler": (0.3 * wave(t), 0.2 * wave(t, 1), 2 * math.pi * t),
        },
        "Eye.L": {"scale": eye_scale},
        "Eye.R": {"scale": eye_scale},
    }


def run(t, base):
    """Poses at `t` (0..1 of the loop) for the run: one hop per loop."""
    hop = abs(math.sin(math.pi * t))  # 0 at landing (t = 0), highest midway
    land = (1 - hop) ** 3  # a squash right at the landing
    nub = base["Nub"]["location"]
    return {
        "WaterSpirit": {
            "location": (0, 0, 0.03 * hop),
            "scale": (1 + 0.05 * land - 0.02 * hop, 1 + 0.05 * land - 0.02 * hop, 1 - 0.08 * land + 0.04 * hop),
            # Leaning into the run (its front is -Y: +X tilts its top forward).
            "rotation_euler": (0.16 + 0.03 * hop, 0, 0),
        },
        "Nub": {
            # Trailing back and lagging the hop.
            "location": (nub[0], nub[1] + 0.035, nub[2] - 0.02 + 0.03 * abs(math.sin(math.pi * t - 0.9))),
            "rotation_euler": (-0.4, 0, 2 * math.pi * t),
        },
        "Eye.L": {"scale": (1, 1, 1)},
        "Eye.R": {"scale": (1, 1, 1)},
    }


CLIPS = {"Idle": (idle, 60), "Run": (run, 16)}


def add_clips():
    """Keys every clip on the spirit's objects as NLA tracks; returns each clip's timing for the game."""
    objects = {name: bpy.data.objects[name] for name in ("WaterSpirit", "Nub", "Eye.L", "Eye.R")}
    base = {name: {"location": tuple(o.location), "rotation_euler": tuple(o.rotation_euler), "scale": tuple(o.scale)} for name, o in objects.items()}
    timing = {}
    for clip, (pose, frames) in CLIPS.items():
        for name, obj in objects.items():
            obj.animation_data_create()
            action = bpy.data.actions.new(f"{clip}.{name}")
            obj.animation_data.action = action
            for frame in range(frames):
                values = pose(frame / frames, base)[name]
                for prop, value in values.items():
                    setattr(obj, prop, value)
                    obj.keyframe_insert(prop, frame=frame)
            track = obj.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip, 0, action)
            # Muted: the scene keeps its rest pose (the exporter still writes each track).
            track.mute = True
            obj.animation_data.action = None
        timing[clip] = {"lastKeySeconds": (frames - 1) / FPS, "loopSeconds": frames / FPS}
    # Its combat clips (shared by every spirit: tools/moves.py).
    timing.update(moves.add(bpy, objects, base, "WaterSpirit", STYLE))
    for name, obj in objects.items():
        for prop, value in base[name].items():
            setattr(obj, prop, value)
    bpy.context.scene.render.fps = FPS
    return timing
