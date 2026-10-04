"""Keep all sheet views at their original pixel scale."""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
BOXES = {
    "front": (66, 186, 243, 366),
    "back": (254, 186, 404, 363),
    "left": (419, 186, 603, 359),
    "right": (624, 186, 801, 359),
    "top": (810, 161, 934, 354),
    "bottom": (989, 169, 1112, 350),
    "hero": (1143, 143, 1430, 409),
}

if __name__ == "__main__":
    image = Image.open(HERE / "reference/sheet.png")
    for name, box in BOXES.items():
        image.crop(box).save(HERE / "reference" / f"{name}.png")
