"""Make a compact review board from the saved game-camera renders."""
from pathlib import Path
import json
from PIL import Image, ImageDraw
from review import font

ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'production-tools/review';out.mkdir(exist_ok=True)
board=Image.new('RGB',(1440,650),'#E3E4EA')
draw=ImageDraw.Draw(board)
draw.text((28,22),'Enemy models | static review',font=font(32),fill='#252C3C')
draw.text((28,65),'30 degree game camera. Each model framed separately.',font=font(20),fill='#526074')
for i,kind in enumerate(('shooter','brute','swarmer')):
    here=ROOT/kind/'production';audit=json.loads((here/'audit.json').read_text())
    im=Image.open(here/'renders/game.png').convert('RGBA')
    box=im.getchannel('A').getbbox();im=im.crop(box)
    ratio=min(410/im.width,405/im.height)
    im=im.resize((round(im.width*ratio),round(im.height*ratio)))
    x=i*480+240-im.width//2;y=535-im.height
    board.paste(im,(x,y),im)
    draw.text((i*480+35,565),kind.capitalize(),font=font(28),fill='#252C3C')
    draw.text((i*480+35,603),f"{audit['triangles']:,} triangles · one material",font=font(19),fill='#526074')
board.save(out/'models.png')
print(out/'models.png')
