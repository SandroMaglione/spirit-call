"""Abigail's body, hair, and outfit, measured from the sheet's views.

Heights come from the front view (pixel rows on the sheet's shared ground
line, `SHEET`), widths from the front, and depths from the side view. The
sheet's side view leaves out the arms and the whole cape, so their depth
and how they hang are guesses (see README's guess log).

Meters, Blender axes: +Z up, she faces -Y, her left is +X (`.L`).
"""
import math

from mathutils import Matrix, Vector

from shapes import Part, blend, box, cell_uv, loft, strand

# Sheet pixels to meters: her hair top (row 322) to her soles (row 2400) is
# 1.62 m, centered on column 966 in the front view.
SHEET = {"rows": (322, 2400), "height": 1.62, "front_center": 966, "side_center": 1684, "back_center": 2471}
METERS_PER_PIXEL = SHEET["height"] / (SHEET["rows"][1] - SHEET["rows"][0])

# How much bigger than the sheet her head is drawn, for readability at
# game size; 1 is the sheet (about 7.4 heads tall).
HEAD_SCALE = 1.1
NECK = Vector((0, 0.012, 1.395))


def headward(p):
    """A head or hair point, scaled about the neck by HEAD_SCALE."""
    return NECK + (Vector(p) - NECK) * HEAD_SCALE


# Joints (bone heads), shared with rig.py.
HIP = {"L": Vector((0.052, 0.0, 0.955)), "R": Vector((-0.052, 0.0, 0.955))}
KNEE = {s: Vector((h.x * 0.9, -0.006, 0.565)) for s, h in HIP.items()}
ANKLE = {s: Vector((h.x * 0.95, 0.03, 0.115)) for s, h in HIP.items()}
SHOULDER = {"L": Vector((0.118, 0.012, 1.305)), "R": Vector((-0.118, 0.012, 1.305))}
UPPER_ARM, FOREARM, FIST = 0.25, 0.22, 0.045
# Her swords are the crow's, scaled to her hand: about 0.75 m long.
SWORD_SCALE = 0.52


def arm_direction(side, down=math.radians(40), forward=math.radians(8)):
    """Rest arm direction: hanging `down` radians out from her side, a little forward."""
    sign = 1 if side == "L" else -1
    return Vector((sign * math.sin(down), -math.sin(forward), -math.cos(down))).normalized()


ELBOW = {s: SHOULDER[s] + arm_direction(s) * UPPER_ARM for s in "LR"}
WRIST = {s: ELBOW[s] + arm_direction(s, math.radians(34), math.radians(18)) * FOREARM for s in "LR"}

TORSO = [  # z, half width, front depth, back depth, center y
    (0.915, 0.045, 0.030, 0.040, 0.004),
    (0.950, 0.084, 0.058, 0.074, 0.006),
    (1.000, 0.093, 0.066, 0.084, 0.006),
    (1.060, 0.083, 0.061, 0.071, 0.002),
    (1.120, 0.071, 0.057, 0.062, 0.000),
    (1.155, 0.067, 0.057, 0.060, 0.000),
    (1.200, 0.077, 0.070, 0.064, -0.002),
    (1.235, 0.087, 0.098, 0.067, 0.000),
    (1.265, 0.091, 0.096, 0.069, 0.000),
    (1.290, 0.097, 0.074, 0.069, 0.002),
    (1.315, 0.103, 0.054, 0.061, 0.004),
    (1.336, 0.068, 0.044, 0.050, 0.006),
    (1.348, 0.036, 0.034, 0.040, 0.008),
]

HEAD = [  # z, half width, front depth, back depth, center y
    (1.400, 0.010, 0.006, 0.006, -0.046),
    (1.411, 0.029, 0.020, 0.028, -0.036),
    (1.428, 0.044, 0.034, 0.050, -0.021),
    (1.448, 0.055, 0.046, 0.069, -0.012),
    (1.473, 0.060, 0.053, 0.080, -0.005),
    (1.500, 0.063, 0.056, 0.085, 0.000),
    (1.530, 0.063, 0.054, 0.087, 0.002),
    (1.558, 0.057, 0.046, 0.080, 0.004),
    (1.583, 0.038, 0.031, 0.054, 0.006),
    (1.596, 0.012, 0.010, 0.016, 0.006),
]

