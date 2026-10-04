"""Compose the two saved game-camera renders for the model handoff."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
board=Image.new('RGB',(1280,760),'#DFDFE8')
draw=ImageDraw.Draw(board)
font_path='/System/Library/Fonts/Supplemental/Arial.ttf'
title=ImageFont.truetype(font_path,28)
text=ImageFont.truetype(font_path,20)
for i,(kind,label) in enumerate((('gale-caster','Gale Caster'),('juggernaut','Juggernaut'))):
    here=ROOT/kind/'production'
    triangles=json.loads((here/'audit.json').read_text())['triangles']
    image=Image.open(here/'renders/game.png').resize((600,600))
    x=640*i
    board.paste(image,(x+20,70),image)
    draw.text((x+30,24),label,font=title,fill='#252C3C')
    draw.text((x+30,690),f'{triangles:,} triangles | one material | static model',font=text,fill='#252C3C')
draw.text((30,728),'Model review before rigging and animation',font=text,fill='#526074')
board.save(ROOT/'gale-juggernaut-review.png')
