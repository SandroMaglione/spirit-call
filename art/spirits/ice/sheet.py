"""Record sheet landmarks, sample its swatches, and crop the supplied views.

The front drawing controls X/Z. The 0.80/0.55/0.35 m overall labels control
scale. Smaller labels disagree with the drawing and are kept as notes.
Run: uv run --with pillow --with numpy art/spirits/ice/sheet.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
image = Image.open(HERE / "reference/sheet.jpg").convert("RGB")
sx, sy = image.width / 1824, image.height / 1361

def box(coords):
    return tuple(round(v * (sx if i % 2 == 0 else sy)) for i, v in enumerate(coords))

for name, coords in {
    "front": (78, 243, 362, 606),
    "side": (1058, 243, 1236, 606),
    "top": (82, 785, 405, 987),
}.items():
    image.crop(box(coords)).save(HERE / f"reference/{name}.png")

swatches = {}
for name, x in {"white": 122, "ice": 258, "blue": 392, "indigo": 527, "eyes": 666}.items():
    rgb = np.median(np.asarray(image.crop(box((x-12, 1200, x+12, 1230)))).reshape(-1, 3), axis=0)
    swatches[name] = "#" + "".join(f"{int(v):02x}" for v in rgb)

# These are traced vertices of the actual front drawing, in sheet pixels.
# Lists run clockwise from the top. The face is an opening in the ice shell.
data = {
    "image_size": list(image.size),
    "landmark_coordinate_size": [1824, 1361],
    "height_m": 0.8, "width_m": 0.55, "depth_m": 0.35,
    "center_px": 222, "ground_px": 596, "top_px": 252,
    "meters_per_pixel_x": 0.55 / (354-88),
    "meters_per_pixel_z": 0.8 / (596-252),
    "body_outline": [[222,252],[302,411],[286,463],[222,596],[154,463],[138,411]],
    "body_shoulders": {"left": [174,330], "right": [267,330]},
    "body_lower_corners": {"left": [187,509], "right": [255,509]},
    "face_outline": [[222,367],[269,432],[266,470],[222,504],[176,470],[174,432]],
    "shards": {
        "Shard.Upper.L": [[106,359],[128,409],[111,462],[88,410]],
        "Shard.Upper.R": [[334,359],[354,409],[332,462],[312,410]],
        "Shard.Lower.L": [[126,470],[175,512],[190,571],[138,529]],
        "Shard.Lower.R": [[314,471],[304,530],[255,570],[270,512]],
    },
    "eyes_px": {"centers": [[204,446],[240,446]], "width": 15, "height": 39},
    "swatches": swatches,
    "reference_policy": [
        "Front silhouette and face landmarks control the shape.",
        "Overall labels control height, width and depth; X and Z pixel scales differ.",
        "The side drawing is oblique; do not call it an orthographic side benchmark.",
        "No back view is supplied; rear facets continue the crystal volume.",
        "The crown joins the body as drawn; its own origin is at Z=0.73 m.",
        "The lower shards are slanted blades, not upright copies of the upper shards.",
    ],
}
(HERE / "sheet.json").write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps({"swatches": swatches, "scales": [data["meters_per_pixel_x"], data["meters_per_pixel_z"]]}))
