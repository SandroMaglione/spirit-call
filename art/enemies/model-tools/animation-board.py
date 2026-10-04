"""Compose the saved game-camera animation samples for review."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
font=lambda size:ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',size)
board=Image.new('RGB',(1440,1320),'#DFE3EB');draw=ImageDraw.Draw(board)
draw.text((24,16),'Enemy motion / stride, anticipation, contact, follow-through',font=font(28),fill='#243144')
for column,kind in enumerate(('warden','stalker','volatile')):
    actions=[('Run',.15),('Windup',.72),('Windup',1),('Active',.4)]
    if kind=='warden':actions[3]=('Recovery',.35)
    for row,(action,seconds) in enumerate(actions):
        x,y=column*480,row*312+65
        label=['Stride','Anticipation','Contact','Follow-through'][row]
        draw.text((x+20,y),f'{kind.capitalize()} / {label}',font=font(21),fill='#243144')
        im=Image.open(ROOT/kind/f'production/animated/renders/{action}-{seconds:g}.png').convert('RGBA')
        im.thumbnail((440,280),Image.Resampling.LANCZOS)
        board.paste(im,(x+(480-im.width)//2,y+25),im)
path=ROOT/'warden-stalker-volatile-animation.png';board.save(path);print(path)
