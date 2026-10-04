"""Lays the renders under the sheet's matching views, same height: renders/compare.png."""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
NAMES = ["hero", "front", "side", "back", "top"]
H = 300
rows = []
for folder in ("reference", "renders"):
    images = []
    for name in NAMES:
        im = Image.open(HERE / folder / f"{name}.png").convert("RGB")
        if folder == "reference":
            # Trim the sheet's labels under each view.
            im = im.crop((0, 0, im.width, int(im.height * (0.86 if name != "hero" else 0.9))))
        images.append(im.resize((int(im.width * H / im.height), H)))
    rows.append(images)
width = max(sum(i.width for i in row) for row in rows) + 10 * len(NAMES)
sheet = Image.new("RGB", (width, H * 2 + 10), (19, 35, 50))
for r, row in enumerate(rows):
    x = 0
    for im in row:
        sheet.paste(im, (x, r * (H + 10)))
        x += im.width + 10
sheet.save(HERE / "renders" / "compare.png")
print("wrote renders/compare.png")
