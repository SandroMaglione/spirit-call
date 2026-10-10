"""Crop the supplied sheet and record its silhouettes, eyes and palette.

Run with uv run --with pillow --with numpy measure.py. Measurements stay
in source pixels. The painted turnarounds have small camera differences.
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
BOXES = {
    "front": (24, 175, 354, 422), "left": (397, 173, 688, 424),
    "back": (735, 175, 1061, 422), "right": (1120, 173, 1405, 422),
    "top": (26, 501, 327, 795), "bottom": (370, 510, 637, 792),
    "hero": (694, 511, 1114, 811), "face": (1159, 493, 1424, 640),
    "moss": (1159, 703, 1424, 891),
}

def mask(image):
    rgb = np.asarray(image.convert("RGB")).astype(float)
    r, g, b = rgb.transpose(2, 0, 1)
    warm_or_green = (r > 26) & (g > 23) & ((r-b > 5) | (g-b > 22))
    # The underside is neutral grey, unlike the navy background and shadow.
    neutral_stone = (rgb.min(axis=2) > 40) & (rgb.max(axis=2)-rgb.min(axis=2) < 35)
    return warm_or_green | neutral_stone

def filled(mask):
    """Include the dark face and underside, but exclude the navy shadow."""
    outside = np.zeros_like(mask)
    h, w = mask.shape
    queue = deque([(0, x) for x in range(w)] + [(h-1, x) for x in range(w)] +
                  [(y, 0) for y in range(h)] + [(y, w-1) for y in range(h)])
    while queue:
        y, x = queue.popleft()
        if not (0 <= x < w and 0 <= y < h) or mask[y, x] or outside[y, x]:
            continue
        outside[y, x] = True
        queue.extend(((y-1, x), (y+1, x), (y, x-1), (y, x+1)))
    return ~outside

def bounds(mask):
    y, x = np.nonzero(mask)
    if not len(x):
        return None
    return [int(x.min()), int(y.min()), int(x.max()), int(y.max())]

def main():
    source = Image.open(HERE / "reference/sheet.png").convert("RGB")
    data = {"source_size": list(source.size), "height_m": 0.62, "views": {}}
    for name, box in BOXES.items():
        image = source.crop(box)
        image.save(HERE / f"reference/{name}.png")
        if name in ("face", "moss"):
            continue
        silhouette = filled(mask(image))
        rgb = np.asarray(image).astype(float)
        green = silhouette & (rgb[..., 1] > rgb[..., 0]*0.94) & (rgb[..., 1]-rgb[..., 2] > 30)
        amber = (rgb[..., 0] > 235) & (rgb[..., 1] > 170) & (rgb[..., 2] < 180)
        if name == "front":
            yy, xx = np.indices(amber.shape)
            amber &= (yy > 140) & (yy < 190) & (xx > 155) & (xx < 223)
            eyes = []
            for lo, hi in ((157, 187), (189, 219)):
                ys, xs = np.nonzero(amber & (xx >= lo) & (xx < hi))
                eyes.append({"center": [float(xs.mean()), float(ys.mean())],
                             "width_px": int(xs.max()-xs.min()+1), "height_px": int(ys.max()-ys.min()+1)})
            data["eyes"] = eyes
        rows = []
        for y in range(silhouette.shape[0]):
            xs = np.nonzero(silhouette[y])[0]
            if len(xs):
                rows.append([y, int(xs.min()), int(xs.max())])
        data["views"][name] = {"crop": box, "bounds_px": bounds(silhouette),
                                 "moss_bounds_px": bounds(green), "outline_rows": rows}
        outline = silhouette & ~(np.roll(silhouette, 1, 0) & np.roll(silhouette, -1, 0) &
                                 np.roll(silhouette, 1, 1) & np.roll(silhouette, -1, 1))
        pixels = np.asarray(image).copy()
        pixels[outline] = (255, 205, 60)
        annotated = Image.fromarray(pixels)
        ImageDraw.Draw(annotated).text((8, 8), name, fill=(255, 235, 205))
        annotated.save(HERE / f"renders/measure-{name}.png")
    data["palette"] = {}
    for label, x in (("stone_light", 87), ("stone_mid", 185), ("stone_dark", 283), ("moss", 382), ("amber", 478)):
        rgb = np.median(np.asarray(source)[920:946, x-10:x+10], axis=(0, 1)).astype(int)
        data["palette"][label] = "#" + "".join(f"{c:02x}" for c in rgb)
    front = data["views"]["front"]["bounds_px"]
    data["meters_per_pixel"] = .62 / (front[3]-front[1])
    data["front_width_to_height"] = (front[2]-front[0]) / (front[3]-front[1])
    (HERE / "sheet.json").write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps({k: v for k, v in data.items() if k != "views"}, indent=2))

if __name__ == "__main__":
    main()
