"""Lays a spirit's renders on its sheet's views and scores how well they match.

    uv run --with pillow --with numpy art/spirits/tools/overlay.py <spirit>

Each image is scaled so the whole figure (its topmost piece to the body's
bottom: every view of a sheet is the same scale) is the same height, its
body's widest row centered. Writes `<spirit>/renders/overlay-<view>.png`
(the sheet with both outlines, sheet yellow and model red, and the two
blended) and `overlay-all.png`, and prints the overlap of the silhouettes
(intersection over union) per view.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import blobs, folder, mask_of  # noqa: E402

SIZE = 400  # the figure's height in the overlay, pixels
VIEWS = ("front", "back", "left", "right", "top", "bottom", "hero")


def figure_box(mask):
    pieces = blobs(mask, 15)
    body = max(pieces, key=len)
    near = [p for p in pieces if len(p) > 120]
    return min(p[:, 0].min() for p in near), body[:, 0].max()


def normalized(spirit, path):
    """The image scaled and placed as above; and its silhouette."""
    image = Image.open(path).convert("RGB")
    mask = mask_of(spirit, image)
    top, bottom = figure_box(mask)
    scale = SIZE / (bottom - top)
    widest = max(range(top, bottom + 1), key=lambda y: mask[y].sum())
    xs = np.nonzero(mask[widest])[0]
    middle = (xs.min() + xs.max()) / 2
    big = image.resize((int(image.width * scale), int(image.height * scale)))
    canvas = Image.new("RGB", (int(SIZE * 1.6), int(SIZE * 1.5)), (19, 35, 50))
    canvas.paste(big, (int(canvas.width / 2 - middle * scale), int(canvas.height * 0.9 - bottom * scale)))
    return canvas, mask_of(spirit, canvas)


def outline(mask):
    return mask & ~(np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1))


def main(spirit):
    here = folder(spirit)
    cells = []
    for view in VIEWS:
        sheet, sheet_mask = normalized(spirit, here / "reference" / f"{view}.png")
        model, model_mask = normalized(spirit, here / "renders" / f"{view}.png")
        iou = (sheet_mask & model_mask).sum() / (sheet_mask | model_mask).sum()
        blend = Image.blend(sheet, model, 0.5)
        for image in (sheet, blend):
            pixels = np.asarray(image).copy()
            pixels[outline(sheet_mask)] = (255, 220, 60)
            pixels[outline(model_mask)] = (255, 60, 60)
            image.paste(Image.fromarray(pixels))
        out = Image.new("RGB", (sheet.width * 2 + 10, sheet.height), (0, 0, 0))
        out.paste(sheet, (0, 0))
        out.paste(blend, (sheet.width + 10, 0))
        ImageDraw.Draw(out).text((10, 10), f"{view}: overlap {iou:.1%} (yellow sheet, red model)", fill=(255, 255, 255))
        out.save(here / "renders" / f"overlay-{view}.png")
        cells.append(blend.resize((300, 280)))
        print(f"{view}: overlap {iou:.1%}")
    grid = Image.new("RGB", (4 * 305, 2 * 285), (0, 0, 0))
    for i, cell in enumerate(cells):
        grid.paste(cell, ((i % 4) * 305, (i // 4) * 285))
    grid.save(here / "renders" / "overlay-all.png")


if __name__ == "__main__":
    main(sys.argv[1])
