"""A spirit beside its sheet: the sheet's front, left, and isometric views next to the model's, and the game's camera: `<spirit>/renders/compare.png`.

    uv run --with pillow art/spirits/tools/compare.py <spirit>
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import folder  # noqa: E402

H = 420


def main(spirit):
    here = folder(spirit)

    def scaled(path):
        image = Image.open(path).convert("RGB")
        return image.resize((int(image.width * H / image.height), H))

    items = []
    for view in ("front", "left", "hero"):
        items += [scaled(here / "reference" / f"{view}.png"), scaled(here / "renders" / f"{view}.png")]
    items.append(scaled(here / "renders" / "game.png"))
    out = Image.new("RGB", (sum(i.width for i in items) + 20 * len(items), H), (20, 30, 44))
    x = 0
    for item in items:
        out.paste(item, (x, 0))
        x += item.width + 20
    out.save(here / "renders" / "compare.png")
    print(f"wrote {spirit}/renders/compare.png")


if __name__ == "__main__":
    main(sys.argv[1])
