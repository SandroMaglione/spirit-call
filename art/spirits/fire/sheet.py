"""Measures the fire spirit's sheet into sheet.json for build.py.

    uv run --with pillow --with numpy art/spirits/fire/sheet.py

Every view in reference/ (crops of `sheet.png`, the same scale): its
pieces by color (orange on navy). The largest is the body, with the ember
nub hanging under a narrow neck; the others are the floating shards. The
eyes are the holes in the body. Units: the whole figure's height (top
shard to the nub's bottom) is 1 (0.60 m); heights from the nub's bottom,
offsets from the middle of the body's widest row, + to the image's right.

The front view faces the camera (image right is its left); the back view
the other way; the left view shows its front on the image's right, the
right view on the left; the top view has its front at the bottom (image
right is its left).
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent


def blobs(mask, minimum=20):
    """Connected pieces of `mask`, as (n, 2) arrays of (row, col)."""
    seen = np.zeros_like(mask)
    out = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        queue, piece = deque([(y, x)]), []
        seen[y, x] = True
        while queue:
            a, b = queue.popleft()
            piece.append((a, b))
            for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c, d = a + da, b + db
                if 0 <= c < mask.shape[0] and 0 <= d < mask.shape[1] and mask[c, d] and not seen[c, d]:
                    seen[c, d] = True
                    queue.append((c, d))
        if len(piece) >= minimum:
            out.append(np.array(piece))
    return out


def orange(im):
    return (im[..., 0] > 150) & (im[..., 0] - im[..., 2] > 80)


def holes(mask, box):
    """Pixels inside `box` (rows, cols) not in `mask` and not reachable from the box's edge: the eyes."""
    top, bottom, left, right = box
    inside = ~mask[top:bottom + 1, left:right + 1]
    h, w = inside.shape
    seen = np.zeros_like(inside)
    queue = deque((y, x) for y in range(h) for x in (0, w - 1) if inside[y, x])
    queue.extend((y, x) for x in range(w) for y in (0, h - 1) if inside[y, x])
    for y, x in queue:
        seen[y, x] = True
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = y + dy, x + dx
            if 0 <= a < h and 0 <= b < w and inside[a, b] and not seen[a, b]:
                seen[a, b] = True
                queue.append((a, b))
    enclosed = inside & ~seen
    return [p + np.array([top, left]) for p in blobs(enclosed, 20)]


def view(name):
    im = np.asarray(Image.open(HERE / "reference" / f"{name}.png").convert("RGB")).astype(int)
    mask = orange(im)
    pieces = sorted(blobs(mask, 15), key=len, reverse=True)
    body = pieces[0]
    top = min(p[:, 0].min() for p in pieces)
    bottom = body[:, 0].max()
    unit = bottom - top
    rows = {}
    for y in range(body[:, 0].min(), bottom + 1):
        xs = body[body[:, 0] == y][:, 1]
        if len(xs):
            rows[y] = (xs.min(), xs.max())
    # The neck: the narrowest row between the body and the nub's own bottom (the lowest quarter, above its last tenth).
    low = [y for y in rows if bottom - unit * 0.25 < y < bottom - unit * 0.1]
    neck = min(low, key=lambda y: rows[y][1] - rows[y][0]) if low else bottom
    upper = {y: r for y, r in rows.items() if y < neck}
    widest = max(upper.values(), key=lambda r: r[1] - r[0])
    middle = (widest[0] + widest[1]) / 2

    def height(y):
        return float((bottom - y) / unit)

    def offset(x):
        return float((x - middle) / unit)

    outline = [(height(y), offset(lo), offset(hi)) for y, (lo, hi) in sorted(rows.items(), reverse=True)]
    shards = [{
        "height": height(p[:, 0].mean()),
        "offset": offset(p[:, 1].mean()),
        "tall": float((p[:, 0].max() - p[:, 0].min() + 1) / unit),
        "wide": float((p[:, 1].max() - p[:, 1].min() + 1) / unit),
        # Its lean: the long axis's angle from vertical (+ leaning to the image's right at its top).
        "lean": float(np.degrees(np.arctan2(-np.cov(p[:, 1], p[:, 0])[0, 1], np.var(p[:, 0])))) if len(p) > 3 else 0.0,
        "pixels": int(len(p)),
    } for p in pieces[1:] if len(p) > 120]
    eyes = [{
        "height": height(p[:, 0].mean()),
        "offset": offset(p[:, 1].mean()),
        "wide": float((p[:, 1].max() - p[:, 1].min() + 1) / unit),
        "tall": float((p[:, 0].max() - p[:, 0].min() + 1) / unit),
    } for p in holes(mask, (body[:, 0].min(), neck, body[:, 1].min(), body[:, 1].max()))]
    return {"unit_pixels": int(unit), "neck": height(neck), "outline": outline, "shards": shards, "eyes": eyes}


def top_view():
    """The top view: the body's outline across and front to back, and the shards' places (offsets from its middle, in the front view's units)."""
    im = np.asarray(Image.open(HERE / "reference" / "top.png").convert("RGB")).astype(int)
    pieces = sorted(blobs(orange(im), 15), key=len, reverse=True)
    body = pieces[0]
    width = body[:, 1].max() - body[:, 1].min()
    center = ((body[:, 0].min() + body[:, 0].max()) / 2, (body[:, 1].min() + body[:, 1].max()) / 2)
    return {"width_pixels": int(width), "shards": [{
        "across": float((p[:, 1].mean() - center[1]) / width),  # + its left
        "forward": float((p[:, 0].mean() - center[0]) / width),  # + toward its front (the image's bottom)
        "pixels": int(len(p)),
    } for p in pieces[1:] if len(p) > 120]}


def main():
    sheet = {name: view(name) for name in ("front", "back", "left", "right")}
    sheet["top"] = top_view()
    (HERE / "sheet.json").write_text(json.dumps(sheet, indent=1))
    for name, v in sheet.items():
        if name == "top":
            print("top", v["shards"])
            continue
        print(name, "unit", v["unit_pixels"], "px; neck at", round(v["neck"], 3))
        for s in v["shards"]:
            print("   shard", {k: round(x, 3) for k, x in s.items()})
        for e in v["eyes"]:
            print("   eye", {k: round(x, 3) for k, x in e.items()})


if __name__ == "__main__":
    main()
