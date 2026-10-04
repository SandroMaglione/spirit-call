"""Enlarge a reference crop with original sheet pixel coordinates."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw
here=Path(__file__).resolve().parents[1]/sys.argv[1]/'production'
view=sys.argv[2]
box=json.loads((here/'spirit.json').read_text())['crops'][view]
im=Image.open(here/'reference/sheet.png').crop(box).resize(((box[2]-box[0])*3,(box[3]-box[1])*3))
d=ImageDraw.Draw(im)
for x in range((box[0]//20+1)*20,box[2],20):
    xx=(x-box[0])*3;d.line((xx,0,xx,im.height),fill='#B03D65');d.text((xx,3),str(x),fill='black')
for y in range((box[1]//20+1)*20,box[3],20):
    yy=(y-box[1])*3;d.line((0,yy,im.width,yy),fill='#B03D65');d.text((0,yy),str(y),fill='black')
im.save(here/'renders'/f'grid-{view}.png')
