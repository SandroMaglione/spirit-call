"""Assemble the ten rendered clip poses into a review sheet."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
names = ("Idle","Run","AttackA","AttackB","AttackC","Power","Dash","Hurt","Cast","Ultimate")
sheet = Image.new("RGB",(1500,840),"#101c2b")
draw = ImageDraw.Draw(sheet)
font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
title = ImageFont.truetype(font_path,32)
label = ImageFont.truetype(font_path,21)
small = ImageFont.truetype(font_path,17)
draw.text((28,22),"WATER SPIRIT / ANIMATION POSES",font=title,fill="#b6e6ff")
draw.text((28,66),"10 clips · 30 fps · game-controlled movement and contact timing",font=small,fill="#91adc4")
for index, name in enumerate(names):
    x,y = (index%5)*300,112+(index//5)*354
    draw.rounded_rectangle((x+10,y,x+290,y+340),radius=9,fill="#17283b")
    pose = Image.open(HERE/"renders"/"animation"/f"{name}.png").convert("RGBA")
    pose.thumbnail((260,290),Image.Resampling.LANCZOS)
    sheet.paste(pose,(x+(300-pose.width)//2,y+4),pose)
    draw.text((x+150,y+304),name,font=label,fill="#e2f5ff",anchor="mt")
draw.text((28,812),"Key poses; use the animation reel or interactive viewer to review motion and blending.",font=small,fill="#91adc4")
sheet.save(HERE/"renders"/"animation-poses.png")