# Where the face texture sits on the head: x and z (meters) of its square.
FACE_WINDOW = {"x": (-0.075, 0.075), "z": (1.385, 1.535)}


def torso_weights(z):
    if z < 1.06:
        return blend({"pelvis": 1}, {"spine": 1}, (z - 1.02) / 0.08)
    if z < 1.2:
        return blend({"spine": 1}, {"chest": 1}, (z - 1.16) / 0.08)
    return blend({"chest": 1}, {"neck": 1}, (z - 1.34) / 0.05)


def path_at(points, t):
    """A point `t` (0..1) along a polyline by length."""
    lengths = [(Vector(b) - Vector(a)).length for a, b in zip(points, points[1:])]
    goal = t * sum(lengths)
    for (a, b), length in zip(zip(points, points[1:]), lengths):
        if goal <= length or (a, b) == (points[-2], points[-1]):
            return Vector(a).lerp(Vector(b), min(1, goal / length))
        goal -= length
    return Vector(points[-1])


def ring(side, front, back, **extra):
    return {"side": side, "front": front, "back": back, **extra}


def torso(parts):
    part = Part("torso")
    path = [(0, cy, z) for z, _, _, _, cy in TORSO]
    rings = [ring(w, f, b) for _, w, f, b, _ in TORSO]

    loft(part, path, rings, 16, lambda i: torso_weights(TORSO[i][0]), lambda i, j: "suit")
    # The bodysuit's zip, a thin line down the front from the collar.
    zip_line = [(0, cy - f - 0.002, z) for z, _, f, _, cy in TORSO if 1.17 < z < 1.34]
    strand(part, zip_line, [0.005] * len(zip_line), [0.003] * len(zip_line), lambda i: {"chest": 1}, "zip", normal_hint=Vector((0, -1, 0)))
    parts.append(part)


def neck(parts):
    part = Part("neck")
    zs = [1.330, 1.360, 1.385, 1.392, 1.420]
    rings = [ring(0.034, 0.034, 0.034), ring(0.033, 0.032, 0.033), ring(0.033, 0.032, 0.033), ring(0.025, 0.023, 0.026), ring(0.024, 0.022, 0.025)]
    path = [headward((0, 0.010, z)) if z > 1.39 else Vector((0, 0.010, z)) for z in zs]
    weights = lambda i: blend({"chest": 1}, {"neck": 1}, i / 1.5) if i < 3 else blend({"neck": 1}, {"head": 1}, (i - 2) / 2)
    color = lambda i, j: "suit" if i < 2 else "skin"
    loft(part, path, rings, 12, weights, color)
    parts.append(part)


def head(parts):
    part = Part("head")
    path = [headward((0, cy, z)) for z, _, _, _, cy in HEAD]
    rings = [ring(w * HEAD_SCALE, f * HEAD_SCALE, b * HEAD_SCALE) for _, w, f, b, _ in HEAD]
    start = len(part.faces)
    loft(part, path, rings, 16, lambda i: {"head": 1}, lambda i, j: "skin")
    # Faces turned toward the front show the painted face (projected from the front).
    x0, x1 = FACE_WINDOW["x"]
    z0, z1 = FACE_WINDOW["z"]
    face_rect = [0, 0, 256, 256]
    for index in range(start, len(part.faces)):
        corners = [Vector(part.verts[v]) for v in part.faces[index]]
        normal = (corners[1] - corners[0]).cross(corners[2] - corners[0])
        center = sum(corners, Vector()) / len(corners)
        if normal.length == 0:
            continue
        normal.normalize()
        # Faces are wound so their normal points out; the face looks toward -Y.
        if center.y > -0.01 or abs(normal.y) < 0.2:
            continue
        uvs = []
        for c in corners:
            local = NECK + (c - NECK) / HEAD_SCALE
            u = (local.x - x0) / (x1 - x0)
            v = (z1 - local.z) / (z1 - z0)
            uvs.append(((face_rect[0] + u * face_rect[2]) / 512, 1 - (face_rect[1] + v * face_rect[3]) / 512))
        part.uvs[index] = uvs
    parts.append(part)


