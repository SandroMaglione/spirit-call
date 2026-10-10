"""Compare the delivered model's silhouette with the original view crops.

Each view is uniformly scaled to the same figure height and horizontally
centered. No independent width scaling or contour warping is used. Enclosed
face holes are filled for silhouette IoU; detail/color matching is visual.
"""
import json
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont

HERE=Path(__file__).resolve().parent
SIZE=360
VIEWS=('front','back','left','right','top','bottom','hero')
FONT=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',16)
TITLE=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',24)

def mask(image):
    rgb=np.asarray(image.convert('RGB')).astype(float)
    m=(rgb.max(axis=2)>95)&(rgb[...,1]>80)&(rgb[...,1]>rgb[...,0]*.76)
    # Silhouette includes the recessed face; keep the outside background.
    seen=np.zeros_like(m);q=deque()
    for y in range(m.shape[0]):
        for x in (0,m.shape[1]-1):
            if not m[y,x]:q.append((y,x));seen[y,x]=True
    for x in range(m.shape[1]):
        for y in (0,m.shape[0]-1):
            if not m[y,x] and not seen[y,x]:q.append((y,x));seen[y,x]=True
    while q:
        y,x=q.popleft()
        for dy,dx in ((0,1),(0,-1),(1,0),(-1,0)):
            a,b=y+dy,x+dx
            if 0<=a<m.shape[0] and 0<=b<m.shape[1] and not m[a,b] and not seen[a,b]:
                seen[a,b]=True;q.append((a,b))
    return ~seen

def normalize(path):
    image=Image.open(path).convert('RGB');m=mask(image)
    ys,xs=np.where(m);top,bottom=int(ys.min()),int(ys.max())
    scale=SIZE/(bottom-top);center=(int(xs.min())+int(xs.max()))/2
    canvas=Image.new('RGB',(560,460),(8,25,35))
    out=image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.LANCZOS)
    x=round(280-center*scale);y=round(415-bottom*scale)
    canvas.paste(out,(x,y))
    binary=Image.new('L',canvas.size)
    binary.paste(Image.fromarray((m*255).astype('uint8')).resize(out.size,Image.Resampling.NEAREST),(x,y))
    return canvas,np.asarray(binary)>128

def edge(m):
    return m&~(np.roll(m,1,0)&np.roll(m,-1,0)&np.roll(m,1,1)&np.roll(m,-1,1))

scores={};grid=Image.new('RGB',(1440,840),(8,25,35));g=ImageDraw.Draw(grid)
g.text((22,16),'WINDWALL / SILHOUETTE COMPARISON',font=TITLE,fill=(192,246,224))
for i,view in enumerate(VIEWS):
    ref,a=normalize(HERE/'reference'/f'{view}.png')
    model,b=normalize(HERE/'renders'/f'{view}.png')
    score=float((a&b).sum()/(a|b).sum());scores[view]=score
    blend=Image.blend(ref,model,.5);pixels=np.asarray(blend).copy()
    pixels[edge(a)]=(255,218,75);pixels[edge(b)]=(255,89,115)
    blend=Image.fromarray(pixels)
    board=Image.new('RGB',(1680,510),(8,25,35));d=ImageDraw.Draw(board)
    d.text((18,12),f'{view.upper()} / supplied sheet, static model, overlay / IoU {score:.1%}',font=TITLE,fill=(210,244,234))
    for j,im in enumerate((ref,model,blend)):board.paste(im,(j*560,50))
    board.save(HERE/'renders'/f'overlay-{view}.png')
    x=(i%4)*360;y=65+(i//4)*385
    g.text((x+16,y),f'{view.upper()} / {score:.1%}',font=FONT,fill=(192,246,224))
    grid.paste(blend.resize((360,340)),(x,y+28))
grid.save(HERE/'renders/overlay-all.png')
(HERE/'renders/overlap.json').write_text(json.dumps({'method':'uniform height normalization; full filled silhouette intersection over union; no width warp','strict_camera_scores':scores},indent=2)+'\n')

board=Image.new('RGB',(1600,1140),(8,25,35));d=ImageDraw.Draw(board)
d.text((28,20),'WINDWALL / STATIC MODEL',font=TITLE,fill=(192,246,224))
d.text((28,60),'Supplied reference beside the actual model renders',font=FONT,fill=(158,194,201))
for i,view in enumerate(('front','back','hero','game')):
    x=(i%2)*800;y=110+(i//2)*490
    d.text((x+24,y),view.upper()+' / SHEET                       MODEL',font=FONT,fill=(192,246,224))
    reference=view if view!='game' else 'hero'
    for j,path in enumerate((HERE/'reference'/f'{reference}.png',HERE/'renders'/f'{view}.png')):
        im,_=normalize(path);im=im.resize((394,324))
        board.paste(im,(x+4+j*400,y+60))
info=json.loads((HERE/'export.json').read_text())
d.text((28,1100),f"{info['triangles']} triangles / 3 materials / 0 clips / 0 bones / separate editable parts",font=FONT,fill=(158,194,201))
board.save(HERE/'renders/review.png')
small=Image.open(HERE/'renders/game-size.png').convert('RGB')
small_board=Image.new('RGB',(700,430),(8,25,35));d=ImageDraw.Draw(small_board)
d.text((22,20),'GAME CAMERA / 40 x 40 PX RENDER + 8X ENLARGEMENT',font=FONT,fill=(192,246,224))
small_board.paste(small,(75,190));small_board.paste(small.resize((320,320),Image.Resampling.NEAREST),(270,80))
small_board.save(HERE/'renders/review-game-size.png')
print(json.dumps(scores,indent=2))
