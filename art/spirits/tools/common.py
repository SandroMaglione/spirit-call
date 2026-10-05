"""What every spirit's tools share: its config (`<spirit>/spirit.json`), its color mask, and finding pieces and holes in images.

A spirit's `spirit.json`:

    {
      "blend": "water-spirit.blend",        # its Blender file, in its folder
      "mask": "blue",                       # how its body shows on the sheet: "blue", "orange", or "mint" (see MASKS)
      "eyes": "light",                      # its eyes on the sheet: "light" (glowing pixels) or "dark" (holes in the body)
      "background": "#132332",              # the sheet's background, for renders
      "lights": {"sun": [3.2, [0.85, 0.95, 1.0]], "fill": [...], "rim": [...]},  # energy and color
      "ortho": 0.82,                        # the render camera's frame (m)
      "sweep": {"turns": [-60, 0, 5], "elevations": [10, 15, 20, 25, 30, 35]}    # where to search for the isometric camera
    }
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SPIRITS = Path(__file__).resolve().parent.parent

# Body pixels on a dark navy sheet, by the spirit's color.
MASKS = {
    # Warm stone and amber eyes on the rock spirit's navy sheet.
    "stone": lambda im: (im[..., 0] > 35) & (im[..., 0] - im[..., 2] > 6) & (im[..., 1] > 20),
    "blue": lambda im: ((im[..., 2] > 120) & (im[..., 2] - im[..., 0] > 50)) | (im.min(axis=2) > 225),
    "orange": lambda im: (im[..., 0] > 150) & (im[..., 0] - im[..., 2] > 80),
    # Mint leaves and a near-white body.
    "mint": lambda im: (im[..., 1] > 120) & ((im[..., 1] - im[..., 0] > 25) | (im.min(axis=2) > 190)),
    # Thunder's light sheet: saturated violet body or pale gold electricity.
    # Neutral white background and its grey labels are excluded.
    "purple": lambda im: ((im[..., 2] > 75) & (im[..., 2] - im[..., 0] > 15) & (im[..., 2] - im[..., 1] > 12)) | ((im[..., 0] > 190) & (im[..., 0] - im[..., 2] > 15) & (im[..., 1] > 160)),
}


def folder(spirit):
    return SPIRITS / spirit


def config(spirit):
    return json.loads((folder(spirit) / "spirit.json").read_text())


def mask_of(spirit, image):
    """The spirit's pixels in `image` (a PIL image or an RGB array)."""
    im = np.asarray(image.convert("RGB") if isinstance(image, Image.Image) else image).astype(int)
    return MASKS[config(spirit)["mask"]](im)


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


def holes(mask, box):
    """Pixels inside `box` (top, bottom, left, right) not in `mask` and not reachable from the box's edge: dark eyes."""
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
    return [p + np.array([top, left]) for p in blobs(inside & ~seen, 20)]


def eyes_in(spirit, image):
    """The eyes' centers (col, row) in an image of the spirit, left to right."""
    im = np.asarray(image.convert("RGB") if isinstance(image, Image.Image) else image).astype(int)
    if config(spirit)["eyes"] == "light":
        white = im.min(axis=2) > 230
        if config(spirit)["mask"] == "stone":
            stone = mask_of(spirit, im)
            ys, xs = np.nonzero(stone)
            lower = np.zeros_like(white)
            lower[int(ys.min() + (ys.max() - ys.min()) * 0.5):, :] = True
            white = lower & (white | ((im[..., 0] > 225) & (im[..., 1] > 150) & (im[..., 2] < 190)))
        if config(spirit)["mask"] == "purple":
            # Thunder's white backdrop is below 248. Restrict its brighter
            # eye cores to the body's box, including eyes at a side edge.
            violet = (im[..., 2] > 75) & (im[..., 2] - im[..., 0] > 15) & (im[..., 2] - im[..., 1] > 12)
            body = max(blobs(violet, 15), key=len)
            inside = np.zeros_like(white)
            # A drawn halo can touch the body in the isometric sheet.
            # Find the broad body, then exclude the crest and halo above it.
            rows, counts = np.unique(body[:, 0], return_counts=True)
            widest = rows[np.argmax(counts)]
            xs = body[body[:, 0] == widest][:, 1]
            top = max(body[:, 0].min(), widest - (xs.max() - xs.min()) // 3)
            inside[top:body[:, 0].max()+1, :] = True
            white = (im.min(axis=2) > 248) & inside
        found = blobs(white, 30)
        if config(spirit)["mask"] == "stone":
            found = sorted(found, key=len, reverse=True)[:2]
    else:
        mask = mask_of(spirit, im)
        body = max(blobs(mask, 15), key=len)
        found = holes(mask, (body[:, 0].min(), body[:, 0].max(), body[:, 1].min(), body[:, 1].max()))
        if len(found) > 2:
            # Gaps its parts close (a curl touching the body) are holes too: the eyes are the two the body rings most brightly.
            def ring(p):
                hole = np.zeros(mask.shape, bool)
                hole[p[:, 0], p[:, 1]] = True
                around = hole.copy()
                for _ in range(3):
                    around = around | np.roll(around, 1, 0) | np.roll(around, -1, 0) | np.roll(around, 1, 1) | np.roll(around, -1, 1)
                return im[around & ~hole].sum(axis=1).mean()
            found = sorted(found, key=ring)[-2:]
    return sorted((p[:, 1].mean(), p[:, 0].mean()) for p in found)