def leg(parts, side):
    part = Part("leg " + side)
    hip, knee, ankle = HIP[side], KNEE[side], ANKLE[side]
    sign = 1 if side == "L" else -1
    spec = [  # z, side, front, back
        (0.995, 0.050, 0.052, 0.058),
        (0.930, 0.056, 0.056, 0.060),
        (0.860, 0.052, 0.052, 0.055),
        (0.780, 0.047, 0.047, 0.050),
        (0.700, 0.042, 0.041, 0.046),
        (0.620, 0.036, 0.034, 0.040),
        (0.565, 0.033, 0.033, 0.036),
        (0.515, 0.032, 0.032, 0.040),
        (0.455, 0.034, 0.033, 0.045),
        (0.400, 0.031, 0.030, 0.040),
    ]
    path = []
    for z, *_ in spec:
        if z >= knee.z:
            t = (hip.z + 0.04 - z) / (hip.z + 0.04 - knee.z)
            path.append(hip + Vector((0, 0, 0.04)) + (knee - hip - Vector((0, 0, 0.04))) * t)
        else:
            t = (knee.z - z) / (knee.z - ankle.z)
            path.append(knee + (ankle - knee) * t)
    # Inner thighs are a little flatter than the outer side.
    rings = [ring(s, f, b, left=s if sign > 0 else s * 0.9, right=s * 0.9 if sign > 0 else s) for _, s, f, b in spec]

    def weights(i):
        z = spec[i][0]
        if z > 0.9:
            return blend({"pelvis": 1}, {f"thigh.{side}": 1}, (0.99 - z) / 0.08)
        return blend({f"thigh.{side}": 1}, {f"shin.{side}": 1}, (0.61 - z) / 0.09)

    def color(i, j):
        # Shorts: cut higher on the outside of the thigh.
        a = math.tau * (j + 0.5) / 12
        outer = max(0, math.cos(a) * sign)
        hem = 0.905 + 0.03 * outer
        return "suit" if spec[i + 1][0] + 0.02 > hem and spec[i][0] > hem else "skin"

    loft(part, path, rings, 12, weights, color, cap_start=False)
    parts.append(part)


def boot(parts, side):
    part = Part("boot " + side)
    knee, ankle = KNEE[side], ANKLE[side]
    zs = [0.425, 0.40, 0.33, 0.25, 0.18, 0.13]
    radii = [(0.040, 0.040, 0.047), (0.039, 0.039, 0.047), (0.036, 0.035, 0.042), (0.032, 0.031, 0.036), (0.032, 0.033, 0.034), (0.035, 0.040, 0.040)]
    path = [knee + (ankle - knee) * ((knee.z - z) / (knee.z - ankle.z)) for z in zs]
    rings = [ring(*r, power=2.4) for r in radii]
    # Two straps cross the boot shaft.
    color = lambda i, j: "bootShade" if i in (0, 3) else "boot"
    loft(part, path, rings, 12, lambda i: {f"shin.{side}": 1}, color)
    # A chunky platform shoe, lofted from heel to toe.
    shoe = [  # y, z center, half width, top, bottom
        (0.095, 0.055, 0.034, 0.040, 0.052),
        (0.075, 0.065, 0.042, 0.065, 0.062),
        (0.030, 0.060, 0.046, 0.060, 0.060),
        (-0.020, 0.050, 0.046, 0.042, 0.050),
        (-0.065, 0.044, 0.044, 0.032, 0.044),
        (-0.100, 0.040, 0.037, 0.026, 0.040),
        (-0.118, 0.040, 0.025, 0.018, 0.034),
    ]
    x = ankle.x
    path = [Vector((x, y, z)) for y, z, *_ in shoe]
    rings = [ring(w, top, bottom, power=2.6) for _, _, w, top, bottom in shoe]

    def weights(i):
        return blend({f"foot.{side}": 1}, {f"toe.{side}": 1}, (-shoe[i][0] - 0.035) / 0.05)

    def color(i, j):
        # The ring's bottom (+v) is the floor side: the platform sole.
        a = math.tau * (j + 0.5) / 14
        return "sole" if math.sin(a) > 0.35 else ("bootShade" if i == 1 else "boot")

    loft(part, path, rings, 14, weights, color)
    parts.append(part)


