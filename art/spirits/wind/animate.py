"""The wind spirit's clips, keyed on its objects (no skeleton): the body (which carries everything else), its leaves and horns (each turning about its base), and the eyes.

- Idle (2 s loop): a gentle bob with a slow tilt, as if riding a breeze;
  the top leaves flutter (each on its own beat), the horns sway, the
  leaves under it trail and swing; one blink.
- Run (one hop every 16 frames): a small hop squashing as it lands,
  leaning into the run; the top leaves and horns swept back, fluttering,
  the leaves under it trailing back, lagging the hop.

Each clip is one NLA track per object (named after the clip), muted, so the
glTF export writes them as animations and the scene keeps its rest pose.
Rotations are about each part's base (its origin): +X tips a part's top
toward its front (-Y), so a part pointing up sweeps back with -X and one
hanging down trails back with +X.
"""
import math

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import moves  # noqa: E402

FPS = 30
# The Swordsman cuts: a long lunge, rolling with the blade, her big blows a whole turn.
STYLE = {"lunge": 0.11, "back": 0.04, "twist": 0.4, "roll": 0.3, "hop": 0.015, "spin": True, "cast": 0.2}
PARTS = ("TopLeaf.L", "TopLeaf.R", "Tendril.L", "Tendril.R", "LowLeaf.Big", "LowLeaf.Small")


def wave(t, cycles=1, phase=0.0):
    return math.sin(2 * math.pi * cycles * t + phase)


def blink(t, at=0.62):
    """1 while the eyes are shut: closed over 3 frames, open over 4 (of 60)."""
    d = (t - at) * 60
    return max(0.0, 1 - abs(d) / (3 if d < 0 else 4))


def side(name):
    """+1 for its left (+X), -1 for its right."""
    return 1 if name.endswith(".L") else -1


def idle(t, base):
    shut = blink(t)
    poses = {
        "WindSpirit": {
            "location": (0, 0, 0.014 * (wave(t) + 1)),
            "rotation_euler": (0.03 * wave(t, 1, 0.6), 0.05 * wave(t, 1, 1.4), 0),
            "scale": (1, 1, 1),
        },
        "Eye.L": {"scale": (1, 1, 1 - 0.9 * shut)},
        "Eye.R": {"scale": (1, 1, 1 - 0.9 * shut)},
    }
    for index, name in enumerate(PARTS):
        phase = index * 1.3
        if name.startswith("TopLeaf"):
            # Fluttering: out and back (about Y), a little forward and back (about X), quicker than the bob.
            rotation = (0.06 * wave(t, 2, phase + 0.8), side(name) * 0.12 * wave(t, 2, phase), 0)
        elif name.startswith("Tendril"):
            # Swaying up and back, slow.
            rotation = (0.08 * wave(t, 1, phase), side(name) * 0.07 * wave(t, 1, phase + 1.2), 0.06 * wave(t, 1, phase + 0.4))
        else:
            # Trailing under it, swinging with the bob.
            rotation = (0.1 + 0.08 * wave(t, 1, -0.9 + phase * 0.3), 0.1 * wave(t, 1, phase), 0)
        poses[name] = {"rotation_euler": rotation}
    return poses


def run(t, base):
    hop = abs(math.sin(math.pi * t))
    land = (1 - hop) ** 3
    poses = {
        "WindSpirit": {
            "location": (0, 0, 0.03 * hop),
            "scale": (1 + 0.05 * land - 0.02 * hop, 1 + 0.05 * land - 0.02 * hop, 1 - 0.08 * land + 0.05 * hop),
            # Leaning into the run.
            "rotation_euler": (0.18 + 0.03 * hop, 0, 0),
        },
        "Eye.L": {"scale": (1, 1, 1)},
        "Eye.R": {"scale": (1, 1, 1)},
    }
    for index, name in enumerate(PARTS):
        lag = abs(math.sin(math.pi * t - 0.8 - 0.2 * index))
        flutter = wave(t, 2, index * 1.1)
        if name.startswith("TopLeaf"):
            rotation = (-0.45 + 0.08 * lag, side(name) * 0.08 * flutter, 0)
        elif name.startswith("Tendril"):
            rotation = (-0.25 + 0.08 * lag, side(name) * 0.05 * flutter, 0)
        else:
            rotation = (0.5 - 0.12 * lag, 0.06 * flutter, 0)
        poses[name] = {"rotation_euler": rotation}
    return poses


CLIPS = {"Idle": (idle, 60), "Run": (run, 16)}


def add_clips():
    """Keys every clip on the spirit's objects as muted NLA tracks; returns each clip's timing for the game."""
    names = ["WindSpirit", "Eye.L", "Eye.R", *PARTS]
    objects = {name: bpy.data.objects[name] for name in names}
    base = {name: {"location": tuple(o.location), "rotation_euler": tuple(o.rotation_euler), "scale": tuple(o.scale)} for name, o in objects.items()}
    timing = {}
    for clip, (pose, frames) in CLIPS.items():
        for name, obj in objects.items():
            obj.animation_data_create()
            action = bpy.data.actions.new(f"{clip}.{name}")
            obj.animation_data.action = action
            for frame in range(frames):
                for prop, value in pose(frame / frames, base)[name].items():
                    setattr(obj, prop, value)
                    obj.keyframe_insert(prop, frame=frame)
            track = obj.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip, 0, action)
            track.mute = True
            obj.animation_data.action = None
        timing[clip] = {"lastKeySeconds": (frames - 1) / FPS, "loopSeconds": frames / FPS}
    # Its combat clips (shared by every spirit: tools/moves.py).
    timing.update(moves.add(bpy, objects, base, "WindSpirit", STYLE))
    for name, obj in objects.items():
        for prop, value in base[name].items():
            setattr(obj, prop, value)
    bpy.context.scene.render.fps = FPS
    return timing
