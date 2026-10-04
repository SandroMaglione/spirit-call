"""The fire spirit's clips, keyed on its objects (no skeleton): the body (which carries its eyes and shards), the four shards, and the eyes.

- Idle (2 s loop): a gentle bob; the flame flickers (stretching up and
  thinning, quicker than the bob, swaying a little); each shard floats on
  its own beat, bobbing, swaying out, and spinning; one blink.
- Run (one hop every 16 frames): a small hop squashing as it lands, leaning
  into the run; the shards streaming back, lagging the hop.

Each clip is one NLA track per object (named after the clip), muted, so the
glTF export writes them as animations and the scene keeps its rest pose.
"""
import math

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import moves  # noqa: E402

FPS = 30
# The Gunner shoots: each shot kicks her back, nothing spins.
STYLE = {"lunge": -0.06, "back": 0.0, "twist": 0.12, "roll": 0.1, "hop": 0.0, "spin": False, "cast": -0.15}


def wave(t, cycles=1, phase=0.0):
    return math.sin(2 * math.pi * cycles * t + phase)


def blink(t, at=0.62):
    """1 while the eyes are shut: closed over 3 frames, open over 4 (of 60)."""
    d = (t - at) * 60
    return max(0.0, 1 - abs(d) / (3 if d < 0 else 4))


def idle(t, base, names):
    shut = blink(t)
    # The flame's flicker: three beats per loop on top of the bob.
    flicker = 0.6 * wave(t, 3) + 0.4 * wave(t, 5, 1.1)
    poses = {
        "FireSpirit": {
            "location": (0, 0, 0.012 * (wave(t) + 1)),
            "scale": (1 - 0.018 * flicker, 1 - 0.018 * flicker, 1 + 0.035 * flicker),
            "rotation_euler": (0.025 * wave(t, 1, 0.7), 0.04 * wave(t, 2, 0.3), 0),
        },
        "Eye.L": {"scale": (1, 1, 1 - 0.9 * shut)},
        "Eye.R": {"scale": (1, 1, 1 - 0.9 * shut)},
    }
    for index, name in enumerate(n for n in names if n.startswith("Shard")):
        x, y, z = base[name]["location"]
        phase = index * 1.7
        out = 0.012 * wave(t, 2, phase)
        length = max(1e-6, math.hypot(x, y))
        poses[name] = {
            "location": (x + x / length * out, y + y / length * out, z + 0.02 * wave(t, 2, phase + 0.5)),
            "rotation_euler": (0.15 * wave(t, 2, phase), 0.15 * wave(t, 2, phase + 1), 2 * math.pi * t * (1 if index % 2 else -1)),
            "scale": (1, 1, 1 + 0.12 * wave(t, 4, phase)),
        }
    return poses


def run(t, base, names):
    hop = abs(math.sin(math.pi * t))
    land = (1 - hop) ** 3
    poses = {
        "FireSpirit": {
            "location": (0, 0, 0.03 * hop),
            "scale": (1 + 0.05 * land - 0.02 * hop, 1 + 0.05 * land - 0.02 * hop, 1 - 0.08 * land + 0.05 * hop),
            # Leaning into the run (its front is -Y: +X tips its top forward).
            "rotation_euler": (0.18 + 0.03 * hop, 0, 0),
        },
        "Eye.L": {"scale": (1, 1, 1)},
        "Eye.R": {"scale": (1, 1, 1)},
    }
    for index, name in enumerate(n for n in names if n.startswith("Shard")):
        x, y, z = base[name]["location"]
        lag = abs(math.sin(math.pi * t - 0.8 - 0.2 * index))
        poses[name] = {
            # Streaming back (+Y) and down a little, lagging the hop.
            "location": (x * 0.9, y + 0.045, z - 0.015 + 0.025 * lag),
            "rotation_euler": (-0.5, 0, 2 * math.pi * t * (1 if index % 2 else -1)),
            "scale": (1, 1, 1.15),
        }
    return poses


CLIPS = {"Idle": (idle, 60), "Run": (run, 16)}


def add_clips():
    """Keys every clip on the spirit's objects as muted NLA tracks; returns each clip's timing for the game."""
    names = ["FireSpirit", "Eye.L", "Eye.R"] + sorted(o.name for o in bpy.data.objects if o.name.startswith("Shard"))
    objects = {name: bpy.data.objects[name] for name in names}
    base = {name: {"location": tuple(o.location), "rotation_euler": tuple(o.rotation_euler), "scale": tuple(o.scale)} for name, o in objects.items()}
    timing = {}
    for clip, (pose, frames) in CLIPS.items():
        for name, obj in objects.items():
            obj.animation_data_create()
            action = bpy.data.actions.new(f"{clip}.{name}")
            obj.animation_data.action = action
            for frame in range(frames):
                for prop, value in pose(frame / frames, base, names)[name].items():
                    setattr(obj, prop, value)
                    obj.keyframe_insert(prop, frame=frame)
            track = obj.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip, 0, action)
            track.mute = True
            obj.animation_data.action = None
        timing[clip] = {"lastKeySeconds": (frames - 1) / FPS, "loopSeconds": frames / FPS}
    # Its combat clips (shared by every spirit: tools/moves.py).
    timing.update(moves.add(bpy, objects, base, "FireSpirit", STYLE))
    for name, obj in objects.items():
        for prop, value in base[name].items():
            setattr(obj, prop, value)
    bpy.context.scene.render.fps = FPS
    return timing