def arm(parts, side):
    part = Part("arm " + side)
    shoulder, elbow, wrist = SHOULDER[side], ELBOW[side], WRIST[side]
    start = shoulder - (elbow - shoulder).normalized() * 0.03 + Vector((0, 0, -0.005))
    spec = [  # t along the arm (0 shoulder, 1 elbow, 2 wrist), radius side, front, back
        (0.0, 0.040, 0.042, 0.042),
        (0.12, 0.044, 0.042, 0.044),
        (0.45, 0.037, 0.036, 0.038),
        (0.80, 0.032, 0.032, 0.034),
        (1.00, 0.030, 0.030, 0.031),
        (1.30, 0.030, 0.031, 0.031),
        (1.70, 0.026, 0.026, 0.027),
        (1.86, 0.027, 0.027, 0.028),
        (1.95, 0.025, 0.025, 0.026),
        (2.02, 0.020, 0.020, 0.021),
    ]
    path = []
    for t, *_ in spec:
        path.append(start + (elbow - start) * t if t <= 1 else elbow + (wrist - elbow) * (t - 1))
    rings = [ring(s, f, b) for _, s, f, b in spec]

    def weights(i):
        t = spec[i][0]
        if t < 0.3:
            return blend({"chest": 1}, {f"upper_arm.{side}": 1}, t / 0.25 + 0.35)
        if t < 1.5:
            return blend({f"upper_arm.{side}": 1}, {f"forearm.{side}": 1}, (t - 0.85) / 0.3)
        return blend({f"forearm.{side}": 1}, {f"hand.{side}": 1}, (t - 1.9) / 0.15)

    # White cuffs at the wrist.
    color = lambda i, j: "trim" if 6 <= i <= 7 else "suit"
    loft(part, path, rings, 10, weights, color, cap_start=False)
    parts.append(part)
    # A closed fist around the grip; the right one holds the sword.
    knuckles = (wrist - elbow).normalized()
    center = wrist + knuckles * FIST
    fist = Part("fist " + side)
    axis = knuckles
    rings = [ring(0.022, 0.017, 0.017, power=2.6), ring(0.028, 0.022, 0.022, power=3), ring(0.027, 0.022, 0.021, power=3), ring(0.018, 0.015, 0.015, power=2.6)]
    path = [wrist + axis * d for d in (0.005, 0.025, 0.055, 0.075)]
    loft(fist, path, rings, 8, lambda i: {f"hand.{side}": 1}, lambda i, j: "skin", front=Vector((0, 0, -1)))
    parts.append(fist)
    return center


def hips_gear(parts):
    """The waist belt under the bust, the hip belt with its pouches, and the thigh holster."""
    part = Part("belts")
    for z0, z1, grow, cell in [(1.150, 1.178, 0.006, "strap"), (1.052, 1.085, 0.009, "strap")]:
        rows = [r for r in TORSO if True]
        def at(z):
            for a, b in zip(TORSO, TORSO[1:]):
                if a[0] <= z <= b[0]:
                    t = (z - a[0]) / (b[0] - a[0])
                    return [a[k] + (b[k] - a[k]) * t for k in range(5)]
        path, rings = [], []
        for z in (z0, z1):
            _, w, f, b, cy = at(z)
            path.append((0, cy, z))
            rings.append(ring(w + grow, f + grow, b + grow))
        loft(part, path, rings, 16, lambda i, z=z0: torso_weights(z), lambda i, j, c=cell: c)
    # Pouches on the hip belt: front left, front right, her left side, the back.
    for x, y, z, size, turn in [(-0.05, -0.072, 1.045, (0.045, 0.026, 0.055), 0.15), (0.045, -0.072, 1.05, (0.04, 0.026, 0.05), -0.15),
                                (0.092, -0.02, 1.05, (0.026, 0.04, 0.05), 0.0), (-0.09, -0.03, 1.04, (0.024, 0.036, 0.06), 0.0),
                                (0.0, 0.085, 1.05, (0.06, 0.024, 0.045), 0.0)]:
        box(part, (x, y, z), size, {"pelvis": 1}, "capeWhite", Matrix.Rotation(turn, 3, "Z"))
    # The thigh holster on her right thigh, and its strap.
    box(part, (-0.092, -0.012, 0.80), (0.022, 0.05, 0.12), {"thigh.R": 1}, "capeWhite")
    hip, knee = HIP["R"], KNEE["R"]
    center = hip + (knee - hip) * 0.4
    loft(part, [center + Vector((0, 0, -0.012)), center + Vector((0, 0, 0.012))],
         [ring(0.054, 0.054, 0.058), ring(0.054, 0.054, 0.058)], 14, lambda i: {"thigh.R": 1}, lambda i, j: "strap")
    parts.append(part)


