"""Measure purple outlines, bright eyes, and gold bolts from the supplied sheet.

The polygons label touching parts, rather than replacing measured contours.
All four upright crops share the sheet's pixel scale. The full 220 pixel
front height is 0.62 m; contradictory printed width labels do not rescale it.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tools"))
from common import blobs, holes
from crop import BOXES

UNIT = 220
BOTTOM = 519
# Part labels in original sheet pixels. Body masks include the eyes and
# lightning drawn over the side, but exclude the fins attached at its edge.
REGIONS = {
    "front": [(111, 392), (246, 392), (246, 455), (241, 480), (225, 501), (205, 514), (151, 514), (124, 492), (114, 476)],
    "back": [(590, 390), (714, 390), (721, 458), (710, 488), (691, 507), (622, 519), (598, 489), (588, 469)],
    "right": [(351, 395), (494, 395), (494, 517), (351, 517)],
    "left": [(813, 394), (946, 394), (946, 517), (813, 517)],
}
CRESTS = {
    "front": [(185,297),(200,341),(184,370),(197,381),(187,392),(153,389),(166,373),(163,341)],
    "back": [(653,297),(675,340),(661,366),(674,383),(667,391),(634,390),(641,368),(637,338)],
    "right": [(426,297),(428,325),(418,351),(421,364),(440,373),(446,385),(420,393),(398,385),(409,371),(395,365),(399,343)],
    "left": [(887,297),(898,326),(907,351),(906,364),(889,369),(886,378),(899,388),(858,392),(851,380),(866,371),(889,367),(880,340),(878,319)],
}

def polygon(shape, points, origin):
    image = Image.new("1", (shape[1], shape[0]))
    ImageDraw.Draw(image).polygon([(x-origin[0], y-origin[1]) for x,y in points], fill=1)
    return np.asarray(image, dtype=bool)

def purple(im):
    return (im[..., 2]-im[..., 0]>20) & (im[..., 2]-im[..., 1]>18)

def gold(im):
    return (im[..., 0]>190) & (im[..., 0]-im[..., 2]>28) & (im[..., 1]>160)

def outline(mask, middle, bottom):
    result=[]
    for y in range(mask.shape[0]):
        xs=np.nonzero(mask[y])[0]
        if len(xs): result.append([(bottom-y)/UNIT, (xs.min()-middle)/UNIT, (xs.max()-middle)/UNIT])
    return result

def measure(name):
    image=Image.open(HERE/"reference"/f"{name}.png").convert("RGB")
    im=np.asarray(image).astype(int)
    ox,oy,_,_=BOXES[name]
    body_mask=purple(im) & polygon(im.shape, REGIONS[name], (ox,oy))
    body=max(blobs(body_mask),key=len)
    mask=np.zeros(im.shape[:2],dtype=bool); mask[body[:,0],body[:,1]]=True
    # Fill eye and lightning holes before taking its row outlines.
    bbox=(body[:,0].min(),body[:,0].max(),body[:,1].min(),body[:,1].max())
    for piece in holes(mask,bbox):mask[piece[:,0],piece[:,1]]=True
    middle=(body[:,1].min()+body[:,1].max())/2
    bottom=BOTTOM-oy
    data={"center_pixel":float(middle+ox),"outline":outline(mask,middle,bottom)}
    crest_mask=purple(im) & polygon(im.shape,CRESTS[name],(ox,oy))
    crest=max(blobs(crest_mask),key=len)
    cm=np.zeros_like(mask);cm[crest[:,0],crest[:,1]]=True
    data["crest"]=outline(cm,middle,bottom)
    if name=="front":
        white=(im.min(axis=2)>232)&mask
        eyes=sorted(blobs(white,35),key=len,reverse=True)[:2]
        data["eyes"]=[{"offset":float((p[:,1].mean()-middle)/UNIT),"height":float((bottom-p[:,0].mean())/UNIT),"wide":float(np.ptp(p[:,1])/UNIT),"tall":float(np.ptp(p[:,0])/UNIT)} for p in eyes]
    # Save masks to make the part separation reviewable.
    debug=image.copy(); pixels=np.asarray(debug).copy()
    pixels[mask]=[75,210,200];pixels[cm]=[235,110,190]
    Image.fromarray(pixels).save(HERE/"renders"/f"measure-{name}.png")
    return data

def main():
    data={name:measure(name) for name in REGIONS}
    # Bolt corners and halo bounds are sampled at actual contour changes.
    # Coordinates are original sheet pixels, front for X/Z, right for Y/Z.
    data["bolt_front"]=[[74,404],[108,430],[123,469],[111,466],[122,494],[94,476],[80,454],[101,465],[85,438]]
    data["bolt_side"]=[[457,402],[443,441],[425,449],[436,459],[403,495],[410,469],[391,475],[405,446]]
    data["fin_front"]=[[100,450],[118,463],[125,480],[113,476],[123,493],[106,482]]
    data["halo"]={"center_y":375,"left":104,"right":255,"front_depth_pixels":34,"side_width_pixels":139}
    previous=json.loads((HERE/"sheet.json").read_text()) if (HERE/"sheet.json").exists() else {}
    data["hero"]=previous.get("hero",{"turn":30,"elevation":20})
    data["meters_per_pixel"]=0.62/UNIT
    (HERE/"sheet.json").write_text(json.dumps(data,indent=1))
    for name in REGIONS:
        print(name,"body bounds",min(r[0] for r in data[name]["outline"]),max(r[0] for r in data[name]["outline"]))
    print("eyes",data["front"]["eyes"])

if __name__=="__main__":main()
