"""Create reference overlays, angle cards and native 32/64 px samples."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE=Path(__file__).resolve().parent
OUT=HERE/"renders"
S=json.loads((HERE/"sheet.json").read_text())
info=json.loads((HERE/"export.json").read_text())
BG=(16,28,43)
font_path="/System/Library/Fonts/Supplemental/Arial.ttf"
font=ImageFont.truetype(font_path,26);small=ImageFont.truetype(font_path,17)

def mask(im):
    a=np.array(im.convert("RGB")).astype(float)
    return ((a[:,:,2]>58)&(a[:,:,2]>a[:,:,0]+12)&(a[:,:,2]>a[:,:,1]*.96)) | (a.sum(axis=2)>450)

def composited(path,size):
    im=Image.open(path).convert("RGBA");im.thumbnail(size,Image.Resampling.LANCZOS)
    return im

def card(size):return Image.new("RGB",size,BG)

def paste_fit(canvas,path,box):
    im=composited(path,(box[2]-box[0],box[3]-box[1]))
    canvas.paste(im,(box[0]+(box[2]-box[0]-im.width)//2,box[1]+(box[3]-box[1]-im.height)//2),im)

# Preserve the traced coordinates, a single pixel-to-meter scale, and fixed
# camera. No separate X/Z scaling or per-part alignment inflates the score.
sheet=Image.open(HERE/"reference/sheet.png").convert("RGB")
box=S["views"]["front"];crop=sheet.crop(box)
ref_mask=Image.fromarray((mask(crop)*255).astype("uint8"))
factor=S["meters_per_pixel"]*700/.85
size=(round(crop.width*factor),round(crop.height*factor))
pos=(round(350+(box[0]-S["center_px"])*factor),round(350+(box[1]-(S["ground_px"]-.3/S["meters_per_pixel"]))*factor))
mapped=Image.new("L",(700,700));mapped.paste(ref_mask.resize(size,Image.Resampling.NEAREST),pos)
render=Image.open(OUT/"reference.png").convert("RGBA")
a=np.array(mapped)>127;b=np.array(render)[:,:,3]>127
score=float((a&b).sum()/(a|b).sum())
overlay=card((700,700));rgb=np.array(overlay)
rgb[a&b]=(57,113,147);rgb[a&~b]=(242,203,88);rgb[b&~a]=(234,98,112)
overlay=Image.fromarray(rgb);overlay.save(OUT/"overlay-front.png")
(HERE/"reference-review.json").write_text(json.dumps({
    "front_silhouette_iou":score,"alignment":"Fixed traced coordinates, one uniform pixel scale; native camera turn 16 deg, elevation 0 deg.",
    "limitations":"Mask overlap only. Does not measure color, depth or view consistency. Oblique side/rear images are qualitative references.",
    "asset_sha256":info["sha256"]},indent=2)+"\n")

canvas=card((1350,600));d=ImageDraw.Draw(canvas)
d.text((28,23),"Water Spirit / static model and reference",font=font,fill="#d9efff")
for title,x in (("Supplied front",28),("Static model, matching view",465),("Silhouette overlay",902)):
    d.text((x,69),title,font=small,fill="#9db7d2")
reference_display=card((700,700))
reference_display.paste(crop.resize(size,Image.Resampling.LANCZOS),pos)
canvas.paste(reference_display.resize((423,423),Image.Resampling.LANCZOS),(15,104))
paste_fit(canvas,OUT/"reference.png",(450,104,873,540))
paste_fit(canvas,OUT/"overlay-front.png",(885,104,1308,540))
d.text((28,558),f"Front silhouette overlap {score:.1%}. Yellow: sheet only. Red: model only. Rear depth is interpreted.",font=small,fill="#9db7d2")
canvas.save(OUT/"review-reference.png")

canvas=card((1280,760));d=ImageDraw.Draw(canvas)
d.text((25,20),"Water Spirit / static geometry from eight cameras",font=font,fill="#d9efff")
for i,name in enumerate(("hero","front","back","left","right","top","bottom","game")):
    x=(i%4)*320;y=60+(i//4)*340
    d.text((x+20,y+8),name.replace("game","Game camera").capitalize(),font=small,fill="#9db7d2")
    paste_fit(canvas,OUT/f"{name}.png",(x+5,y+37,x+315,y+337))
canvas.save(OUT/"review-angles.png")

canvas=card((1100,730));d=ImageDraw.Draw(canvas)
d.text((30,25),"WATER SPIRIT",font=ImageFont.truetype(font_path,38),fill="#a7eafd")
d.text((31,74),"Static crescent-shell study",font=small,fill="#8eabc5")
shadow=Image.new("RGBA",canvas.size);sd=ImageDraw.Draw(shadow)
sd.ellipse((218,610,769,661),fill=(0,8,16,170));shadow=shadow.filter(ImageFilter.GaussianBlur(14))
canvas.paste(shadow,(0,0),shadow)
paste_fit(canvas,OUT/"hero.png",(105,105,850,689))
d.text((840,175),"0.60 m",font=font,fill="#a7eafd")
d.text((840,212),"Provisional height",font=small,fill="#8eabc5")
d.text((840,267),f"{info['triangles']:,} triangles",font=font,fill="#d9efff")
d.text((840,305),"2 materials",font=small,fill="#8eabc5")
d.text((840,338),"9 editable parts",font=small,fill="#8eabc5")
for i,color in enumerate(S["swatches"].values()):
    d.rounded_rectangle((840+i*42,399,874+i*42,433),radius=4,fill=color)
d.text((840,469),"Geometry only",font=small,fill="#8eabc5")
canvas.save(OUT/"preview.png")

canvas=card((1000,430));d=ImageDraw.Draw(canvas)
d.text((25,20),"Water Spirit / game-camera readability",font=font,fill="#d9efff")
paste_fit(canvas,OUT/"game.png",(20,75,370,413))
for x,n in ((460,32),(725,64)):
    im=Image.open(OUT/f"game-{n}.png").convert("RGBA")
    canvas.paste(im,(x,95),im)
    enlarged=im.resize((192,192),Image.Resampling.NEAREST)
    canvas.paste(enlarged,(x-20,180),enlarged)
    d.text((x-20,390),f"{n} px, native + enlarged",font=small,fill="#9db7d2")
canvas.save(OUT/"review-game-size.png")
print(json.dumps({"front_silhouette_iou":score,"cards":4},indent=2))
