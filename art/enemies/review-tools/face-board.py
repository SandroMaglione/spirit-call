"""Compare both face revisions under the same lighting and camera."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
board=Image.new('RGB',(1200,970),'#DFDFE8')
draw=ImageDraw.Draw(board)
font='/System/Library/Fonts/Supplemental/Arial.ttf'
title=ImageFont.truetype(font,27);caption=ImageFont.truetype(font,20)
for row,(kind,label) in enumerate((('gale-caster','Gale Caster'),('juggernaut','Juggernaut'))):
    y=row*470
    draw.text((24,y+16),label,font=title,fill='#252C3C')
    for col,(file,text) in enumerate((('face-front-before','Before'),('face-front','Revised front'),('face-three-quarter','Revised ¾'))):
        image=Image.open(ROOT/kind/'production/renders'/f'{file}.png').resize((390,390))
        board.paste(image,(col*400+5,y+76),image)
        draw.text((col*400+24,y+48),text,font=caption,fill='#526074')
draw.text((24,945),'Static models • mirrored facial geometry and colors • before animation',font=caption,fill='#526074')
board.save(ROOT/'gale-juggernaut-faces.png')
