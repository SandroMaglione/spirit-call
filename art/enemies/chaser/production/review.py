"""Score every sheet view, fit its hero camera, and compose review boards.

The spirits' overlay and sweep workflow adapted for an articulated enemy.
Meshes use render alpha; the sheet uses warm-color pixels and filled holes.
Only uniform scale and translation are fitted, never silhouette deformation.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[2]/"spirits/tools"))
from common import blobs,holes
from sheet import mask_of

BG=(19,35,50)
VIEWS=("front","back","left","right","top","bottom","hero")
FONT=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf",20)
SMALL=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf",16)

def content(path):
    image=Image.open(path).convert("RGBA")
    if "reference" in path.parts:
        mask=mask_of(image)
        pieces=blobs(mask,15)
        clean=np.zeros_like(mask)
        for p in pieces:
            if len(p)>50: clean[p[:,0],p[:,1]]=True
        for p in holes(clean,(0,clean.shape[0]-1,0,clean.shape[1]-1)):
            clean[p[:,0],p[:,1]]=True
        # Discard the blue grid entirely for comparison and camera fitting.
        arr=np.asarray(image).copy();arr[:,:,3]=clean.astype(np.uint8)*255
        image=Image.fromarray(arr);mask=clean
    else: mask=np.asarray(image)[:,:,3]>127
    ys,xs=np.nonzero(mask)
    box=(int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
    return image.crop(box)

def normalized(path,size=340,canvas=(560,440)):
    image=content(path)
    scale=size/image.height
    image=image.resize((round(image.width*scale),size),Image.Resampling.LANCZOS)
    out=Image.new("RGBA",canvas,(0,0,0,0))
    out.alpha_composite(image,((canvas[0]-image.width)//2,(canvas[1]-image.height)//2))
    return out,np.asarray(out)[:,:,3]>127

def shifted(image,dx,dy):
    out=Image.new("RGBA",image.size,(0,0,0,0))
    out.alpha_composite(image,(dx,dy))
    return out

def score(reference,model,search=16):
    ref,rm=normalized(reference);mod,mm=normalized(model)
    best=(0,0,0)
    for dy in range(-search,search+1,2):
        for dx in range(-search,search+1,2):
            moved=np.roll(mm,(dy,dx),(0,1))
            iou=float(np.logical_and(rm,moved).sum()/np.logical_or(rm,moved).sum())
            if iou>best[0]:best=(iou,dx,dy)
    mod=shifted(mod,best[1],best[2]);mm=np.asarray(mod)[:,:,3]>127
    return best,ref,mod,rm,mm

def outline(mask):
    return mask&~(np.roll(mask,1,0)&np.roll(mask,-1,0)&np.roll(mask,1,1)&np.roll(mask,-1,1))

def eyes(image):
    arr=np.asarray(image).astype(int)
    mask=(arr[:,:,0]>190)&(arr[:,:,1]>145)&(arr[:,:,2]<145)&(arr[:,:,3]>127)
    pieces=sorted(blobs(mask,2),key=len,reverse=True)[:2]
    return sorted((float(p[:,1].mean()),float(p[:,0].mean())) for p in pieces)

def background(image):
    out=Image.new("RGBA",image.size,(*BG,255));out.alpha_composite(image)
    return out.convert("RGB")

def main():
    if "--sweep" in sys.argv:
        results=[]
        for path in sorted((HERE/"renders/sweep").glob("sweep*.png")):
            turn,elevation=map(int,path.stem[5:].split("_"))
            best,ref,mod,*_=score(HERE/"reference/hero.png",path)
            a,b=eyes(ref),eyes(mod)
            error=float(np.mean([np.hypot(x1-x2,y1-y2) for (x1,y1),(x2,y2) in zip(a,b)])/340) if len(a)==len(b)==2 else 1.0
            results.append({"turn":turn,"elevation":elevation,"iou":best[0],"eye_error":error,"score":best[0]-error})
        results.sort(key=lambda r:r["score"],reverse=True)
        sheet=json.loads((HERE/"sheet.json").read_text())
        sheet["hero"]={k:results[0][k] for k in ("turn","elevation")}
        (HERE/"sheet.json").write_text(json.dumps(sheet,indent=2)+"\n")
        (HERE/"renders/camera-sweep.json").write_text(json.dumps(results,indent=2)+"\n")
        print("best hero cameras",results[:4]);return
    scores={};cells=[]
    for view in VIEWS:
        best,ref,mod,rm,mm=score(HERE/"reference"/f"{view}.png",HERE/"renders"/f"{view}.png")
        scores[view]={"silhouette_iou":best[0],"translation_pixels":list(best[1:])}
        a,b=background(ref),background(mod)
        blend=Image.blend(a,b,.5)
        ar=np.asarray(blend).copy();ar[outline(rm)]=(255,220,60);ar[outline(mm)]=(255,65,65)
        blend=Image.fromarray(ar)
        out=Image.new("RGB",(1120,480),BG)
        out.paste(a,(0,35));out.paste(blend,(560,35))
        ImageDraw.Draw(out).text((16,10),f"{view}  {best[0]:.1%} silhouette IoU. Yellow sheet / red model",font=FONT,fill="white")
        out.save(HERE/"renders"/f"overlay-{view}.png")
        cell=blend.resize((420,330));label=Image.new("RGB",(420,365),BG)
        label.paste(cell,(0,35));ImageDraw.Draw(label).text((12,8),f"{view}  {best[0]:.1%}",font=FONT,fill="white")
        cells.append(label)
    grid=Image.new("RGB",(4*420,2*365),BG)
    for i,cell in enumerate(cells):grid.paste(cell,((i%4)*420,(i//4)*365))
    ImageDraw.Draw(grid).text((3*420+24,400),"Uniform scale and translation only.\nNo deformation to improve scores.\n\nThe rear and side claw drawings\nare inconsistent across views.",font=FONT,fill="white",spacing=10)
    grid.save(HERE/"renders/overlay-all.png")
    (HERE/"renders/overlap.json").write_text(json.dumps(scores,indent=2)+"\n")
    # Designer comparison includes the actual 30 degree arena camera.
    compare=Image.new("RGB",(1680,970),BG)
    draw=ImageDraw.Draw(compare)
    for j,view in enumerate(("front","right","hero")):
        for k,folder in enumerate(("reference","renders")):
            im,_=normalized(HERE/folder/f"{view}.png",340,(560,420))
            x=j*560;y=k*455+40
            compare.paste(background(im),(x,y))
            draw.text((x+20,y-28),f"{view} / {'sheet' if k==0 else 'model'}",font=FONT,fill="white")
    draw.text((20,945),"Static model review. No rig, clips, export or game registration.",font=SMALL,fill=(178,194,211))
    compare.save(HERE/"renders/compare.png")
    # One compact angle board for review, including rear and top silhouette.
    board=Image.new("RGB",(1500,1030),BG);draw=ImageDraw.Draw(board)
    audit=json.loads((HERE/"audit.json").read_text())
    draw.text((30,20),f"CHASER / STATIC MODEL     {audit['triangles']:,} triangles / one palette material",font=FONT,fill="white")
    for i,view in enumerate(("hero","other-three-quarter","rear-three-quarter","front","right","top")):
        im,_=normalized(HERE/"renders"/f"{view}.png",365,(500,430))
        x=(i%3)*500;y=(i//3)*465+65
        board.paste(background(im),(x,y));draw.text((x+20,y+425),view,font=FONT,fill="white")
    draw.text((30,1000),"1.8 m high. Front and side contours measured from the supplied sheet. Separate editable armor shells.",font=SMALL,fill=(178,194,211))
    board.save(HERE/"renders/review.png")
    sizes=Image.new("RGB",(1000,450),BG);draw=ImageDraw.Draw(sizes)
    draw.text((24,20),"30 degree game camera / pixel-size readability",font=FONT,fill="white")
    for i,size in enumerate((32,48,64)):
        im=Image.open(HERE/"renders"/f"game-size-{size}.png").convert("RGBA")
        x=30+i*330
        draw.text((x,75),f"{size} px canvas / native",font=SMALL,fill="white")
        sizes.paste(background(im),(x,110))
        sizes.paste(background(im.resize((256,256),Image.Resampling.NEAREST)),(x,170))
    sizes.save(HERE/"renders/review-game-size.png")
    print(json.dumps(scores,indent=2))

if __name__=="__main__":main()
