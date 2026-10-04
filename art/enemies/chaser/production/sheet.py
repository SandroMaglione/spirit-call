"""Measure the Chaser's separate shells from labeled sheet pixel regions.

Labels separate touching parts; the image mask determines the actual contour.
Front and side contours drive the lofts. Joint centers are sampled from the
drawn joints, rather than from the silhouette of the whole creature.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "spirits/tools"))
from common import blobs, holes
from crop import BOXES

PIXEL = 1.8 / 162
GROUND = {"front": 354, "back": 354, "left": 352, "right": 354}
CENTER = {"front": 156, "back": 330, "left": 529, "right": 685}
# Pixel labels mark visible boundaries between adjoining shells.
REGIONS = {
    "head": {
        "front": [(156,219),(179,234),(188,257),(177,281),(158,298),(138,286),(127,263),(127,243),(143,228)],
        "right": [(746,227),(757,243),(776,266),(779,282),(767,291),(748,282),(728,266),(724,248),(733,236)],
        "left": [(475,227),(490,247),(495,272),(480,285),(460,294),(441,286),(441,265),(452,244)],
    },
    "torso": {
        "back": [(330,217),(351,229),(357,250),(348,274),(340,297),(321,297),(310,278),(305,251),(311,230)],
        "right": [(695,229),(724,232),(747,245),(745,267),(733,286),(713,295),(690,286),(677,266),(679,245)],
        "left": [(492,238),(518,232),(542,241),(553,257),(544,277),(530,291),(510,296),(495,283),(485,262)],
    },
    "crest": {
        "front": [(177,191),(180,213),(189,229),(184,240),(165,239),(148,225),(145,219),(158,205)],
        "back": [(332,191),(338,208),(351,220),(350,236),(340,241),(322,240),(310,227),(318,210)],
        "right": [(633,192),(686,206),(709,218),(721,216),(715,232),(698,242),(680,237),(673,221)],
        "left": [(503,215),(525,218),(554,204),(594,191),(551,218),(541,238),(525,243),(510,232)],
    },
    "claw": {
        "front": [(77,297),(84,301),(94,301),(96,314),(92,329),(96,346),(104,362),(92,356),(82,343),(76,327),(73,310)],
        "right": [(751,302),(770,305),(785,321),(790,335),(792,347),(780,333),(767,326),(753,320)],
        "left": [(443,290),(453,299),(442,313),(435,327),(429,345),(425,347),(425,328),(431,309)],
    },
}

def mask_of(image):
    im = np.asarray(image.convert("RGB")).astype(int)
    # All warm surfaces, including brown recesses and the pale claw. The
    # blue grid and white dimension arrows are outside this color mask.
    warm=(im[..., 0] > 25) & (im[..., 0]-im[..., 2] > 10) & (im[..., 0]-im[..., 1] > 4)
    return warm | (im.min(axis=2)>160)

def polygon(size, points, origin):
    im = Image.new("1", size)
    ImageDraw.Draw(im).polygon([(x-origin[0],y-origin[1]) for x,y in points], fill=1)
    return np.asarray(im, dtype=bool)

def measure(view, part):
    image = Image.open(HERE / "reference" / f"{view}.png")
    ox, oy, _, _ = BOXES[view]
    mask = mask_of(image) & polygon(image.size, REGIONS[part][view], (ox,oy))
    for piece in holes(mask, (0,mask.shape[0]-1,0,mask.shape[1]-1)):
        mask[piece[:,0],piece[:,1]] = True
    rows=[]
    for row in range(mask.shape[0]):
        xs=np.flatnonzero(mask[row])
        if len(xs):
            z=(GROUND[view]-(row+oy))*PIXEL
            lo=(xs.min()+ox-CENTER[view])*PIXEL
            hi=(xs.max()+ox-CENTER[view])*PIXEL
            if view in ("back","right"): lo,hi=-hi,-lo
            rows.append([z,lo,hi])
    return rows,mask

def point(front, right):
    return [(front[0]-CENTER["front"])*PIXEL,
            -(right[0]-CENTER["right"])*PIXEL,
            (GROUND["front"]-front[1])*PIXEL]

def main():
    data={"meters_per_pixel":PIXEL,"ground_pixels":GROUND,"center_pixels":CENTER,
          "regions_pixels":REGIONS,"parts":{},"hero":{"turn":30,"elevation":35}}
    if (HERE/"sheet.json").exists():
        data["hero"]=json.loads((HERE/"sheet.json").read_text())["hero"]
    colors={"head":(67,210,209),"torso":(100,150,240),"crest":(230,110,200),"claw":(245,210,80)}
    debug={v:Image.open(HERE/"reference"/f"{v}.png").convert("RGB") for v in GROUND}
    for part,views in REGIONS.items():
        data["parts"][part]={}
        for view in views:
            rows,mask=measure(view,part)
            data["parts"][part][view]=rows
            im=np.asarray(debug[view]).copy(); im[mask]=colors[part]
            debug[view]=Image.fromarray(im)
    # Endpoints and shell widths sampled from the front and right views.
    # One shared pair of leg shapes keeps the crouch symmetric.
    joints={
        "shoulder": ((118,250),(704,255)),
        "elbow": ((88,280),(717,278)),
        "wrist": ((83,299),(756,303)),
        "hip": ((139,300),(689,297)),
        "knee": ((126,320),(699,324)),
        "ankle": ((123,339),(668,335)),
        "toe": ((116,350),(684,350)),
    }
    data["joints"]={k:point(*v) for k,v in joints.items()}
    data["shell_widths_m"]={"shoulder":24*PIXEL,"upper_arm":14*PIXEL,"forearm":22*PIXEL,
                             "thigh":20*PIXEL,"shin":16*PIXEL,"foot":26*PIXEL}
    # The eye cores are measured separately within the front head label.
    image=Image.open(HERE/"reference/front.png").convert("RGB")
    im=np.asarray(image).astype(int);ox,oy,_,_=BOXES["front"]
    warm=(im[...,0]>170)&(im[...,1]>135)&(im[...,2]<145)
    region=polygon(image.size,[(132,265),(175,265),(175,282),(132,282)],(ox,oy))
    pieces=sorted(blobs(warm&region,3),key=len,reverse=True)[:2]
    data["eyes"]=[{"x":float((p[:,1].mean()+ox-156)*PIXEL),
                   "z":float((354-p[:,0].mean()-oy)*PIXEL),
                   "width":float((np.ptp(p[:,1])+1)*PIXEL),
                   "height":float((np.ptp(p[:,0])+1)*PIXEL)} for p in pieces]
    # Swatches sampled in their centers, plus the sheet's printed palette.
    sheet=np.asarray(Image.open(HERE/"reference/sheet.png").convert("RGB"))
    data["palette"]={"rust":"#A5443A","brown":"#46342E","bone":"#E8D9B7","eye":"#FFD94A"}
    data["sampled_swatches"]={key:np.median(sheet[y-10:y+10,890:930].reshape(-1,3),axis=0).astype(int).tolist()
                              for key,y in (("rust",502),("brown",581),("bone",655),("eye",731))}
    for view,im in debug.items(): im.resize((im.width*3,im.height*3)).save(HERE/"renders"/f"measure-{view}.png")
    (HERE/"sheet.json").write_text(json.dumps(data,indent=2)+"\n")
    print("measured parts",list(data["parts"]),"eyes",data["eyes"])

if __name__ == "__main__": main()
