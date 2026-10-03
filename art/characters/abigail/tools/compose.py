"""Crops and enlarges the captured review screenshots into review/ (see review.sh)."""
import glob
import sys
from pathlib import Path

from PIL import Image

tmp, out = Path(sys.argv[1]), Path(sys.argv[2])
# At a phone's size (zoom 0.8): 3x device pixels, then 2x nearest so the pixels stay visible.
game = Image.open(tmp / "game.png").convert("RGB")
game = game.crop((0, 90, game.width, game.height - 110))
game.resize((game.width * 2, game.height * 2), Image.NEAREST).save(out / "game-size-phone.png", optimize=True)
full = Image.open(tmp / "live/full-desktop.png").convert("RGB")
w, h = full.size
full.crop((w // 2 - 700, h // 2 - 420, w // 2 + 700, h // 2 + 420)).save(out / "in-game-desktop.png", optimize=True)
Image.open(tmp / "phone/phone-full.png").convert("RGB").resize((1266, 585), Image.LANCZOS).save(out / "in-game-phone.png", optimize=True)
Image.open(tmp / "menu.png").convert("RGB").resize((1280, 800), Image.LANCZOS).save(out / "menu.png", optimize=True)
# Live frames around her (guard, the four hits, run, dash), enlarged.
files = sorted(f for f in glob.glob(str(tmp / "live/0*.png")) if any(k in f for k in ("guard", "hit", "run", "dash")))[::3][:10]
cw, ch = 150, 175
strip = Image.new("RGB", (cw * 2 * len(files), ch * 2))
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB")
    W, H = im.size
    crop = im.crop((W // 2 - cw // 2, H // 2 - ch // 2 - 25, W // 2 + cw // 2, H // 2 + ch // 2 - 25))
    strip.paste(crop.resize((cw * 2, ch * 2), Image.NEAREST), (i * cw * 2, 0))
strip.save(out / "in-game-frames.png", optimize=True)
