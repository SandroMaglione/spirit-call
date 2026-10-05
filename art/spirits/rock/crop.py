"""Keep the supplied Rock Spirit views at their original pixel scale."""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent / "reference"
BOXES = {
    "front": (421, 126, 570, 289), "back": (597, 126, 738, 289),
    "left": (764, 126, 890, 289), "right": (431, 332, 567, 491),
    "top": (594, 335, 748, 492), "bottom": (758, 337, 900, 486),
    "hero": (39, 129, 370, 484),
}

if __name__ == "__main__":
    image = Image.open(HERE / "sheet.png")
    for name, box in BOXES.items():
        image.crop(box).save(HERE / f"{name}.png")
