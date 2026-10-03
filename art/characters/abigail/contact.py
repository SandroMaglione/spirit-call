"""Assemble rendered poses into one labelled sheet: renders/poses.png.

uv run --with pillow art/characters/abigail/contact.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent / "renders"
labels = json.loads((HERE / "poses.json").read_text())
images = [Image.open(HERE / f"pose-{i:02d}.png").convert("RGBA") for i in range(len(labels))]
w, h = images[0].size
columns = 7
sheet = Image.new("RGB", (w * columns, (h + 24) * ((len(images) + columns - 1) // columns)), (232, 230, 224))
draw = ImageDraw.Draw(sheet)
for i, (image, label) in enumerate(zip(images, labels)):
    x, y = (i % columns) * w, (i // columns) * (h + 24)
    sheet.paste(image, (x, y), image)
    draw.text((x + 8, y + h + 4), label, fill=(40, 40, 40))
sheet.save(HERE / "poses.png")