def sash(parts):
    """The white band across her chest, from her right shoulder to her left hip, on the suit's surface."""
    part = Part("sash")
    points = []
    for k in range(9):
        t = k / 8
        z = 1.335 - t * 0.27
        x = -0.085 + t * 0.175
        # Lie on the torso's front: its depth at this height and side.
        for a, b in zip(TORSO, TORSO[1:]):
            if a[0] <= z <= b[0]:
                s = (z - a[0]) / (b[0] - a[0])
                w, f = a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s
        across = min(1, abs(x) / w)
        y = -f * math.sqrt(max(0, 1 - across ** 2)) - 0.012
        points.append((x, y, z))
    strand(part, points, [0.05] * 9, [0.008] * 9, lambda i: torso_weights(points[i][2]), "capeWhite", normal_hint=Vector((0, -1, 0)))
    parts.append(part)


def hair(parts):
    """A black bob, grey at its ends: a cap, a shell around the back and sides, and locks.

    Her fringe falls to her eyes; on her right a long lock reaches her chest,
    on her left the ends flare outward under a white clip.
    """
    part = Part("hair")
    head_only = lambda i: {"head": 1}
    # The cap over the skull; its lower front edge is the fringe's root.
    cap = [(1.490, 0.074, 0.066, 0.098), (1.535, 0.079, 0.068, 0.103), (1.572, 0.075, 0.062, 0.098),
           (1.600, 0.060, 0.049, 0.080), (1.616, 0.036, 0.029, 0.050), (1.622, 0.010, 0.008, 0.012)]
    loft(part, [headward((0, 0.002, z)) for z, *_ in cap],
         [ring(w * HEAD_SCALE, f * HEAD_SCALE, b * HEAD_SCALE) for _, w, f, b in cap], 16, head_only,
         lambda i, j: "hairCap")
    # The bob: around the sides and back (not the face), flaring wider on her left.
    bob = [(1.540, 0.076, 0.070, 0.100, 0.076), (1.480, 0.081, 0.072, 0.102, 0.083), (1.430, 0.085, 0.072, 0.099, 0.095),
           (1.385, 0.088, 0.070, 0.094, 0.112), (1.345, 0.093, 0.068, 0.088, 0.125)]
    rings = [ring(r * HEAD_SCALE, f * HEAD_SCALE, b * HEAD_SCALE, left=l * HEAD_SCALE, right=r * HEAD_SCALE) for _, r, f, b, l in bob]
    weights = lambda i: blend({"head": 1}, {"hair.back": 1}, i / 3)
    loft(part, [headward((0, 0.004, z)) for z, *_ in bob], rings, 16, weights,
         lambda i, j: "hair", arc=(-2, 10), thickness=0.012 * HEAD_SCALE)

    def lock(points, widths, bone, cell="hair", thickness=0.011, hint=Vector((0, -1, 0))):
        points = [headward(p) for p in points]
        n = len(points)
        weights = (lambda i: blend({"head": 1}, {bone: 1}, i / (n - 1) * 1.6)) if bone != "head" else head_only
        strand(part, points, [w * HEAD_SCALE for w in widths], [thickness * HEAD_SCALE * (1 - 0.6 * i / (n - 1)) for i in range(n)],
               weights, cell, normal_hint=hint)

    # Fringe: strands from the hairline down over the forehead, longest between the eyes and at the sides.
    # They end above her eyes (the camera looks down on them), but for one between them and the side locks.
    for x, tip in [(-0.058, 1.440), (-0.040, 1.492), (-0.020, 1.486), (0.0, 1.466), (0.020, 1.488), (0.040, 1.494), (0.058, 1.448)]:
        reach = 0.060 + 0.003 * (1 - abs(x) / 0.06)
        side = 0.012 * (1 if x > 0 else -1) * (abs(x) > 0.05)
        lock([(x * 0.8, -0.045, 1.585), (x * 1.02, -reach, 1.540), (x * 1.08 + side, -reach + 0.004, 1.500), (x * 1.12 + side * 1.5, -reach + 0.010, tip)],
             [0.030, 0.034, 0.026, 0.0], "head", thickness=0.012)
    # Her right: a long lock past her shoulder, in front of it.
    for dx, dy, tip in [(0.0, 0.0, 1.255), (-0.012, 0.022, 1.29)]:
        lock([(-0.064 + dx, -0.028 + dy, 1.535), (-0.084 + dx, -0.046 + dy, 1.440), (-0.094 + dx, -0.052 + dy, 1.345), (-0.090 + dx, -0.048 + dy, tip)],
             [0.034, 0.036, 0.026, 0.0], "hair.side.R", cell="hairLock")
    # Her left: ends flaring outward and back.
    for dy, out, tip in [(-0.012, 0.150, 1.385), (0.025, 0.160, 1.360), (0.060, 0.140, 1.345)]:
        lock([(0.066, dy, 1.505), (0.096, dy + 0.008, 1.445), (0.126, dy + 0.012, 1.405), (out, dy + 0.016, tip)],
             [0.040, 0.044, 0.032, 0.0], "hair.side.L", cell="hairLock")
    # Pointed ends below the bob, around her back.
    for angle in (25, 55, 90, 125, 155):
        a = math.radians(angle)
        r = 0.088
        x, y = r * math.cos(a), 0.004 + r * math.sin(a)
        lock([(x, y, 1.372), (x * 1.06, y * 1.06 + 0.004, 1.330), (x * 1.08, y * 1.08 + 0.008, 1.290)], [0.045, 0.032, 0.0], "hair.back",
             hint=Vector((math.cos(a), math.sin(a), 0)))
    # One strand standing up from the crown.
    lock([(-0.005, -0.010, 1.605), (-0.018, -0.030, 1.640), (-0.040, -0.048, 1.648)], [0.012, 0.010, 0.0], "head", thickness=0.006, hint=Vector((1, 0, 0)))
    # The white clip over her left temple, with its blue bars.
    clip = Matrix.Rotation(math.radians(-25), 3, "Y")
    box(part, headward((0.057, -0.052, 1.552)), (0.024 * HEAD_SCALE, 0.008, 0.014 * HEAD_SCALE), {"head": 1}, "capeWhite", clip)
    box(part, headward((0.062, -0.053, 1.532)), (0.022 * HEAD_SCALE, 0.007, 0.005 * HEAD_SCALE), {"head": 1}, "accentDeep", clip)
    parts.append(part)


