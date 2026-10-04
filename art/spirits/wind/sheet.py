"""Measures the wind spirit's sheet into sheet.json for build.py.

    uv run --with pillow --with numpy art/spirits/wind/sheet.py

Every view in reference/ (crops of `sheet.png`): the figure by color (mint
leaves and a near-white body on navy). The body is the near-white ball: an
ellipse fitted to its outline where it meets the background (the leaves
cover the rest). What lies outside it are its parts: two leaves on top, a
curling tendril on each side, and two leaves hanging under it. The eyes are
the holes in the body.

Units: the whole figure's height (top leaf to lowest leaf tip) is 1
(0.60 m); heights from the figure's bottom, offsets from the body's middle,
+ to the image's right. The front view faces the camera (image right is its
left); the left view shows its front on the image's right.

Each leaf: its base (where it leaves the body, along its shortest path from
the tip), its tip (its farthest point from the body, along the leaf), and
its width at eleven points from base to tip, across its base-to-tip line.
Each tendril: its middle line from base to tip (the middles of bands at
even distances from the body, measured inside it, and its tip) and its
width there.
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tools"))
from common import MASKS, blobs, holes  # noqa: E402

SAMPLES = 11  # widths along a leaf
BANDS = 12  # middles along a tendril


def outside(mask):
    """Background pixels reachable from the image's edge (so not the eyes)."""
    background = ~mask
    h, w = background.shape
    seen = np.zeros_like(background)
    queue = deque((y, x) for y in range(h) for x in (0, w - 1) if background[y, x])
    queue.extend((y, x) for x in range(w) for y in (0, h - 1) if background[y, x])
    for y, x in queue:
        seen[y, x] = True
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = y + dy, x + dx
            if 0 <= a < h and 0 <= b < w and background[a, b] and not seen[a, b]:
                seen[a, b] = True
                queue.append((a, b))
    return seen


def grow(mask, steps):
    out = mask.copy()
    for _ in range(steps):
        out = out | np.roll(out, 1, 0) | np.roll(out, -1, 0) | np.roll(out, 1, 1) | np.roll(out, -1, 1)
    return out


def body_ellipse(figure, pale):
    """The body's ellipse (center col, center row, half width, half height; pixels), fitted to its near-white outline where it meets the background."""
    piece = max(blobs(pale, 30), key=len)
    body = np.zeros_like(pale)
    body[piece[:, 0], piece[:, 1]] = True
    edge = body & ~(np.roll(body, 1, 0) & np.roll(body, -1, 0) & np.roll(body, 1, 1) & np.roll(body, -1, 1))
    points = np.argwhere(edge & grow(outside(figure), 2))
    x, y = points[:, 1].astype(float), points[:, 0].astype(float)
    a, b, c, d = np.linalg.lstsq(np.stack([x * x, y * y, x, y], 1), np.ones(len(x)), rcond=None)[0]
    cx, cy = -c / (2 * a), -d / (2 * b)
    f = 1 + a * cx * cx + b * cy * cy
    return cx, cy, float(np.sqrt(f / a)), float(np.sqrt(f / b))


def geodesic(mask, seeds):
    """Steps from `seeds` to every pixel of `mask`, inside it (8-connected); -1 where unreachable."""
    distance = np.full(mask.shape, -1, int)
    queue = deque()
    for y, x in seeds:
        distance[y, x] = 0
        queue.append((y, x))
    h, w = mask.shape
    while queue:
        y, x = queue.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                a, b = y + dy, x + dx
                if 0 <= a < h and 0 <= b < w and mask[a, b] and distance[a, b] < 0:
                    distance[a, b] = distance[y, x] + 1
                    queue.append((a, b))
    return distance


