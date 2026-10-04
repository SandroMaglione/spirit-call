"""Finds the camera of a spirit's isometric render: scores renders from many turns and elevations against it (silhouette overlap, eye positions) and writes the best into its sheet.json ("hero").

    SWEEP=/tmp/sweep blender --background --python art/spirits/tools/render.py -- <spirit>
    uv run --with pillow --with numpy art/spirits/tools/sweep_score.py <spirit> /tmp/sweep
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import eyes_in, folder  # noqa: E402
from overlay import normalized  # noqa: E402


def score(spirit, sheet_path, render_path):
    sheet, sheet_mask = normalized(spirit, sheet_path)
    model, model_mask = normalized(spirit, render_path)
    iou = (sheet_mask & model_mask).sum() / (sheet_mask | model_mask).sum()
    a, b = eyes_in(spirit, sheet), eyes_in(spirit, model)
    eye_error = np.mean([np.hypot(x1 - x2, y1 - y2) for (x1, y1), (x2, y2) in zip(a, b)]) / 400 if len(a) == len(b) == 2 else 1.0
    return iou, eye_error


def main(spirit, sweep):
    here = folder(spirit)
    results = []
    for path in sorted(Path(sweep).glob("sweep*.png")):
        turn, elevation = (int(x) for x in path.stem[5:].split("_"))
        iou, eye_error = score(spirit, here / "reference" / "hero.png", path)
        results.append((iou - eye_error, turn, elevation, iou, eye_error))
    for r in sorted(results, reverse=True)[:5]:
        print(f"turn {r[1]:4d}°  elevation {r[2]:2d}°  overlap {r[3]:.1%}  eyes off {r[4]:.3f}")
    best = max(results)
    sheet = json.loads((here / "sheet.json").read_text())
    sheet["hero"] = {"turn": best[1], "elevation": best[2]}
    (here / "sheet.json").write_text(json.dumps(sheet, indent=1))
    print(f"isometric camera: {best[1]}° turn, {best[2]}° up")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
