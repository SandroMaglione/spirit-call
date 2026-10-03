"""Paint Abigail's texture: the palette cells and her face.

uv run --with pillow art/characters/abigail/paint.py

One 512 px atlas holds everything (one material for the whole body): flat
cells and gradients from palette.json, and the face in its square, painted
as seen from the front (figure.py projects the head's front onto it).
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
palette = json.loads((HERE / "palette.json").read_text())
SIZE = palette["size"]
SCALE = 4  # Painted larger, then reduced: smooth edges.


def rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


atlas = Image.new("RGB", (SIZE * SCALE, SIZE * SCALE), rgb(palette["cells"]["skin"]["fill"]))
draw = ImageDraw.Draw(atlas)
for name, cell in palette["cells"].items():
    x, y, w, h = (v * SCALE for v in cell["rect"])
    fill = cell["fill"]
    if isinstance(fill, str):
        draw.rectangle([x, y, x + w - 1, y + h - 1], fill=rgb(fill))
        continue
    stops = [rgb(c) for c in fill]
    for row in range(h):
        t = row / (h - 1) * (len(stops) - 1)
        k = min(int(t), len(stops) - 2)
        draw.line([x, y + row, x + w - 1, y + row], fill=mix(stops[k], stops[k + 1], t - k))

# The face square: 256 px for 0.15 m of her face, seen from the front.
fx, fy, fw, fh = (v * SCALE for v in palette["face"]["rect"])
px = fw / 0.15  # pixels per meter


def at(x, z):
    """A point on her face (meters; x to her left, z height) in atlas pixels."""
    return fx + (x + 0.075) * px, fy + (1.535 - z) * px


cells = {name: rgb(cell["fill"]) for name, cell in palette["cells"].items() if isinstance(cell["fill"], str)}
skin, lash, green = cells["skin"], cells["lash"], cells["eyeGreen"]
face = Image.new("RGBA", atlas.size, (0, 0, 0, 0))
paint = ImageDraw.Draw(face)

# Blush, soft: painted on its own layer and blurred.
blush = Image.new("RGBA", atlas.size, (0, 0, 0, 0))
for side in (-1, 1):
    cx, cy = at(side * 0.03, 1.448)
    ImageDraw.Draw(blush).ellipse([cx - 9 * SCALE, cy - 3 * SCALE, cx + 9 * SCALE, cy + 3 * SCALE], fill=(250, 160, 160, 26))
blush = blush.filter(ImageFilter.GaussianBlur(4 * SCALE))

for side in (-1, 1):
    # Her eyes: centers 27 mm from the middle, 1.47 m high; tall anime irises.
    cx, cy = at(side * 0.027, 1.470)
    w, h = 23 * SCALE, 17 * SCALE
    # The white of the eye, then the iris (darker at its top), its pupil, and two highlights.
    paint.ellipse([cx - w, cy - h * 0.9, cx + w, cy + h], fill=(250, 250, 252, 255))
    iw, ih = 14 * SCALE, 17 * SCALE
    paint.ellipse([cx - iw, cy - ih, cx + iw, cy + ih], fill=green + (255,))
    paint.ellipse([cx - iw, cy - ih, cx + iw, cy + ih * 0.1], fill=mix(green, (20, 70, 60), 0.55) + (255,))
    paint.ellipse([cx - iw * 0.45, cy - ih * 0.45, cx + iw * 0.45, cy + ih * 0.45], fill=(18, 60, 48, 255))
    paint.ellipse([cx - iw * 0.75, cy + ih * 0.25, cx + iw * 0.75, cy + ih * 0.85], fill=mix(green, (190, 255, 220), 0.45) + (255,))
    hx = cx - side * iw * 0.35
    paint.ellipse([hx - 4 * SCALE, cy - ih * 0.62, hx + 4 * SCALE, cy - ih * 0.62 + 7 * SCALE], fill=(255, 255, 255, 255))
    # The upper lash line: thick, down at the inner corner, winged at the outer one.
    inner, outer = cx - side * w, cx + side * w
    top = cy - h * 0.95
    lash_line = [(inner, cy - h * 0.35), (cx - side * w * 0.5, top), (cx + side * w * 0.4, top - 1 * SCALE),
                 (outer + side * 5 * SCALE, cy - h * 0.55), (outer + side * 2 * SCALE, cy - h * 0.25),
                 (cx + side * w * 0.4, top + 5 * SCALE), (cx - side * w * 0.5, top + 5 * SCALE), (inner, cy - h * 0.15)]
    paint.polygon(lash_line, fill=lash + (255,))
    # Clip the eye's white and iris to below the lash line: anything above it is skin again.
    paint.polygon([(inner - side * 4 * SCALE, cy - h * 0.2), (inner - side * 4 * SCALE, cy - h * 1.5),
                   (outer + side * 8 * SCALE, cy - h * 1.5), (outer + side * 8 * SCALE, cy - h * 0.6),
                   (cx + side * w * 0.4, top - 1 * SCALE), (cx - side * w * 0.5, top)], fill=skin + (255,))
    paint.polygon(lash_line, fill=lash + (255,))
    # The lower lash, a thin short line.
    paint.line([(cx + side * w * 0.35, cy + h * 0.98), (outer - side * 1 * SCALE, cy + h * 0.6)], fill=mix(lash, skin, 0.45) + (255,), width=2 * SCALE)
    # Eyebrows: thin, high, mostly behind her fringe.
    bx, by = at(side * 0.03, 1.497)
    paint.line([(bx - side * 13 * SCALE, by + 2 * SCALE), (bx + side * 12 * SCALE, by - 1 * SCALE)], fill=(70, 62, 68, 255), width=3 * SCALE)

# A hint of a nose, and a small, calm mouth.
nx, ny = at(0.002, 1.448)
paint.line([(nx, ny - 3 * SCALE), (nx - 2 * SCALE, ny + 2 * SCALE)], fill=(222, 170, 160, 255), width=2 * SCALE)
mx, my = at(0, 1.428)
paint.line([(mx - 6 * SCALE, my), (mx + 6 * SCALE, my)], fill=rgb(palette["cells"]["mouth"]["fill"]) + (255,), width=3 * SCALE)

atlas = atlas.convert("RGBA")
atlas.alpha_composite(blush)
atlas.alpha_composite(face)
atlas.convert("RGB").resize((SIZE, SIZE), Image.LANCZOS).save(HERE / "texture.png")
print("painted", HERE / "texture.png")
