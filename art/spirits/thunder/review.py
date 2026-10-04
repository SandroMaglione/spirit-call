"""Arrange actual Blender renders for the model review, without repainting."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/"tools"))
from common import mask_of
OUT=HERE/"renders"
FONT_PATH="/System/Library/Fonts/Supplemental/Arial.ttf"
FONT=ImageFont.truetype(FONT_PATH,24)
TITLE=ImageFont.truetype(FONT_PATH,36)
BG=(240,241,245)
INK=(52,46,96)

def fit(path,size):
    image=Image.open(path).convert("RGB")
    image.thumbnail(size,Image.Resampling.LANCZOS)
    result=Image.new("RGB",size,BG)
    result.paste(image,((size[0]-image.width)//2,(size[1]-image.height)//2))
    return result

def figure(path):
    image=Image.open(path).convert("RGB")
    ys,xs=np.nonzero(mask_of("thunder",image))
    image=image.crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
    scale=400/image.height
    image=image.resize((round(image.width*scale),400),Image.Resampling.LANCZOS)
    result=Image.new("RGB",(420,480),BG)
    result.paste(image,((420-image.width)//2,40))
    return result

def main():
    board=Image.new("RGB",(1600,1260),BG);draw=ImageDraw.Draw(board)
    draw.text((32,22),"Thunder Spirit / first model review",font=TITLE,fill=INK)
    draw.text((32,72),"Actual Blender renders. Static model only, before animation and game integration.",font=FONT,fill=INK)
    for i,(view,label) in enumerate([( "front","Front"),("right","Right"),("back","Back"),("left","Left"),("hero","Reference camera"),("game","Game camera / 30 degrees down")]):
        x=(i%3)*530+10;y=(i//3)*560+130
        board.paste(fit(OUT/f"{view}.png",(510,520)),(x,y))
        draw.text((x+20,y+522),label,font=FONT,fill=INK)
    board.save(OUT/"review-angles.png")
    compare=Image.new("RGB",(2520,620),BG);draw=ImageDraw.Draw(compare)
    draw.text((28,18),"Reference sheet / 3D model",font=TITLE,fill=INK)
    for i,view in enumerate(("front","right","hero")):
        for j,folder in enumerate((HERE/"reference",OUT)):
            x=i*840+j*420
            compare.paste(figure(folder/f"{view}.png"),(x,80))
            draw.text((x+20,574),f"{view} / {'sheet' if j==0 else 'model'}",font=FONT,fill=INK)
    compare.save(OUT/"review-reference.png")
    phone=Image.new("RGB",(1050,800),BG);draw=ImageDraw.Draw(phone)
    draw.text((28,20),"Game camera and size check",font=TITLE,fill=INK)
    phone.paste(fit(OUT/"game.png",(650,650)),(0,95))
    small=Image.open(OUT/"game-size.png").convert("RGB")
    phone.paste(small.resize((240,256),Image.Resampling.NEAREST),(730,180))
    phone.paste(small,(840,545))
    draw.text((720,455),"30 x 32 px, enlarged",font=FONT,fill=INK)
    draw.text((770,605),"Actual pixels",font=FONT,fill=INK)
    phone.save(OUT/"review-game-size.png")
    print("review boards written")

if __name__=="__main__":main()
