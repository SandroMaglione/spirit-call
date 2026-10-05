"""Assemble same-scale reference comparisons and phone-size evidence."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/"tools"))
from overlay import normalized

BACKGROUND=(16,32,45)
board=Image.new("RGB",(1300,1100),BACKGROUND)
draw=ImageDraw.Draw(board)
draw.text((24,12),"ROCK SPIRIT / REVISED STATIC MODEL / deliberate departures from reference",fill=(235,222,201))
for i,view in enumerate(("front","back","left","right")):
    x=(i%2)*650;y=40+(i//2)*370
    draw.text((x+20,y),view.upper()+"  |  sheet / model",fill=(226,195,157))
    for j,folder in enumerate(("reference","renders")):
        image,_=normalized("rock",HERE/folder/f"{view}.png")
        image=image.crop((0,90,640,565)).resize((320,330))
        board.paste(image,(x+j*325,y+26))
draw.text((20,795),"GAME CAMERA / 30 degree elevation",fill=(226,195,157))
image=Image.open(HERE/"renders/game.png").convert("RGB")
image.thumbnail((290,280));board.paste(image,(20,817))
draw.text((350,795),"GAME SIZE / actual 30 x 32 px, enlarged 8x",fill=(226,195,157))
small=Image.open(HERE/"renders/game-size.png").convert("RGB")
board.paste(small.resize((240,256),Image.Resampling.NEAREST),(350,825))
board.paste(small,(630,930))
draw.text((730,825),"Eyes: friendly round shapes inside the main boulder.",fill=(211,216,220))
draw.text((730,855),"Feet: two independent, grounded faceted stones.",fill=(211,216,220))
draw.text((730,885),"Rear: short angular heel, with a flat grounded sole.",fill=(211,216,220))
info=json.loads((HERE/"export.json").read_text())
draw.text((730,925),f"{info['triangles']} triangles / 3 materials / no clips or bones",fill=(211,216,220))
board.save(HERE/"renders/review.png")
print("wrote renders/review.png")
