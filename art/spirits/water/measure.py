"""Compares the model's silhouette with the sheet's, view by view: half-widths at each height, as fractions of the body's height.

    uv run --with pillow --with numpy art/spirits/water/measure.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent


def silhouette(path, nub_gap=True):
    im = np.asarray(Image.open(path).convert("RGB")).astype(int)
    mask = ((im[..., 2] > 120) & (im[..., 2] - im[..., 0] > 50)) | (im.min(axis=2) > 225)
    # Only the body: from the row under the nub's gap to the last row before the shadow.
    rows = [y for y in range(mask.shape[0]) if mask[y].sum() > 2]
    runs, start = [], rows[0]
    for a, b in zip(rows, rows[1:] + [10**9]):
        if b != a + 1:
            runs.append((start, a))
            start = b
    top, bottom = max(runs, key=lambda r: r[1] - r[0])
    height = bottom - top
    widths = {}
    for f in np.linspace(0.05, 0.95, 19):
        y = int(bottom - f * height)
        xs = np.nonzero(mask[y])[0]
        widths[round(f, 2)] = (xs.max() - xs.min()) / 2 / height
    return widths


for view in ("front", "side"):
    sheet = silhouette(HERE / "reference" / f"{view}.png")
    model = silhouette(HERE / "renders" / f"{view}.png")
    print(view)
    for f in sheet:
        print(f"  {f:.2f}  sheet {sheet[f]:.3f}  model {model.get(f, 0):.3f}  {model.get(f, 0) - sheet[f]:+.3f}")