def cape(parts):
    """The cape: a back panel, two wide shoulder panels with long ends, a bow with a key, and a tail at her left hip."""
    part = Part("cape")
    # The back panel, between her arms, from her shoulders to her hips.
    back = [(1.345, 0.07, 0.05, 0.068), (1.320, 0.12, 0.06, 0.085), (1.270, 0.14, 0.08, 0.095),
            (1.170, 0.15, 0.08, 0.110), (1.060, 0.16, 0.09, 0.128), (0.960, 0.17, 0.10, 0.145)]
    weights = lambda i: blend({"chest": 1}, {"cape.back": 1}, i / 3)
    loft(part, [(0, 0.004, z) for z, *_ in back], [ring(*r[1:]) for r in back], 16, weights,
         lambda i, j: "capeFade", arc=(1, 7), thickness=0.007)
    # A white drape over her left shoulder and chest.
    drape = [(1.352, 0.075, 0.054, 0.066), (1.328, 0.118, 0.070, 0.075), (1.290, 0.120, 0.106, 0.075), (1.225, 0.110, 0.118, 0.075)]
    loft(part, [(0, 0.0, z) for z, *_ in drape], [ring(*r[1:]) for r in drape], 16, lambda i: {"chest": 1},
         lambda i, j: "capeWhite", arc=(-3, 1), thickness=0.006)
    # Shoulder panels: wide, light blue, standing out behind her shoulders.
    for side, sign in [("L", 1), ("R", -1)]:
        # They droop a little toward their ends, like a bow's loops.
        path = [(sign * 0.05, 0.085, 1.292), (sign * 0.13, 0.092, 1.292), (sign * 0.20, 0.092, 1.278), (sign * 0.240, 0.086, 1.262)]
        rings = [ring(0.030, 0.010, 0.010, power=3.5), ring(0.040, 0.011, 0.011, power=3.5), ring(0.043, 0.011, 0.011, power=3.5), ring(0.038, 0.010, 0.010, power=3.5)]
        weights = lambda i, side=side: blend({"chest": 1}, {f"cape.{side}": 1}, i / 2)
        loft(part, path, rings, 12, weights, lambda i, j: "capeBlue")
        # The panel's long end, hanging behind her arm to her hips, with a white strap.
        path = [(sign * 0.200, 0.092, 1.270), (sign * 0.210, 0.102, 1.140), (sign * 0.220, 0.112, 1.000), (sign * 0.225, 0.120, 0.880)]
        rings = [ring(0.040, 0.008, 0.008, power=4), ring(0.048, 0.008, 0.008, power=4), ring(0.054, 0.008, 0.008, power=4), ring(0.052, 0.008, 0.008, power=4)]
        weights = lambda i, side=side: {f"cape.{side}": 1}
        loft(part, path, rings, 12, weights, lambda i, j: "capeWhite" if j in (2, 3) else "capeBlue", front=Vector((0, 0, 1)))
    # The bow at the top of her back: two loops and a knot, then the key hanging from it.
    for sign in (1, -1):
        path = [(sign * 0.012, 0.108, 1.280), (sign * 0.045, 0.118, 1.292), (sign * 0.080, 0.122, 1.300), (sign * 0.098, 0.118, 1.296)]
        rings = [ring(0.012, 0.012, 0.012), ring(0.034, 0.018, 0.018), ring(0.040, 0.016, 0.016), ring(0.022, 0.010, 0.010)]
        loft(part, path, rings, 10, lambda i: blend({"chest": 1}, {"cape.back": 1}, 0.3), lambda i, j: "capeWhite")
    box(part, (0, 0.112, 1.282), (0.024, 0.026, 0.03), blend({"chest": 1}, {"cape.back": 1}, 0.3), "capeBlue")
    key = lambda i=0: blend({"chest": 1}, {"cape.back": 1}, 0.7)
    loft(part, [(0.026 * math.cos(a), 0.128, 1.225 + 0.026 * math.sin(a)) for a in [math.tau * k / 8 for k in range(9)]],
         [ring(0.007, 0.007, 0.007)] * 9, 6, lambda i: key(), lambda i, j: "metal", cap_start=False, cap_end=False)
    box(part, (0, 0.128, 1.130), (0.014, 0.012, 0.15), key(), "metalDark")
    box(part, (0.012, 0.128, 1.072), (0.03, 0.012, 0.012), key(), "metalDark")
    box(part, (0.016, 0.128, 1.090), (0.012, 0.012, 0.03), key(), "metalDark")
    # The tail: a long panel around her left hip, white fading to blue, down to her calf.
    tail = [(1.085, 0.100, 0.075, 0.090), (0.960, 0.118, 0.085, 0.105), (0.800, 0.135, 0.090, 0.115), (0.640, 0.150, 0.095, 0.125), (0.500, 0.160, 0.100, 0.130)]
    weights = lambda i: blend({"pelvis": 1}, {"tail": 1}, i / 2)
    loft(part, [(0.035 + 0.02 * i, 0.004, z) for i, (z, *_) in enumerate(tail)], [ring(*r[1:]) for r in tail], 16, weights,
         lambda i, j: "tail", arc=(-2, 2), thickness=0.006)
    parts.append(part)


def figure():
    parts = []
    torso(parts)
    neck(parts)
    head(parts)
    hair(parts)
    for side in "LR":
        leg(parts, side)
        boot(parts, side)
        arm(parts, side)
    hips_gear(parts)
    sash(parts)
    cape(parts)
    return parts
