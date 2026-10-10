"""Compare measured reference silhouettes with actual rendered geometry."""
import json
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw,ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE/'renders'
BG = '#101c2b'
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
font = ImageFont.truetype(FONT,25)
small = ImageFont.truetype(FONT,17)


def reference_mask(im):
    a = np.asarray(im.convert('RGB'),dtype=float)
    r,g,b = a[:,:,0],a[:,:,1],a[:,:,2]
    mask = (r>48)&(r>g*1.13)&(r>b*.97)
    # Fill the dark enclosed face and gaps between colors on the stone.
    fill = Image.fromarray(np.uint8(mask)*255).copy()
    ImageDraw.floodfill(fill,(0,0),128)
    return np.asarray(fill)!=128


def fitted(path,is_reference,height=380,width=560):
    im = Image.open(path).convert('RGBA')
    mask = reference_mask(im) if is_reference else np.asarray(im)[:,:,3]>128
    ys,xs = np.nonzero(mask)
    box = (int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1)
    scale = height/(box[3]-box[1])
    cut = im.crop(box)
    cut = cut.resize((round(cut.width*scale),height),Image.Resampling.LANCZOS)
    cropped_mask = Image.fromarray(np.uint8(mask[box[1]:box[3],box[0]:box[2]])*255)
    cropped_mask = cropped_mask.resize(cut.size,Image.Resampling.NEAREST)
    canvas = Image.new('RGBA',(width,height+50),(0,0,0,0))
    mcanvas = Image.new('L',canvas.size,0)
    pos = ((width-cut.width)//2,20)
    if is_reference:
        canvas.paste(cut,pos,cropped_mask)
    else:
        canvas.paste(cut,pos)
    mcanvas.paste(cropped_mask,pos)
    return canvas,np.asarray(mcanvas)>128


def model(panel,name,box):
    im = Image.open(OUT/f'{name}.png').convert('RGBA')
    im.thumbnail(box[2:],Image.Resampling.LANCZOS)
    panel.paste(im,(box[0]+(box[2]-im.width)//2,box[1]+(box[3]-im.height)//2),im)


scores = {}
cells = []
for name in ('front','left','back','right','top','bottom','hero'):
    ref,rm = fitted(HERE/f'reference/{name}.png',True)
    actual,am = fitted(OUT/f'{name}.png',False)
    iou = float((rm&am).sum()/(rm|am).sum())
    scores[name] = {'silhouette_iou':iou,'camera_turn_deg':{'front':0,'left':72,'right':-72,'back':180,'hero':-20}.get(name,0),'camera_elevation_deg':10 if name in ('front','left','back','right') else 16 if name=='hero' else 90 if name=='top' else -90,
                    'normalization':'equal full silhouette height and horizontal bounds center'}
    tile = Image.new('RGB',(1120,495),BG)
    draw = ImageDraw.Draw(tile)
    draw.text((22,15),f'{name.title()} / reference',font=small,fill='#a9bbd4')
    draw.text((582,15),'Static model',font=small,fill='#ffbd70')
    tile.paste(ref,(0,40),ref)
    tile.paste(actual,(560,40),actual)
    tile.save(OUT/f'compare-{name}.png')
    overlay = Image.new('RGB',rm.shape[::-1],BG)
    pixels = np.asarray(overlay).copy()
    pixels[rm] = (204,167,57)
    pixels[am] = (202,64,67)
    pixels[rm&am] = (133,127,92)
    Image.fromarray(pixels).save(OUT/f'overlay-{name}.png')
    cells.append(tile)
grid = Image.new('RGB',(1680,820),BG)
draw = ImageDraw.Draw(grid)
draw.text((24,20),'Hearth / supplied reference and static model',font=font,fill='#f3e7dd')
for i,tile in enumerate(cells[:4]):
    thumb = tile.resize((840,372),Image.Resampling.LANCZOS)
    grid.paste(thumb,((i%2)*840,65+(i//2)*372))
grid.save(OUT/'review-reference.png')
panel = Image.new('RGB',(1520,1080),BG)
draw = ImageDraw.Draw(panel)
draw.text((25,22),'Hearth / static geometry from every side',font=font,fill='#f3e7dd')
for i,name in enumerate(('front','hero','right','back','left','top','bottom','game')):
    x = (i%4)*380
    y = (i//4)*490+65
    draw.text((x+18,y),'Game camera / 30°' if name=='game' else name.title(),font=small,fill='#a9bbd4')
    model(panel,name,(x+7,y+28,366,443))
panel.save(OUT/'review-angles.png')
panel = Image.new('RGB',(1200,850),BG)
draw = ImageDraw.Draw(panel)
draw.text((30,25),'Hearth / static model',font=font,fill='#f3e7dd')
draw.text((30,63),'Floating stone brazier · fire spirit',font=small,fill='#ffbc73')
model(panel,'hero',(20,94,760,720))
ref = Image.open(HERE/'reference/hero.png').convert('RGB')
ref.thumbnail((340,360),Image.Resampling.LANCZOS)
panel.paste(ref,(810,180))
draw.text((820,135),'Supplied reference',font=small,fill='#a9bbd4')
draw.text((820,595),'Recessed glowing face',font=small,fill='#f3e7dd')
draw.text((820,630),'Three floating stone supports',font=small,fill='#f3e7dd')
draw.text((820,665),'Solid faceted flame',font=small,fill='#f3e7dd')
panel.save(OUT/'preview.png')
panel = Image.new('RGB',(1000,790),BG)
draw = ImageDraw.Draw(panel)
draw.text((25,20),'Hearth / game-camera readability',font=font,fill='#f3e7dd')
model(panel,'game',(10,60,600,700))
for i,size in enumerate((32,64)):
    y = 130+i*295
    draw.text((630,y-34),f'{size} px / actual and 4×',font=small,fill='#a9bbd4')
    im = Image.open(OUT/f'game-{size}.png').convert('RGBA')
    panel.paste(im,(630,y),im)
    zoom = im.resize((size*4,size*4),Image.Resampling.NEAREST)
    panel.paste(zoom,(710,y),zoom)
panel.save(OUT/'review-game-size.png')
(HERE/'reference-review.json').write_text(json.dumps({'views':scores,
    'note':'Silhouette overlap is a shape diagnostic, not a score for colors or detail. The reference drawings use elevated cardinal cameras and inconsistent front/back depth. This model preserves one coherent bowl and three-support arrangement.'},indent=2)+'\n')
print({name:round(row['silhouette_iou']*100,1) for name,row in scores.items()})
