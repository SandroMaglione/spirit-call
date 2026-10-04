"""Finds the sheet's hero view's camera: scores renders at many turns and elevations (render.py with SWEEP) by silhouette overlap and eye positions, and writes the best into sheet.json.

    SWEEP=/tmp/sweep blender --background --python art/spirits/water/render.py
    uv run --with pillow --with numpy art/spirits/water/sweep_score.py /tmp/sweep
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from overlay import normalized  # noqa: E402
from sheet import blobs  # noqa: E402


def eyes(image):
    im = np.asarray(image).astype(int)
    found = [p for p in blobs(im.min(axis=2) > 230, 30)]
    return sorted((p[:, 1].mean(), p[:, 0].mean()) for p in found)


def score(sheet_path, render_path):
    sheet, sheet_mask = normalized(sheet_path)
    model, model_mask = normalized(render_path)
    iou = (sheet_mask & model_mask).sum() / (sheet_mask | model_mask).sum()
    a, b = eyes(sheet), eyes(model)
    eye_error = np.mean([np.hypot(x1 - x2, y1 - y2) for (x1, y1), (x2, y2) in zip(a, b)]) / 400 if len(a) == len(b) == 2 else 1.0
    return iou, eye_error


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    results = []
    for path in sorted(folder.glob("sweep*.png")):
        turn, elevation = (int(x) for x in path.stem[5:].split("_"))
        iou, eye_error = score(HERE / "reference" / "hero.png", path)
        results.append((iou - eye_error, turn, elevation, iou, eye_error))
    for r in sorted(results, reverse=True)[:8]:
        print(f"turn {r[1]:4d}°  elevation {r[2]:2d}°  overlap {r[3]:.1%}  eyes off {r[4]:.3f}")
    import json
    best = max(results)
    sheet = json.loads((HERE / "sheet.json").read_text())
    sheet["hero"] = {"turn": best[1], "elevation": best[2]}
    (HERE / "sheet.json").write_text(json.dumps(sheet, indent=1))
    print("hero view:", best[1], "° turn,", best[2], "° up")