def path_to_seed(distance, tip):
    """From `tip` down the distance field to a seed: the shortest way back to the body."""
    y, x = tip
    path = [(y, x)]
    h, w = distance.shape
    while distance[y, x] > 0:
        options = [(distance[y + dy, x + dx], y + dy, x + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                   if 0 <= y + dy < h and 0 <= x + dx < w and 0 <= distance[y + dy, x + dx] < distance[y, x]]
        _, y, x = min(options)
        path.append((y, x))
    return path


def inner_depth(mask):
    """How deep (pixels) each pixel of `mask` lies inside it: erosions it survives, steps alternating straight and diagonal."""
    depth = np.zeros(mask.shape, float)
    current = mask.copy()
    for i in range(200):
        if not current.any():
            break
        depth += current
        shrunk = current & np.roll(current, 1, 0) & np.roll(current, -1, 0) & np.roll(current, 1, 1) & np.roll(current, -1, 1)
        if i % 2:
            shrunk &= np.roll(np.roll(current, 1, 0), 1, 1) & np.roll(np.roll(current, 1, 0), -1, 1)
            shrunk &= np.roll(np.roll(current, -1, 0), 1, 1) & np.roll(np.roll(current, -1, 0), -1, 1)
        current = shrunk
    return depth


def run(mask, start, direction):
    """How far (pixels) from `start` along `direction` (a unit vector, (row, col)) the mask goes on."""
    step = 0.0
    while True:
        y, x = np.round(start + direction * (step + 0.5)).astype(int)
        if not (0 <= y < mask.shape[0] and 0 <= x < mask.shape[1]) or not mask[y, x] or step > 200:
            return step
        step += 0.5


def view(name):
    im = np.asarray(Image.open(HERE / "reference" / f"{name}.png").convert("RGB")).astype(int)
    figure = MASKS["mint"](im)
    pale = figure & (im[..., 0] > 215)
    pieces = [p for p in blobs(figure, 15) if len(p) > 120]
    top, bottom = min(p[:, 0].min() for p in pieces), max(p[:, 0].max() for p in pieces)
    unit = bottom - top
    cx, cy, ax, ay = body_ellipse(figure, pale)
    rows, cols = np.mgrid[:figure.shape[0], :figure.shape[1]]
    reach = ((cols - cx) / ax) ** 2 + ((rows - cy) / ay) ** 2

    def height(y):
        return float((bottom - y) / unit)

    def offset(x):
        return float((x - cx) / unit)

    def point(y, x):
        return [offset(x), height(y)]

    parts = figure & (reach > 1.04 ** 2)
    seeds_zone = reach < 1.12 ** 2
    found = {"top_leaves": [], "tendrils": [], "lower_leaves": []}

    def leaf(mask, distance, tip):
        """A leaf from its tip: base, tip, and widths across its base-to-tip line."""
        path = path_to_seed(distance, tip)
        base = np.array(path[-1], float)
        end = np.array(tip, float)
        axis = end - base
        length = np.linalg.norm(axis)
        across = np.array([-axis[1], axis[0]]) / length
        widths, shifts = [], []
        for f in np.linspace(0, 1, SAMPLES):
            middle = base + axis * f
            reach_out = [run(mask, middle, across * sign) for sign in (1, -1)]
            widths.append(float(sum(reach_out) / unit))
            shifts.append(float((reach_out[0] - reach_out[1]) / 2 / unit))
        # `shifts`: how far the leaf's middle lies from the line, + toward `across` (the line turned left in the image).
        return {"base": point(*base), "tip": point(*end), "length": float(length / unit), "widths": widths, "shifts": shifts,
                "across": [float(across[1]), float(-across[0])]}

    for piece in sorted(blobs(parts, 40), key=len, reverse=True):
        if len(piece) < 300:
            continue
        middle_z, middle_h = height(piece[:, 0].mean()), offset(piece[:, 1].mean())
        rise = middle_z - height(cy)
        body_z = ay / unit
        kind = "top_leaves" if rise > body_z * 0.8 else "lower_leaves" if rise < -body_z * 0.8 else "tendrils"
        mask = np.zeros_like(figure)
        mask[piece[:, 0], piece[:, 1]] = True
        if kind == "top_leaves" and name == "front":
            # The two top leaves touch over the body: split them at its middle.
            halves = [mask & (cols < cx), mask & (cols >= cx)]
        else:
            halves = [mask]
        for half in halves:
            seeds = list(zip(*np.nonzero(half & seeds_zone)))
            distance = geodesic(half, seeds)
            first = np.unravel_index(np.argmax(distance), distance.shape)
            if kind == "tendrils":
                pixels = np.argwhere(distance >= 0)
                d = distance[pixels[:, 0], pixels[:, 1]]
                edges = np.linspace(0, d.max() + 1, BANDS + 1)
                middles = []
                for lo, hi in zip(edges[:-1], edges[1:]):
                    band = pixels[(d >= lo) & (d < hi)]
                    middles.append(band.mean(axis=0))
                middles.append(np.array(first, float))
                # Its width at each middle: twice the deepest point inside it near there (where it curls, a line across it
                # would run along it instead).
                depth = inner_depth(half)
                widths = []
                for middle in middles:
                    near = (rows - middle[0]) ** 2 + (cols - middle[1]) ** 2 < 3 ** 2
                    widths.append(float(2 * depth[near].max() / unit) if near.any() else 0.0)
                found["tendrils"].append({"line": [point(*m) for m in middles], "widths": widths})
            elif kind == "lower_leaves":
                # Two leaves from one piece: the farthest tip, then the point that most turns aside from the way from the
                # body to that tip (the other leaf's tip, not the first leaf's own edge).
                from_first = geodesic(half, [first])
                score = np.where((distance >= 0) & (from_first >= 0), distance + from_first - distance[first], -1)
                second = np.unravel_index(np.argmax(score), score.shape)
                for tip in (first, second):
                    found["lower_leaves"].append(leaf(half, distance, tip))
            else:
                found["top_leaves"].append(leaf(half, distance, first))
    found["top_leaves"].sort(key=lambda l: l["tip"][0])
    found["tendrils"].sort(key=lambda t: t["line"][-1][0])
    found["lower_leaves"].sort(key=lambda l: -l["length"])
    eyes = [{
        "height": height(p[:, 0].mean()),
        "offset": offset(p[:, 1].mean()),
        "wide": float((p[:, 1].max() - p[:, 1].min() + 1) / unit),
        "tall": float((p[:, 0].max() - p[:, 0].min() + 1) / unit),
    } for p in holes(figure, (int(cy - ay), int(cy + ay), int(cx - ax), int(cx + ax)))]
    return {"unit_pixels": int(unit), "body": {"height": height(cy), "half_tall": ay / unit, "half_wide": ax / unit},
            "eyes": eyes, **found}


def main():
    sheet = {name: view(name) for name in ("front", "left")}
    (HERE / "sheet.json").write_text(json.dumps(sheet, indent=1))
    for name, v in sheet.items():
        print(name, "unit", v["unit_pixels"], "px; body", {k: round(x, 3) for k, x in v["body"].items()})
        for e in v["eyes"]:
            print("   eye", {k: round(x, 3) for k, x in e.items()})
        for kind in ("top_leaves", "lower_leaves"):
            for l in v[kind]:
                print(f"   {kind[:-1]}: base {np.round(l['base'], 3)}, tip {np.round(l['tip'], 3)}, widest {max(l['widths']):.3f}")
        for t in v["tendrils"]:
            print(f"   tendril: {np.round(t['line'][0], 3)} -> {np.round(t['line'][-1], 3)}, widest {max(t['widths']):.3f}")


if __name__ == "__main__":
    main()
