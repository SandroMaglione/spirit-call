"""Abigail's choreography: poses in frames at 30 fps. The game owns time and travel.

The clips, their lengths, and their contact frames are the crow's
(`art/characters/crow/combat/motion.py`), so the game's combo timing is
unchanged: contact is one frame into each move, and preparation lives in
the guard and in the previous move's follow-through.

A pose names (meters and radians, in her body's frame before `spin`):
`hip` pelvis offset, `lean` forward, `twist` shoulders turned to her left
(+) or right (-), `bank` sideways, `grip` the sword hand's grip point and
`yaw`/`pitch` the blade's direction (yaw 0 is straight ahead, + to her
left; pitch + up), `left` her free hand, `footL`/`footR` ankle offsets
with `pivotL`/`pivotR` (foot yaw) and `rollL`/`rollR` (heel lift), and
`spin` the whole body's turn (+ to her left, seen from above).
"""
import math

GUARD = dict(hip=(0.0, 0.0, -0.035), lean=0.08, twist=-0.28, bank=0.0, spin=0.0,
             grip=(-0.19, -0.13, 1.02), yaw=-0.65, pitch=-0.30,
             left=(0.15, -0.12, 1.00),
             footL=(0.02, -0.075, 0.0), footR=(-0.035, 0.085, 0.0),
             pivotL=0.25, pivotR=-0.35, rollL=0.0, rollR=0.0, look=0.0)


def mix(a, b, t):
    out = {}
    for key in GUARD.keys() | a.keys() | b.keys():
        av, bv = a.get(key, GUARD[key]), b.get(key, GUARD[key])
        out[key] = tuple(x + (y - x) * t for x, y in zip(av, bv)) if isinstance(av, tuple) else av + (bv - av) * t
    return out


def smooth(t):
    return t * t * (3 - 2 * t)


def sequence(keys, frame):
    a, b = next((a, b) for a, b in zip(keys, keys[1:]) if a[0] <= frame <= b[0])
    t = (frame - a[0]) / (b[0] - a[0])
    easing = b[2]
    t = 1 - (1 - t) ** 3 if easing == "settle" else t ** 2 if easing == "accelerate" else smooth(t) if easing == "smooth" else t
    return mix(a[1], b[1], t)


def idle(phase):
    breath = math.sin(phase * math.tau)
    s = dict(GUARD)
    s.update(hip=(0.0, 0.0, -0.035 + 0.006 * breath), lean=0.08 + 0.012 * breath,
             grip=(-0.19, -0.13, 1.02 + 0.008 * breath), pitch=-0.30 + 0.02 * breath,
             left=(0.15, -0.12, 1.00 + 0.010 * breath), look=0.04 * math.sin(phase * math.tau * 0.5 + 0.4))
    return s


def run(phase):
    """A light, forward-leaning run: the sword trails low behind her, her left arm swings."""
    phase %= 1
    s = dict(GUARD)
    for offset, label in [(0, "L"), (0.5, "R")]:
        cycle = (phase + offset) % 1
        if cycle < 0.42:
            # Contact: the foot travels back under her.
            t = cycle / 0.42
            y, z = -0.30 + 0.62 * t, 0.0
            roll = 0.45 * max(0, (t - 0.6) / 0.4)
        else:
            t = (cycle - 0.42) / 0.58
            y, z = 0.32 - 0.62 * smooth(t), 0.20 * math.sin(math.pi * t) ** 1.5
            roll = 0.35 * math.sin(math.pi * t) * (1 - t)
        s["foot" + label] = (0.015 if label == "L" else -0.015, y, z)
        s["roll" + label] = roll
        s["pivot" + label] = 0.0
    pulse = math.cos(phase * math.tau * 2 + 0.6)
    sway = math.sin(phase * math.tau)
    s.update(hip=(0.012 * sway, -0.04, -0.06 + 0.030 * pulse), lean=0.32 + 0.03 * pulse,
             twist=-0.16 * sway - 0.08, bank=0.03 * sway,
             grip=(-0.21, 0.10 + 0.04 * sway, 0.98 + 0.02 * pulse), yaw=-2.55, pitch=-0.30,
             left=(0.15, -0.02 + 0.17 * sway, 1.05 + 0.05 * abs(sway)), look=0.0)
    return s


# The combo: from her low guard a rising cut across to her left, a
# backhand falling back to her right, a driving thrust, then a spinning
# finisher. The blade stays out from her body, where it reads from above.
OPEN_FOLLOW = dict(hip=(0.01, -0.05, -0.05), lean=0.16, twist=0.58, bank=0.04,
                   grip=(0.12, -0.18, 1.36), yaw=1.25, pitch=0.85, left=(0.20, 0.02, 1.04),
                   footL=(0.03, -0.13, 0.0), footR=(-0.04, 0.10, 0.0), pivotL=0.45, pivotR=-0.2, look=0.1)
BACK_FOLLOW = dict(hip=(-0.01, -0.05, -0.07), lean=0.22, twist=-0.58, bank=-0.04,
                   grip=(-0.20, -0.12, 0.94), yaw=-1.40, pitch=-0.55, left=(0.18, -0.10, 1.06),
                   footL=(0.03, -0.10, 0.0), footR=(-0.04, 0.10, 0.0), pivotL=0.2, pivotR=-0.45, look=-0.1)
THRUST_LOAD = dict(hip=(0.0, 0.02, -0.06), lean=0.10, twist=-0.52,
                   grip=(-0.17, 0.02, 1.10), yaw=-0.05, pitch=0.04, left=(0.17, -0.20, 1.10),
                   footL=(0.03, -0.07, 0.0), footR=(-0.05, 0.12, 0.0), pivotL=0.3, pivotR=-0.6)
