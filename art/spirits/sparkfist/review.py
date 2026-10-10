"""Compose comparisons from actual model renders at matching camera and scale."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "renders"
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
font = ImageFont.truetype(FONT, 24)
small = ImageFont.truetype(FONT, 17)
BG = "#101c2b"

def model(panel, path, box):
    im = Image.open(path).convert("RGBA")
    im.thumbnail(box[2:], Image.Resampling.LANCZOS)
    panel.paste(im, (box[0]+(box[2]-im.width)//2, box[1]+(box[3]-im.height)//2), im)

panel = Image.new("RGB", (1200, 780), BG)
d = ImageDraw.Draw(panel)
d.text((25,20), "Ice source → Sparkfist / same geometry, camera and scale", font=font, fill="#eee3ff")
for i, (name, root) in enumerate((("Ice source", HERE.parent/"ice"/"renders"), ("Sparkfist", OUT))):
    d.text((35+i*600,65), name, font=small, fill="#ffe476")
    model(panel, root/"hero.png", (i*600,90,600,650))
panel.save(OUT/"review-comparison.png")
panel = Image.new("RGB", (1560,1100), BG)
d = ImageDraw.Draw(panel)
d.text((25,22), "Sparkfist / static model", font=font, fill="#eee3ff")
for i,name in enumerate(("front","hero","right","back","left","top","bottom","game")):
    x=(i%4)*390; y=(i//4)*520+65
    d.text((x+20,y), name.title() if name != "game" else "Game camera / 30°", font=small, fill="#c8a8fa")
    model(panel, OUT/f"{name}.png", (x+8,y+25,374,450))
panel.save(OUT/"review-angles.png")
panel = Image.new("RGB", (1000,760), BG)
d = ImageDraw.Draw(panel)
d.text((26,20), "Sparkfist / static game-camera readability", font=font, fill="#eee3ff")
model(panel, OUT/"game.png", (15,65,580,670))
for i,size in enumerate((32,64)):
    im=Image.open(OUT/f"game-{size}.png").convert("RGBA")
    y=130+i*295
    d.text((625,y-35), f"{size} px, actual size and 4×", font=small, fill="#c8a8fa")
    panel.paste(im,(625,y),im)
    zoom=im.resize((size*4,size*4),Image.Resampling.NEAREST)
    panel.paste(zoom,(710,y),zoom)
panel.save(OUT/"review-game-size.png")
panel=Image.new("RGB",(900,1000),BG)
model(panel,OUT/"hero.png",(0,0,900,1000))
panel.save(OUT/"preview.png")
