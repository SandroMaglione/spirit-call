"""Measures the water spirit's sheet: its outline in the front and side views, row by row, into sheet.json for build.py.

    uv run --with pillow --with numpy art/spirits/water/sheet.py

Front view: left and right edges per height (screen right is the spirit's
left). Side view: its back and front edges per height (the sheet draws its
front on the right). Heights and offsets are in body heights, from the
body's underside; offsets from the middle of its base. Also the nub's
center and size, and the eyes' centers and sizes.
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent


def load(name):
    im = np.asarray(Image.open(HERE / "reference" / f"{name}.png").convert("RGB")).astype(int)
    blue = (im[..., 2] > 120) & (im[..., 2] - im[..., 0] > 50)
    white = im.min(axis=2) > 225
    return blue | white, white


def blobs(mask, minimum=20):
    """Connected pieces of `mask`: lists of (row, col)."""
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


def view(name):
    mask, white = load(name)
    pieces = sorted(blobs(mask), key=len, reverse=True)
    body = pieces[0]
    # The nub: the biggest other piece above the body.
    nub = next(p for p in pieces[1:] if p[:, 0].max() < body[:, 0].min() + 5)
    top, bottom = body[:, 0].min(), body[:, 0].max()
    height = bottom - top
    rows = {}
    for y in range(top, bottom + 1):
        xs = body[body[:, 0] == y][:, 1]
        if len(xs):
            rows[y] = (xs.min(), xs.max())
    # The middle of its base: the middle of its widest rows.
    widest = max(rows.values(), key=lambda r: r[1] - r[0])
    middle = (widest[0] + widest[1]) / 2
    outline = [((bottom - y) / height, (lo - middle) / height, (hi - middle) / height) for y, (lo, hi) in sorted(rows.items(), reverse=True)]
    eyes = []
    for piece in blobs(white & np.isin(np.arange(mask.shape[0])[:, None], np.arange(top, bottom + 1)), 30):
        eyes.append({
            "height": float((bottom - piece[:, 0].mean()) / height),
            "offset": float((piece[:, 1].mean() - middle) / height),
            "width": float((piece[:, 1].max() - piece[:, 1].min() + 1) / height),
            "tall": float((piece[:, 0].max() - piece[:, 0].min() + 1) / height),
        })
    return {
        "pixels": int(height),
        "outline": outline,
        "nub": {
            "height": float((bottom - nub[:, 0].mean()) / height),
            "offset": float((nub[:, 1].mean() - middle) / height),
            "radius": float((nub[:, 0].max() - nub[:, 0].min() + 1) / 2 / height),
        },
        "eyes": eyes,
    }


def main():
    sheet = {"front": view("front"), "side": view("side"), "back": view("back")}
    (HERE / "sheet.json").write_text(json.dumps(sheet, indent=1))
    for name, v in sheet.items():
        print(name, "body", v["pixels"], "px; nub", {k: round(x, 3) for k, x in v["nub"].items()})
        for e in v["eyes"]:
            print("   eye", {k: round(x, 3) for k, x in e.items()})
        for f in (0.05, 0.25, 0.5, 0.75, 0.95):
            z, lo, hi = min(v["outline"], key=lambda r: abs(r[0] - f))
            print(f"   {z:.2f}: {lo:+.3f} .. {hi:+.3f}  (middle {(lo + hi) / 2:+.3f})")


if __name__ == "__main__":
    main()
