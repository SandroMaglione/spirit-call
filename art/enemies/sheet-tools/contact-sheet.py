"""Compose the static model handoff, including readable phone-size samples."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(__file__).resolve().parent/'review-models.png'
names={'charger':'Firebomber','sniper':'Sniper','guardian':'Guardian'}
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',30)
small=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',18)
canvas=Image.new('RGB',(1536,720),'#DDDDE6');draw=ImageDraw.Draw(canvas)
for index,(kind,name) in enumerate(names.items()):
 here=ROOT/kind/'production';audit=json.loads((here/'audit.json').read_text())
 image=Image.open(here/'renders/hero.png').convert('RGBA').resize((512,512))
 canvas.paste(image,(index*512,58),image)
 draw.text((index*512+28,22),name,font=font,fill='#252536')
 draw.text((index*512+28,563),f"{audit['triangles']:,} triangles",font=small,fill='#484654')
 phone=Image.open(here/'renders/game-size.png').convert('RGBA')
 draw.text((index*512+28,606),'Game camera at phone size',font=small,fill='#484654')
 canvas.paste(phone,(index*512+40,644),phone)
 enlarged=phone.resize((phone.width*2,phone.height*2),Image.Resampling.NEAREST)
 canvas.paste(enlarged,(index*512+110,636),enlarged)
canvas.save(OUT)
print(OUT)

# Closeups for the face and held-bomb iteration. Sniper's eyes face sideways.
details=Image.new('RGB',(1600,460),'#DDDDE6');draw=ImageDraw.Draw(details)
for index,(kind,view,label) in enumerate((('charger','face-front','Firebomber'),
                                         ('sniper','face-left','Sniper'),
                                         ('guardian','face-front','Guardian'),
                                         ('charger','hand-bomb','Hand bomb'))):
 image=Image.open(ROOT/kind/'production/renders'/f'{view}.png').convert('RGBA').resize((400,400))
 details.paste(image,(index*400,60),image)
 draw.text((index*400+22,20),label,font=font,fill='#252536')
details.save(OUT.with_name('review-faces.png'))
print(OUT.with_name('review-faces.png'))
