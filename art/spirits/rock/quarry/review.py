"""Reference comparisons and whole-silhouette overlap, including the socket.

Scores normalize total height and horizontal center, without stretching
width. Alpha supplies the model silhouette; measured color supplies the
reference. These measure outlines, not material or facial resemblance.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from measure import filled, mask

HERE = Path(__file__).resolve().parent
BG = (17,31,44)
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT = ImageFont.truetype(FONT_PATH,18)
SMALL = ImageFont.truetype(FONT_PATH,14)
TITLE = ImageFont.truetype(FONT_PATH,30)

def normalize(path, model, size=(700,400)):
    image = Image.open(path).convert("RGBA")
    silhouette = np.asarray(image)[...,3] > 128 if model else filled(mask(image))
    ys,xs = np.nonzero(silhouette)
    box = (int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
    image = image.crop(box)
    shape = Image.fromarray(silhouette.astype("uint8")*255).crop(box)
    factor = (size[1]-30)/image.height
    dimensions = (round(image.width*factor),round(image.height*factor))
    image = image.resize(dimensions,Image.Resampling.LANCZOS)
    shape = shape.resize(dimensions,Image.Resampling.NEAREST)
    canvas = Image.new("RGB",size,BG)
    shape_canvas = Image.new("L",size,0)
    offset = ((size[0]-image.width)//2,size[1]-image.height-10)
    canvas.paste(image,offset,image)
    shape_canvas.paste(shape,offset)
    return canvas,np.asarray(shape_canvas)>128

def outline(m):
    return m & ~(np.roll(m,1,0)&np.roll(m,-1,0)&np.roll(m,1,1)&np.roll(m,-1,1))

def main():
    views = ("front","left","back","right","top","bottom","hero")
    board = Image.new("RGB",(1840,1260),BG)
    draw = ImageDraw.Draw(board)
    draw.text((24,18),"QUARRY / REVISED STATIC MODEL",font=TITLE,fill=(235,213,186))
    draw.text((24,57),"Reference left, revision right. Whole-figure height includes the requested floating rock.",font=FONT,fill=(163,189,204))
    overlays = Image.new("RGB",(1840,720),BG)
    scores = {}
    for i,name in enumerate(views):
        ref,a = normalize(HERE/f"reference/{name}.png",False)
        model,b = normalize(HERE/f"renders/{name}.png",True)
        scores[name] = float((a&b).sum()/(a|b).sum())
        x,y = (i%2)*920,90+(i//2)*290
        # Cards are displayed smaller; scoring retains the full images.
        for j,image in enumerate((ref,model)):
            card,_ = normalize(HERE/f"{'reference' if j == 0 else 'renders'}/{name}.png",j == 1,(450,260))
            board.paste(card,(x+j*460,y+26))
        draw.text((x+18,y),f"{name.upper()}  /  silhouette {scores[name]:.1%}",font=SMALL,fill=(166,199,216))
        pixels = np.asarray(Image.blend(ref,model,.5)).copy()
        pixels[outline(a)] = (255,212,55)
        pixels[outline(b)] = (255,82,87)
        overlay = Image.fromarray(pixels)
        od = ImageDraw.Draw(overlay)
        od.text((8,5),f"{name}: {scores[name]:.1%}",font=SMALL,fill="white")
        overlay.save(HERE/f"renders/overlay-{name}.png")
        overlays.paste(overlay.resize((450,330)),(i%4*460,i//4*360))
    game,_ = normalize(HERE/"renders/game.png",True,(450,260))
    board.paste(game,(1380,986))
    draw.text((940,960),"GAME CAMERA / 30 degrees",font=SMALL,fill=(166,199,216))
    small = Image.open(HERE/"renders/game-size.png").convert("RGBA")
    board.paste(small.resize((256,256),Image.Resampling.NEAREST),(985,986),small.resize((256,256),Image.Resampling.NEAREST))
    board.save(HERE/"renders/review-reference.png")
    overlays.save(HERE/"renders/overlay-all.png")
    (HERE/"renders/overlap.json").write_text(json.dumps({"method":"whole silhouette IoU, uniform height normalization, no width stretching", "camera_angles": {"front":[0,0],"left":[-74,10],"back":[180,0],"right":[74,10],"hero":[-30,20]},"scores":scores},indent=2)+"\n")
    print(json.dumps(scores,indent=2))

if __name__ == "__main__":
    main()
