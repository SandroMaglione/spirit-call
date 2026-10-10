"""Compose honest review panels and score the dimension-normalized front.

The comparison keeps the original drawing's proportions. Only the overlay
uses independent X/Z pixel-to-meter scales from the sheet's overall labels.
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE=Path(__file__).resolve().parent
OUT=HERE/"renders"
SHEET=json.loads((HERE/"sheet.json").read_text())
FONT="/System/Library/Fonts/Supplemental/Arial.ttf"
font=ImageFont.truetype(FONT,22)
small=ImageFont.truetype(FONT,16)
BG="#101c2b"

def paste_model(panel,name,box,tight=False):
    im=Image.open(OUT/f"{name}.png").convert("RGBA")
    if tight:
        im=im.crop(im.getchannel("A").getbbox())
        im=im.resize((round(im.width*box[3]/im.height),box[3]),Image.Resampling.LANCZOS)
    im.thumbnail((box[2],box[3]),Image.Resampling.LANCZOS)
    panel.paste(im,(box[0]+(box[2]-im.width)//2,box[1]+(box[3]-im.height)//2),im)

def components(mask):
    seen=np.zeros_like(mask)
    result=[]
    h,w=mask.shape
    for y,x in zip(*np.where(mask)):
        if seen[y,x]:continue
        todo=deque([(int(y),int(x))]);seen[y,x]=True;comp=[]
        while todo:
            a,b=todo.popleft();comp.append((a,b))
            for c,d in ((a-1,b),(a+1,b),(a,b-1),(a,b+1)):
                if 0<=c<h and 0<=d<w and mask[c,d] and not seen[c,d]:
                    seen[c,d]=True;todo.append((c,d))
        if len(comp)>300:result.append(comp)
    return sorted(result,key=len,reverse=True)

def filled(mask):
    h,w=mask.shape
    outside=np.zeros_like(mask)
    todo=deque()
    for x in range(w):todo.extend(((0,x),(h-1,x)))
    for y in range(h):todo.extend(((y,0),(y,w-1)))
    while todo:
        y,x=todo.popleft()
        if not (0<=y<h and 0<=x<w) or outside[y,x] or mask[y,x]:continue
        outside[y,x]=True
        todo.extend(((y-1,x),(y+1,x),(y,x-1),(y,x+1)))
    return ~outside

reference=Image.open(HERE/"reference/front.png").convert("RGB")
rgb=np.asarray(reference).astype(float)
candidate=(rgb[:,:,2]>145)&(rgb[:,:,1]>100)&((rgb[:,:,2]-rgb[:,:,0]>15)|(rgb.min(axis=2)>160))
mask=np.zeros(candidate.shape,dtype=bool)
groups=components(candidate)
for comp in groups[:5]:
    ys,xs=zip(*comp);mask[ys,xs]=True
mask=filled(mask)
# Transform from reference crop pixels to the measured Blender front camera.
sx,sy=SHEET["image_size"][0]/1824,SHEET["image_size"][1]/1361
ax=SHEET["meters_per_pixel_x"]*1000/.99/sx
ay=SHEET["meters_per_pixel_z"]*1000/.99/sy
bx=450+(78-SHEET["center_px"])*SHEET["meters_per_pixel_x"]*1000/.99
by=500-(SHEET["ground_px"]-243)*SHEET["meters_per_pixel_z"]*1000/.99+.4*1000/.99
render=Image.open(OUT/"front.png").convert("RGBA")
aligned=render.transform(reference.size,Image.Transform.AFFINE,(ax,0,bx,0,ay,by),Image.Resampling.BICUBIC)
model_mask=np.asarray(aligned)[:,:,3]>128
intersection=np.logical_and(mask,model_mask).sum()
union=np.logical_or(mask,model_mask).sum()
score=float(intersection/union)
overlay=np.zeros((*mask.shape,4),dtype=np.uint8)
overlay[mask&model_mask]=(195,233,255,255)
overlay[mask&~model_mask]=(255,127,92,255)
overlay[~mask&model_mask]=(64,239,211,255)
Image.fromarray(overlay).save(OUT/"overlay-front.png")
scores={"front_dimension_normalized_iou":score,
    "basis":"Overall width/height labels applied with separate X and Z pixel scales. Original side drawing is oblique; no side/back score claimed.",
    "reference_mask_components":len(groups),"scored_components":5,
    "reference_pixels":int(mask.sum()),"model_pixels":int(model_mask.sum()),
    "legend":{"pale":"intersection","orange":"reference only","mint":"model only"}}
(OUT/"overlap.json").write_text(json.dumps(scores,indent=2)+"\n")

panel=Image.new("RGB",(1480,820),BG);draw=ImageDraw.Draw(panel)
draw.text((30,22),"Ice Spirit / static model against the supplied front",font=font,fill="#d9efff")
draw.text((36,67),"Original reference",font=small,fill="#9db7d2")
draw.text((502,67),"Static model",font=small,fill="#9db7d2")
draw.text((1000,67),f"Silhouette overlay / {score:.1%} IoU",font=small,fill="#9db7d2")
ys,xs=np.where(mask)
bbox=(int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
ref=reference.crop(bbox)
ref=ref.resize((round(ref.width*580/ref.height),580),Image.Resampling.LANCZOS)
panel.paste(ref,(35+(445-ref.width)//2,120))
paste_model(panel,"front",(490,120,450,580),tight=True)
ov=Image.fromarray(overlay).crop(bbox)
ov=ov.resize((round(ov.width*580/ov.height),580),Image.Resampling.LANCZOS)
panel.paste(ov,(990+(460-ov.width)//2,120),ov)
draw.text((30,767),"Comparison keeps original proportions. Overlay follows the stated 0.55 m width and 0.80 m height.",font=small,fill="#9db7d2")
draw.text((30,794),"Overlay: pale = overlap; orange = reference only; mint = model only.",font=small,fill="#9db7d2")
panel.save(OUT/"review-reference.png")

panel=Image.new("RGB",(1560,1100),BG);draw=ImageDraw.Draw(panel)
draw.text((25,22),"Ice Spirit / static model from eight cameras",font=font,fill="#d9efff")
for i,name in enumerate(("front","hero","right","back","left","top","bottom","game")):
    x=(i%4)*390;y=(i//4)*520+65
    draw.text((x+20,y),name.title() if name!="game" else "Game camera / 30°",font=small,fill="#a8cbeb")
    paste_model(panel,name,(x+8,y+25,374,450))
panel.save(OUT/"review-angles.png")

panel=Image.new("RGB",(1000,760),BG);draw=ImageDraw.Draw(panel)
draw.text((26,20),"Ice Spirit / static game-camera readability",font=font,fill="#d9efff")
paste_model(panel,"game",(15,65,580,670))
for i,size in enumerate((32,64)):
    im=Image.open(OUT/f"game-{size}.png").convert("RGBA")
    y=130+i*295
    draw.text((625,y-35),f"{size} px, actual size and 4× nearest-neighbor",font=small,fill="#a8cbeb")
    panel.paste(im,(625,y),im)
    zoom=im.resize((size*4,size*4),Image.Resampling.NEAREST)
    panel.paste(zoom,(710,y),zoom)
panel.save(OUT/"review-game-size.png")
hero=Image.new("RGB",(900,1000),BG)
paste_model(hero,"hero",(0,0,900,1000))
hero.save(OUT/"preview.png")
print(json.dumps(scores,indent=2))
