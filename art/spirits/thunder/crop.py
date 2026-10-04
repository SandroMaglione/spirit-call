"""Keep the supplied sheet and its individual views at their original scale."""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent / "reference"
BOXES = {
    "front": (65, 290, 292, 523), "right": (350, 290, 507, 523),
    "back": (535, 290, 778, 523), "left": (798, 290, 949, 523),
    "top": (47, 642, 245, 817), "bottom": (296, 651, 489, 817),
    "hero": (1212, 30, 1422, 245),
}

if __name__ == "__main__":
    image = Image.open(HERE / "sheet.png")
    for name, box in BOXES.items():
        image.crop(box).save(HERE / f"{name}.png")
