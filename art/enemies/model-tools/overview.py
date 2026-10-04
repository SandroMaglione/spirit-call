"""Assemble the three static model-review renders, without changing the models."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'

def font(size):return ImageFont.truetype(FONT,size)

board=Image.new('RGB',(1440,790),'#E0E3EC')
draw=ImageDraw.Draw(board)
draw.text((32,24),'Warden / Stalker / Volatile',font=font(34),fill='#242B3D')
draw.text((32,70),'Static models for review | 30 degree game camera | each model framed separately',font=font(19),fill='#51596B')
for i,kind in enumerate(('warden','stalker','volatile')):
    here=ROOT/kind/'production';audit=json.loads((here/'audit.json').read_text())
    x=i*480
    draw.text((x+28,115),kind.capitalize(),font=font(29),fill='#242B3D')
    im=Image.open(here/'renders/game.png').convert('RGBA').resize((460,460),Image.Resampling.LANCZOS)
    board.paste(im,(x+10,150),im)
    draw.text((x+28,602),f'{audit["triangles"]:,} triangles / one material',font=font(20),fill='#242B3D')
    tiny=Image.open(here/'renders/game-size.png').convert('RGBA')
    board.paste(tiny,(x+30,656),tiny)
    big=tiny.resize((tiny.width*3,tiny.height*3),Image.Resampling.NEAREST)
    board.paste(big,(x+90,644),big)
    draw.text((x+195,653),f'{tiny.width}px frame\nNative and 3x pixels',font=font(18),fill='#51596B')
draw.text((32,751),'No rigs or animation. Arena scale and runtime glow come after model review.',font=font(20),fill='#51596B')
path=ROOT/'warden-stalker-volatile-review.png';board.save(path)
print(path)

faces=Image.new('RGB',(1440,570),'#E0E3EC');draw=ImageDraw.Draw(faces)
draw.text((28,18),'Angry faces / static model revision',font=font(30),fill='#242B3D')
for i,kind in enumerate(('warden','stalker','volatile')):
    x=i*480
    draw.text((x+24,70),kind.capitalize(),font=font(24),fill='#242B3D')
    im=Image.open(ROOT/kind/'production/renders/face-front.png').convert('RGBA').resize((460,460),Image.Resampling.LANCZOS)
    faces.paste(im,(x+10,102),im)
path=ROOT/'warden-stalker-volatile-faces.png';faces.save(path);print(path)
