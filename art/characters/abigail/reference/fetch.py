"""Fetch the official Eternal Return sheet for Abigail and cut it into views.

uv run --with pillow art/characters/abigail/reference/fetch.py

The sheet is Nimble Neuron's art (https://playeternalreturn.com/posts/news/1337),
used as the input of a fan study; it is downloaded, never committed.
Each view is cut on the sheet's shared ground line, so pixel rows mean
the same height in every view (`SHEET` in proportions.py).
"""
import urllib.request
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
URL = "https://cdn.playeternalreturn.com/2023%2F08%2F07%2F1691381155331-69_Abigail.png"
# Boxes on the 4250 × 2500 sheet: (left, top, right, bottom).
VIEWS = {"front": (560, 300, 1380, 2420), "side": (1440, 300, 1990, 2420), "back": (1990, 300, 2870, 2420),
         "face": (800, 330, 1100, 620), "face-side": (1560, 330, 1830, 620)}

sheet = HERE / "sheet.png"
if not sheet.exists():
    urllib.request.urlretrieve(URL, sheet)
image = Image.open(sheet).convert("RGBA")
white = Image.new("RGBA", image.size, (255, 255, 255, 255))
white.alpha_composite(image)
for name, box in VIEWS.items():
    white.convert("RGB").crop(box).save(HERE / f"{name}.png")
print("views:", ", ".join(VIEWS))
