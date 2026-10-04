"""The spirits' combat clips, shared by every spirit and keyed on its objects like its loops (see each spirit's animate.py).

One-shots the game plays over the loops (`looks.ts` says which at which
moment, and stretches each over the moment's length in the simulation):

- AttackA, AttackB: a blow (B mirrors A): pulling back, squashed, then
  striking at `CONTACT`, eyes narrowed.
- AttackC: a combo's last blow, bigger (a whole turn for a `spin` style).
- Power: the charged move, the biggest blow.
- Dash: stretched flat along its way, eyes shut tight, its parts streaming back.
- Hurt: knocked back and squashed, eyes shut, then wide open.
- Cast: a pop up at once, its parts thrown out (a special).
- Ultimate: a leap at once, a whole turn in the air, and a landing.
  Skills take effect the moment they are cast, so neither winds up first.

A spirit's `style` is how its character strikes: how far the blow carries
it forward (back, for one that shoots: a kick), how far it winds and
turns into it, how much it rolls, and whether its big blows spin.

Poses are small (a lean and a squash over its feet, never travel: the
simulation moves the body) and every clip starts and ends at rest. The
spirit's front is -Y; +X tips its top forward.
"""
import math

FPS = 30

# Channels of a pose; all 0 at rest.
REST = {
    "fwd": 0.0,  # body, toward its front (m)
    "up": 0.0,  # body, off the floor (m)
    "pitch": 0.0,  # tipping its top forward (rad)
    "roll": 0.0,  # tipping sideways (rad)
    "yaw": 0.0,  # turning about its axis (rad)
    "wide": 0.0,  # scale across, added to 1
    "deep": 0.0,  # scale along its way, added to 1
    "tall": 0.0,  # scale up, added to 1
    "squint": 0.0,  # eyes narrowed (1: nearly shut)
    "open": 0.0,  # eyes wide (1: a quarter bigger)
    "spread": 0.0,  # parts thrown out from its axis and up
    "trail": 0.0,  # parts streaming behind
}

# The frame each blow lands on, by clip: the game times the clip so this pose meets the simulation's blow.
CONTACT = {"AttackA": 4, "AttackB": 4, "AttackC": 6, "Power": 6}


def blow(style, size, side, turn):
    """A blow's keys: `size` scales it, `side` (1 or -1) is which way it winds and rolls, `turn` adds a whole turn through it (half done as it lands)."""
    lunge, back = style["lunge"] * size, style["back"] * size
    twist, roll = style["twist"] * side * size, style["roll"] * side * size
    # A kick (a shot's) squashes it along its way; a lunge stretches it.
    kick = lunge < 0
    spin = 2 * math.pi * side if turn else 0.0
    start = 4 if size > 1 else 2
    hit = start + 2
    return [
        (0, {}),
        (start, {"fwd": -back, "tall": -0.12 * size, "wide": 0.07 * size, "deep": 0.07 * size, "pitch": -0.1 * size, "yaw": -twist, "roll": -roll * 0.5, "squint": 0.6}),
        (hit, {"fwd": lunge, "up": style["hop"] * size, "deep": (-0.12 if kick else 0.2) * size, "wide": (0.08 if kick else -0.07) * size, "tall": (0.07 if kick else -0.04) * size,
               "pitch": (-0.22 if kick else 0.26) * size, "yaw": twist * 0.6 + spin / 2, "roll": roll, "squint": 1.0, "spread": size}),
        (hit + 3, {"fwd": lunge * 0.3, "deep": -0.04, "tall": 0.05, "pitch": (-0.05 if kick else 0.06) * size, "yaw": twist * 0.1 + spin, "roll": roll * 0.2, "squint": 0.4, "spread": 0.3 * size}),
        (hit + 7 + (3 if size > 1 else 0), {"yaw": spin}),
    ]


