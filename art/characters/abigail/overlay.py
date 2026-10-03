"""Lay the sheet views over the reference crops, to judge proportions.

uv run --with pillow art/characters/abigail/overlay.py

Writes renders/overlay.png: each view as the reference, the model, and the
two blended, with the model's outline in red over the reference.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

HERE = Path(__file__).resolve().parent
panels = []
for name in ("front", "side", "back"):
    reference = Image.open(HERE / "reference" / f"{name}.png").convert("RGBA")
    model = Image.open(HERE / "renders" / f"sheet-{name}.png").convert("RGBA").resize(reference.size, Image.LANCZOS)
    alpha = model.getchannel("A").point(lambda a: 255 if a > 128 else 0)
    edge = ImageChops.subtract(alpha.filter(ImageFilter.MaxFilter(5)), alpha)
    red = Image.new("RGBA", reference.size, (230, 30, 30, 255))
    outlined = reference.copy()
    outlined.paste(red, mask=edge)
    plain = Image.new("RGBA", reference.size, (255, 255, 255, 255))
    plain.alpha_composite(model)
    blended = Image.blend(reference, plain, 0.5)
    for image in (outlined, plain, blended):
        panels.append(image.resize((image.width * 700 // image.height, 700), Image.LANCZOS))
sheet = Image.new("RGB", (sum(p.width for p in panels) + 10 * len(panels), 700), (255, 255, 255))
x = 0
for panel in panels:
    sheet.paste(panel.convert("RGB"), (x, 0))
    x += panel.width + 10
sheet.save(HERE / "renders" / "overlay.png")
print("overlay", HERE / "renders" / "overlay.png")
