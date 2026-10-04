"""Lays the model's renders on the sheet's views: each body aligned by its base and scaled to the same height.

    uv run --with pillow --with numpy art/spirits/water/overlay.py

Writes renders/overlay-<view>.png: the sheet's view, its outline in yellow,
the model's outline in red, and the two blended. Prints how much the two
silhouettes overlap (intersection over union, body and nub).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
SIZE = 400  # the body's height in the overlay, pixels


def mask_of(image):
    im = np.asarray(image.convert("RGB")).astype(int)
    return (im[..., 0] > 150) & (im[..., 0] - im[..., 2] > 80)


def body_box(mask):
    """The whole figure's rows (top shard to the nub's bottom: every view is the same scale), and the body's columns."""
    from sheet import blobs
    pieces = [p for p in blobs(mask, 15)]
    body = max(pieces, key=len)
    near = [p for p in pieces if len(p) > 120]
    return min(p[:, 0].min() for p in near), body[:, 0].max(), body[:, 1].min(), body[:, 1].max()


def normalized(path):
    """The image scaled so its body is SIZE tall, its base's middle at a fixed point; and its silhouette."""
    image = Image.open(path).convert("RGB")
    mask = mask_of(image)
    top, bottom, left, right = body_box(mask)
    scale = SIZE / (bottom - top)
    # The middle of the body's widest row.
    widths = [(mask[y].sum(), y) for y in range(top, bottom + 1)]
    widest = max(widths)[1]
    xs = np.nonzero(mask[widest])[0]
    middle = (xs.min() + xs.max()) / 2
    w, h = int(image.width * scale), int(image.height * scale)
    big = image.resize((w, h))
    canvas = Image.new("RGB", (int(SIZE * 1.6), int(SIZE * 1.5)), (19, 35, 50))
    # Base at 90% down, middle at the center.
    canvas.paste(big, (int(canvas.width / 2 - middle * scale), int(canvas.height * 0.9 - bottom * scale)))
    return canvas, mask_of(canvas)


def outline(mask):
    edge = mask & ~(np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1))
    return edge


def main():
  for view in ("front", "back", "left", "right", "top", "bottom", "hero"):
      sheet, sheet_mask = normalized(HERE / "reference" / f"{view}.png")
      model, model_mask = normalized(HERE / "renders" / f"{view}.png")
      union = (sheet_mask | model_mask).sum()
      iou = (sheet_mask & model_mask).sum() / union
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
      out.save(HERE / "renders" / f"overlay-{view}.png")
      print(f"{view}: overlap {iou:.1%}")


if __name__ == "__main__":
    main()
