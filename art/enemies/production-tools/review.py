"""Sheet overlays, measured IoU, hero camera scoring and phone-size boards.

Uses the same normalization and outline method as the spirits' overlay tool.
RGBA render masks cover every material; sheet masks exclude pale backgrounds
and cast shadows. Reports every view, including contradictory sheet poses.
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from measure import surface, blobs

ROOT=Path(__file__).resolve().parents[1]
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'

def font(size):return ImageFont.truetype(FONT,size)

def outline(a):return a & ~(np.roll(a,1,0)&np.roll(a,-1,0)&np.roll(a,1,1)&np.roll(a,-1,1))

def normalized(path, size=380):
    im=Image.open(path)
    mask=np.asarray(im)[...,3]>128 if im.mode=='RGBA' else surface(im,'all')
    if im.mode!='RGBA':
        # Discard heading letters and detached shadow specks. Small fins and
        # feet remain part of the silhouette even when a light gap separates
        # them from the body's color mask.
        pieces=blobs(mask,10);largest=max(len(p) for p in pieces)
        mask=np.zeros_like(mask)
        for p in pieces:
            if len(p)>=largest*.018:mask[p[:,0],p[:,1]]=True
    ys,xs=np.nonzero(mask)
    if not len(xs):raise ValueError(path)
    box=(xs.min(),ys.min(),xs.max()+1,ys.max()+1)
    factor=size/(box[3]-box[1])
    canvas=Image.new('RGB',(560,460),'#DFDFE8')
    rgba=im.convert('RGBA').crop(box)
    if im.mode!='RGBA':
        rgba.putalpha(Image.fromarray((mask[box[1]:box[3],box[0]:box[2]]*255).astype('uint8')))
    rgba=rgba.resize((round(rgba.width*factor),size))
    offset=((560-rgba.width)//2,430-size)
    canvas.paste(rgba,offset,rgba)
    m=Image.new('L',canvas.size);m.paste(rgba.getchannel('A'),offset)
    return canvas,np.asarray(m)>128

def score(a,b):return float((a&b).sum()/(a|b).sum())

def main(kind,sweep=False):
    here=ROOT/kind/'production';out=here/'renders'
    if sweep:
        _,mask=normalized(here/'reference/hero.png')
        results=[]
        for path in out.glob('sweep*.png'):
            turn,elevation=map(int,path.stem[5:].split('_'))
            _,b=normalized(path)
            results.append({'turn':turn,'elevation':elevation,'silhouette_iou':score(mask,b)})
        results.sort(key=lambda x:x['silhouette_iou'],reverse=True)
        sheet=json.loads((here/'sheet.json').read_text())
        sheet['hero']={k:results[0][k] for k in ('turn','elevation')}
        (here/'sheet.json').write_text(json.dumps(sheet,indent=2)+'\n')
        (out/'camera-sweep.json').write_text(json.dumps(results,indent=2)+'\n')
        print(kind,'camera sweep',results[:3]);return
    scores={};cells=[];comparison=[]
    for view in ('front','back','left','right','top','bottom','hero'):
        a,ma=normalized(here/'reference'/f'{view}.png');b,mb=normalized(out/f'{view}.png')
        scores[view]=score(ma,mb)
        blend=Image.blend(a,b,.5);pix=np.asarray(blend).copy()
        pix[outline(ma)]=(235,180,0);pix[outline(mb)]=(232,43,66)
        blend=Image.fromarray(pix)
        draw=ImageDraw.Draw(blend);draw.text((15,9),f'{view}  {scores[view]:.1%}',font=font(20),fill='#242B3D')
        blend.save(out/f'overlay-{view}.png');cells.append(blend.resize((280,230)))
        if view in ('front','right','hero'):
            pair=Image.new('RGB',(1120,490),'#DFDFE8');pair.paste(a,(0,30));pair.paste(b,(560,30))
            d=ImageDraw.Draw(pair);d.text((18,5),f'{view}: sheet',font=font(22),fill='#242B3D');d.text((578,5),'model',font=font(22),fill='#242B3D')
            comparison.append(pair)
    grid=Image.new('RGB',(1120,490),'#DFDFE8')
    for i,cell in enumerate(cells):grid.paste(cell,((i%4)*280,(i//4)*245))
    ImageDraw.Draw(grid).text((850,280),'Yellow: sheet\nRed: model',font=font(20),fill='#242B3D')
    grid.save(out/'overlay-all.png')
    compare=Image.new('RGB',(1120,1470),'#DFDFE8')
    for i,cell in enumerate(comparison):compare.paste(cell,(0,490*i))
    compare.save(out/'compare.png')
    (out/'overlap.json').write_text(json.dumps({'metric':'silhouette intersection over union; independently normalized height, centered bounding box',
        'target':.9,'views':scores,'orthographic_camera_elevation':0,
        'reference_note':'Sheets include perspective and inconsistent mouth positions or poses; see README.'},indent=2)+'\n')
    # Enlargement is nearest-neighbor so phone detail is judged at its true
    # raster size, rather than hidden by a smooth resize.
    game=Image.open(out/'game-size.png')
    board=Image.new('RGB',(960,600),'#343C3E')
    hero,_=normalized(out/'game.png',380);board.paste(hero,(0,65))
    board.paste(game,(660,180),game)
    enlarged=game.resize((game.width*6,game.height*6),Image.Resampling.NEAREST)
    board.paste(enlarged,(600,250),enlarged)
    d=ImageDraw.Draw(board);d.text((20,18),f'{kind.capitalize()} | 30 degree game camera',font=font(26),fill='white')
    d.text((605,120),f'{game.width}px native\n6x pixel enlargement below',font=font(19),fill='white')
    board.save(out/'review-game-size.png')
    print(kind,scores)

if __name__=='__main__':main(sys.argv[1],'sweep' in sys.argv[2:])
