"""Assemble the rendered pose sheet and gameplay-size samples."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE/'renders'
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)
names = ['Idle','Run','AttackA','AttackB','AttackC','Power','Dash','Hurt','Cast','Ultimate']
sheet = Image.new('RGB',(1500,875),'#101a27')
d = ImageDraw.Draw(sheet)
d.text((24,18),'Hearth / animation contact poses',font=font,fill='#f3e7dd')
d.text((24,53),'Rigid stone bowl, attached eyes, basin-anchored flame, floating supports. All clips play in place.',font=small,fill='#b6c4d5')
for i, name in enumerate(names):
    x, y = (i%5)*300, 85+(i//5)*390
    picture = Image.open(OUT/'animation'/f'{name}.png').convert('RGBA')
    picture.thumbnail((295,350), Image.Resampling.LANCZOS)
    sheet.paste(picture,(x+(300-picture.width)//2,y),picture)
    d.text((x+18,y+348),name,font=font,fill='#ffd175')
sheet.save(OUT/'animation-poses.png')
phone = Image.new('RGB',(950,330),'#101a27')
d = ImageDraw.Draw(phone)
d.text((20,18),'Hearth / 32 px and 64 px at the game camera',font=font,fill='#f3e7dd')
for i, name in enumerate(['Idle','Run','Power','Cast','Ultimate']):
    pic = Image.open(OUT/'animation'/f'{name}.png').convert('RGBA')
    pic = pic.crop(pic.getchannel('A').getbbox())
    x = 25+i*185
    for size,y in [(32,95),(64,190)]:
        image = pic.resize((round(size*pic.width/pic.height),size),Image.Resampling.LANCZOS)
        # Show the precise pixels four times larger beside their native sample.
        phone.paste(image,(x,y),image)
        enlarged = image.resize((image.width*2,image.height*2),Image.Resampling.NEAREST)
        phone.paste(enlarged,(x+55,y-20),enlarged)
    d.text((x,295),name,font=small,fill='#ffd175')
phone.save(OUT/'animation-game-size.png')
print('Saved animation contact sheet and game-size review')