THRUST = dict(hip=(0.0, -0.09, -0.09), lean=0.34, twist=0.18,
              grip=(-0.05, -0.47, 1.11), yaw=0.02, pitch=-0.02, left=(0.20, 0.08, 1.02),
              footL=(0.035, -0.20, 0.0), footR=(-0.05, 0.16, 0.0), pivotL=0.1, pivotR=-0.7, rollR=0.25)
SPIN_LOAD = dict(hip=(0.0, 0.0, -0.08), lean=0.16, twist=-0.72,
                 grip=(-0.26, -0.04, 1.10), yaw=-1.65, pitch=0.06, left=(0.20, -0.14, 1.04),
                 footL=(0.06, -0.08, 0.0), footR=(-0.07, 0.10, 0.0), pivotL=0.45, pivotR=-0.6)
# The spin holds the blade out to her front-right while her whole body turns.
SPIN_ARM = dict(hip=(0.0, 0.0, -0.06), lean=0.12, twist=-0.10,
                grip=(-0.30, -0.24, 1.12), yaw=-0.95, pitch=0.0, left=(0.18, 0.10, 1.06),
                footL=(0.05, -0.04, 0.0), footR=(-0.05, 0.05, 0.0), pivotL=0.0, pivotR=0.0)

KEYS = [
    (1, GUARD, "linear"),
    (2, dict(hip=(0.0, -0.04, -0.05), lean=0.20, twist=0.22, bank=0.02,
             grip=(-0.02, -0.33, 1.16), yaw=0.30, pitch=0.25, left=(0.20, -0.02, 1.02),
             footL=(0.03, -0.12, 0.0), footR=(-0.04, 0.10, 0.0), pivotL=0.35, pivotR=-0.25), "accelerate"),
    (4, OPEN_FOLLOW, "settle"),
    (9, mix(OPEN_FOLLOW, GUARD, 0.25), "smooth"),
    (10, dict(hip=(0.0, -0.05, -0.06), lean=0.22, twist=-0.15, bank=-0.02,
              grip=(-0.04, -0.33, 1.12), yaw=-0.30, pitch=-0.15, left=(0.20, -0.04, 1.04),
              footL=(0.03, -0.11, 0.0), footR=(-0.04, 0.10, 0.0), pivotL=0.25, pivotR=-0.35), "accelerate"),
    (12, BACK_FOLLOW, "settle"),
    (16, THRUST_LOAD, "smooth"),
    (17, THRUST, "accelerate"),
    (20, {**THRUST, "lean": 0.30, "grip": (-0.05, -0.45, 1.10)}, "settle"),
    (25, SPIN_LOAD, "smooth"),
    (26, {**SPIN_ARM, "spin": 0.95}, "accelerate"),
    (29, {**SPIN_ARM, "spin": 2.75}, "linear"),
    (32, {**SPIN_ARM, "spin": 4.75}, "linear"),
    (35, {**SPIN_ARM, "spin": math.tau + 0.55, "lean": 0.22, "hip": (0.0, 0.0, -0.10)}, "settle"),
    (40, {**mix(SPIN_ARM, GUARD, 0.5), "spin": math.tau}, "smooth"),
    (46, {**GUARD, "spin": math.tau}, "smooth"),
]


def combo(frame):
    return sequence(KEYS, frame)


POWER = [(1, GUARD, "linear"),
         (2, {**THRUST, "hip": (0.0, -0.13, -0.11), "lean": 0.44, "grip": (-0.04, -0.55, 1.08),
              "footL": (0.035, -0.26, 0.0), "footR": (-0.05, 0.20, 0.0)}, "accelerate"),
         (5, {**THRUST, "hip": (0.0, -0.12, -0.12), "lean": 0.40}, "settle"),
         (10, THRUST_LOAD, "smooth"),
         (16, GUARD, "smooth")]
DASH_POSE = dict(hip=(0.0, -0.06, -0.13), lean=0.55, twist=-0.12,
                 grip=(-0.19, 0.14, 0.98), yaw=-2.7, pitch=-0.25, left=(0.16, 0.14, 1.02),
                 footL=(0.02, -0.12, 0.06), footR=(-0.03, 0.20, 0.12), pivotL=0.0, pivotR=0.0, rollR=0.3)
DASH = [(1, GUARD, "linear"),
        (3, DASH_POSE, "settle"),
        (7, {**DASH_POSE, "lean": 0.48, "hip": (0.0, -0.05, -0.11)}, "linear"),
        (10, GUARD, "smooth")]

COMBO = [("Opening cut", 1, 9, 2, "Recover1"), ("Rising backhand", 9, 16, 10, "Recover2"),
         ("Driving thrust", 16, 25, 17, "Recover3"), ("Spinning finisher", 25, 46, 26, None)]

# How fast she travels during each clip (meters per second, forward), for
# the drag on her hair and cape; the game moves her body.
TRAVEL = {"Run": 4.0, "Dash": 7.0, "RunStart": 2.0, "RunStop": 2.0, "Power": 1.5}

clips = {"Idle": (60, True, lambda f: idle((f - 1) / 60)),
         "Run": (16, True, lambda f: run((f - 1) / 16)),
         "AttackCombo": (46, False, combo),
         "Power": (16, False, lambda f: sequence(POWER, f)),
         "Dash": (10, False, lambda f: sequence(DASH, f)),
         "RunStart": (7, False, lambda f: mix(GUARD, run(0), smooth((f - 1) / 6))),
         "RunStop": (8, False, lambda f: mix(run(0), GUARD, smooth((f - 1) / 7)))}
for hit, frame in enumerate([9, 16, 25], 1):
    clips[f"Recover{hit}"] = (8, False, lambda f, frame=frame: mix(combo(frame), GUARD, smooth((f - 1) / 7)))
