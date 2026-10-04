"""Fits what the sheet's "front view" really is: the body seen turned by some angle.

The sheet's back and side views are true views; its front view is turned
(its eyes sit off center). With the body lofted through the back view
(left and right, mirrored) and the side view (front and back), this finds
the turn that best matches the front view's outline, then the eyes' height
and spacing on the true front that put them where that turned view shows
them. Writes the result into sheet.json ("fit") for build.py.

    uv run --with numpy art/spirits/water/fit.py
"""
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sheet = json.loads((HERE / "sheet.json").read_text())


def extents(view, z):
    rows = sheet[view]["outline"]
    zs = np.array([r[0] for r in rows])
    order = np.argsort(zs)
    lo = np.interp(z, zs[order], np.array([r[1] for r in rows])[order])
    hi = np.interp(z, zs[order], np.array([r[2] for r in rows])[order])
    return lo, hi


def surface(z, a):
    """The body's surface at height z, a radians round from its front toward its left (+X); she faces -Y."""
    # Back view: the camera behind her; screen left is her left (+X).
    back_lo, back_hi = extents("back", z)
    left, right = -back_lo, back_hi
    # Side view: her front on screen right (-Y).
    side_lo, side_hi = extents("side", z)
    front, back = side_hi, -side_lo
    x = math.sin(a) * (left if math.sin(a) > 0 else right)
    y = -math.cos(a) * (front if math.cos(a) > 0 else back)
    return np.array([x, y, z])


HEIGHTS = np.linspace(0.01, 0.99, 50)
ANGLES = np.linspace(0, 2 * math.pi, 72, endpoint=False)
POINTS = np.array([[surface(z, a) for a in ANGLES] for z in HEIGHTS])  # (heights, angles, 3)


def screen_x(points, turn):
    """Screen x of points seen from `turn` radians round from her front toward her left (screen right is then her left, turned)."""
    right = np.array([math.cos(turn), math.sin(turn), 0])
    return points @ right


def projected_outline(turn):
    xs = screen_x(POINTS, turn)
    lo, hi = xs.min(axis=1), xs.max(axis=1)
    widest = np.argmax(hi - lo)
    middle = (lo[widest] + hi[widest]) / 2
    return lo - middle, hi - middle, middle


def outline_error(turn):
    lo, hi, _ = projected_outline(turn)
    s_lo, s_hi = zip(*(extents("front", z) for z in HEIGHTS))
    return float(np.mean((lo - s_lo) ** 2 + (hi - s_hi) ** 2))


def eye_point(height, spread, side):
    """The surface point at `height` whose x is side × spread / 2 on her front half."""
    angles = np.linspace(0, math.pi / 2, 200) * side
    pts = np.array([surface(height, a) for a in angles])
    return pts[np.argmin(np.abs(pts[:, 0] - side * spread / 2))]


MIDDLES = {}
EYE_POINTS = {}


def eyes_in_view(height, spread, turn):
    if turn not in MIDDLES:
        MIDDLES[turn] = projected_outline(turn)[2]
    if (height, spread) not in EYE_POINTS:
        EYE_POINTS[(height, spread)] = [eye_point(height, spread, side) for side in (-1, 1)]
    return sorted(float(screen_x(p, turn) - MIDDLES[turn]) for p in EYE_POINTS[(height, spread)])


turns = np.radians(np.arange(-45, 45.5, 1.0))
ERRORS = {float(t): outline_error(t) for t in turns}
errors = list(ERRORS.values())
outline_turn = float(turns[int(np.argmin(errors))])

sheet_eyes = sorted(sheet["front"]["eyes"], key=lambda e: e["offset"])
targets = [e["offset"] for e in sheet_eyes]
height = float(np.mean([e["height"] for e in sheet_eyes]))
best = None
for turn in turns:
    for spread in np.linspace(0.15, 0.5, 71):
        got = eyes_in_view(height, spread, turn)
        err = sum((g - t) ** 2 for g, t in zip(got, targets)) + 0.2 * ERRORS[float(turn)]
        if best is None or err < best[0]:
            best = (err, float(turn), float(spread))
_, turn, spread = best
sheet["fit"] = {
    "front_turn_degrees": math.degrees(turn),
    "outline_only_turn_degrees": math.degrees(outline_turn),
    "eye_height": height,
    "eye_spread": spread,
    "eye_width": float(np.mean([e["width"] for e in sheet_eyes])),
    "eye_tall": float(np.mean([e["tall"] for e in sheet_eyes])),
}
(HERE / "sheet.json").write_text(json.dumps(sheet, indent=1))
print(json.dumps(sheet["fit"], indent=1))
print("eyes in that view", [round(x, 3) for x in eyes_in_view(height, spread, turn)], "sheet", [round(t, 3) for t in targets])
print("outline error at that turn", round(outline_error(turn), 5), "at 0°", round(outline_error(0), 5))
