"""Measure warm-stone contours, separate rock pieces, face opening and eyes.

Polygons label overlaps in the drawing. The measured pixels inside them
determine each outline. Upright drawings win over the conflicting labels.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tools"))
from common import blobs, mask_of
from crop import BOXES

HEIGHT = 151
UNIT = 0.62
# Parts touching the main body are split at their visible seams.
REGIONS = {
    "front": {"body": [(455,174),(535,174),(549,215),(547,230),(530,246),(520,264),(480,270),(465,257),(441,232)],
              "cap": [(458,130),(532,130),(532,175),(458,175)],
              "foot": [(430,231),(453,231),(464,250),(459,279),(447,287),(429,269)],
              "float": [(425,169),(455,169),(455,207),(425,207)]},
    "back": {"body": [(631,175),(704,175),(718,219),(715,231),(700,250),(690,269),(649,272),(628,252),(614,229)],
             "cap": [(632,130),(707,130),(707,176),(632,176)]},
    "left": {"body": [(783,178),(865,174),(880,212),(875,239),(858,271),(820,271),(790,241),(780,220)],
             "cap": [(800,130),(865,130),(865,172),(800,172)],
             "foot": [(831,229),(850,245),(858,267),(846,285),(824,282),(810,266),(813,246)]},
    "right": {"body": [(449,383),(523,383),(538,420),(532,456),(510,478),(479,478),(450,449),(440,416)],
              "cap": [(459,337),(526,337),(526,380),(459,380)]},
}
BOTTOMS = {"front":285,"back":285,"left":286,"right":489}

def region(mask, points, origin):
    image = Image.new("1", (mask.shape[1], mask.shape[0]))
    ImageDraw.Draw(image).polygon([(x-origin[0],y-origin[1]) for x,y in points], fill=1)
    return mask & np.asarray(image, dtype=bool)

def outline(mask, middle, bottom):
    rows=[]
    for y in range(mask.shape[0]):
        xs=np.flatnonzero(mask[y])
        if len(xs): rows.append([(bottom-y)*UNIT/HEIGHT,(xs.min()-middle)*UNIT/HEIGHT,(xs.max()-middle)*UNIT/HEIGHT])
    return rows

def measure(view):
    image=Image.open(HERE/"reference"/f"{view}.png").convert("RGB")
    rgb=np.asarray(image).astype(int)
    mask=mask_of("rock",image)
    ox,oy,_,_=BOXES[view]
    bottom=BOTTOMS[view]-oy
    body=region(mask,REGIONS[view]["body"],(ox,oy))
    p=max(blobs(body),key=len)
    middle=(p[:,1].min()+p[:,1].max())/2
    data={"center_pixel":float(middle+ox),"bottom_pixel":BOTTOMS[view]}
    debug=np.asarray(image).copy()
    for name,poly in REGIONS[view].items():
        part=region(mask,poly,(ox,oy))
        largest=max(blobs(part,8),key=len)
        part=np.zeros_like(part);part[largest[:,0],largest[:,1]]=True
        data[name]=outline(part,middle,bottom)
        debug[part]=[90,190,160] if name=="body" else [210,100,170]
    if view=="front":
        bright=(rgb[...,0]>235)&(rgb[...,1]>170)&(rgb[...,2]<170)
        eyes=sorted(blobs(bright,8),key=len,reverse=True)[:2]
        data["eyes"]=[{"x":float((p[:,1].mean()-middle)*UNIT/HEIGHT),"z":float((bottom-p[:,0].mean())*UNIT/HEIGHT),"width":float(np.ptp(p[:,1])*UNIT/HEIGHT),"height":float(np.ptp(p[:,0])*UNIT/HEIGHT)} for p in sorted(eyes,key=lambda p:p[:,1].mean())]
        # The dark inset is surrounded by warm body pixels. Store its
        # octagonal border in original pixels, then convert in build.py.
        data["cavity_pixels"]=[[468,232],[480,220],[514,220],[529,232],[527,246],[516,254],[479,254],[468,247]]
    Image.fromarray(debug).save(HERE/"renders"/f"measure-{view}.png")
    return data

def main():
    data={view:measure(view) for view in REGIONS}
    full=np.asarray(Image.open(HERE/"reference/sheet.png").convert("RGB"))
    data["swatches"]=["#"+"".join(f"{v:02X}" for v in np.median(full[989:1020,x:x+25].reshape(-1,3),axis=0).astype(int)) for x in (48,112,180,308)]
    data["meters_per_pixel"]=UNIT/HEIGHT
    data["sheet_height_m"]=UNIT
    previous=json.loads((HERE/"sheet.json").read_text()) if (HERE/"sheet.json").exists() else {}
    data["hero"]=previous.get("hero",{"turn":20,"elevation":30})
    (HERE/"sheet.json").write_text(json.dumps(data,indent=2)+"\n")
    print("swatches",data["swatches"],"eyes",data["front"]["eyes"])

if __name__=="__main__":main()