def clips(style):
    """Every clip's keys: `(frame, channels)` in order, the first and last at rest."""
    spin = style["spin"]
    return {
        "AttackA": blow(style, 1.0, 1, False),
        "AttackB": blow(style, 1.0, -1, False),
        "AttackC": blow(style, 1.4, 1, spin),
        "Power": blow(style, 1.8, -1, spin),
        "Dash": [
            (0, {}),
            (2, {"deep": 0.38, "wide": -0.16, "tall": -0.16, "pitch": 0.38, "squint": 1.0, "trail": 1.0}),
            (7, {"deep": 0.32, "wide": -0.14, "tall": -0.14, "pitch": 0.34, "squint": 1.0, "trail": 1.0}),
            (9, {"deep": -0.08, "wide": 0.05, "tall": 0.06, "pitch": -0.06, "open": 0.4}),
            (11, {}),
        ],
        "Hurt": [
            (0, {}),
            (1, {"fwd": -0.05, "pitch": -0.32, "tall": -0.22, "wide": 0.15, "deep": 0.15, "squint": 1.0, "spread": 1.0}),
            (4, {"fwd": -0.02, "pitch": -0.08, "tall": 0.09, "wide": -0.05, "deep": -0.05, "open": 0.8, "spread": 0.3}),
            (9, {}),
        ],
        # Skills take effect the moment they are cast: no crouch first, the body is up by the second frame.
        "Cast": [
            (0, {}),
            (2, {"up": 0.1, "tall": 0.22, "wide": -0.09, "deep": -0.09, "open": 1.0, "spread": 1.2, "pitch": style["cast"]}),
            (6, {"up": 0.03, "tall": -0.08, "wide": 0.05, "deep": 0.05, "open": 0.5, "spread": 0.5}),
            (11, {}),
        ],
        "Ultimate": [
            (0, {}),
            (2, {"up": 0.22, "tall": 0.3, "wide": -0.12, "deep": -0.12, "open": 1.0, "spread": 1.8}),
            (8, {"up": 0.2, "tall": 0.1, "wide": -0.04, "deep": -0.04, "yaw": 2 * math.pi, "open": 1.0, "spread": 2.0}),
            (11, {"tall": -0.24, "wide": 0.13, "deep": 0.13, "yaw": 2 * math.pi, "squint": 0.5, "spread": 0.8}),
            (17, {"yaw": 2 * math.pi}),
        ],
    }


def ease(t):
    return t * t * (3 - 2 * t)


def at(keys, frame):
    """The pose at `frame`: eased between the keys round it."""
    for (f0, a), (f1, b) in zip(keys, keys[1:]):
        if f0 <= frame <= f1:
            t = ease((frame - f0) / (f1 - f0))
            return {name: a.get(name, 0.0) + (b.get(name, 0.0) - a.get(name, 0.0)) * t for name in REST}
    return {name: keys[-1][1].get(name, 0.0) for name in REST}


def values(pose, name, base, body, eyes, lids):
    """What `pose` sets on the object `name`: the body's place, turn, and shape; the eyes' (and their rims') shape; a part's place."""
    if name == body:
        return {
            "location": (0, -pose["fwd"], pose["up"]),
            "rotation_euler": (pose["pitch"], pose["roll"], pose["yaw"]),
            "scale": (1 + pose["wide"], 1 + pose["deep"], 1 + pose["tall"]),
        }
    if name in eyes or name in lids:
        size = 1 + 0.25 * pose["open"]
        return {"scale": (size, 1, size * (1 - 0.8 * pose["squint"]))}
    x, y, z = base[name]["location"]
    away = max(1e-6, math.hypot(x, y))
    out = 0.05 * pose["spread"]
    return {
        "location": (x + x / away * out, y + y / away * out + 0.06 * pose["trail"], z + 0.03 * pose["spread"] - 0.01 * pose["trail"]),
        "rotation_euler": base[name]["rotation_euler"],
        "scale": base[name]["scale"],
    }


def add(bpy, objects, base, body, style, eyes=("Eye.L", "Eye.R"), lids=()):
    """Keys every combat clip on `objects` (by name, with their rest `base`) as muted NLA tracks; returns each clip's timing for the game."""
    timing = {}
    for clip, keys in clips(style).items():
        frames = keys[-1][0] + 1
        for name, obj in objects.items():
            obj.animation_data_create()
            action = bpy.data.actions.new(f"{clip}.{name}")
            obj.animation_data.action = action
            for frame in range(frames):
                for prop, value in values(at(keys, frame), name, base, body, eyes, lids).items():
                    setattr(obj, prop, value)
                    obj.keyframe_insert(prop, frame=frame)
            track = obj.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip, 0, action)
            track.mute = True
            obj.animation_data.action = None
        # One-shots: no loop to close.
        timing[clip] = {"lastKeySeconds": (frames - 1) / FPS, "loopSeconds": None}
    return timing
