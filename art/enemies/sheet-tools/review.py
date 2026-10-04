"""Score opaque model silhouettes against the light-background enemy sheets.

Like the spirit overlay tool, normalize with one uniform height scale. All
views are reported, including contradictory top/bottom illustrations. Camera
sweeps affect only the hero view; they never reshape the mesh.
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from measure import surface

ROOT=Path(__file__).resolve().parents[1]
SIZE=320
def mask(path,ground=None,color='all'):
 im=Image.open(path)
 if im.mode=='RGBA': a=np.asarray(im)[...,3]>96
 else: a=surface(im,color)
 if ground is not None:a[ground+1:]=False
 return im.convert('RGBA'),a

def normalized(path,ground=None,color='all'):
 im,a=mask(path,ground,color)
 ys,xs=np.nonzero(a)
 box=(xs.min(),ys.min(),xs.max()+1,ys.max()+1)
 rgba=np.asarray(im).copy();rgba[...,3]=a*255
 cut=Image.fromarray(rgba).crop(box)
 scale=SIZE/cut.height
 cut=cut.resize((max(1,round(cut.width*scale)),SIZE))
 canvas=Image.new('RGBA',(600,400),(0,0,0,0))
 canvas.alpha_composite(cut,((600-cut.width)//2,45))
 return canvas,np.asarray(canvas)[...,3]>96

def score(here,view,path,cfg):
 ground=cfg['ground'].get(view)
 if ground is not None:ground-=cfg['crops'][view][1]
 color={'sniper':'robot','guardian':'armor'}.get(here.parent.name,'all')
 ref,a=normalized(here/'reference'/f'{view}.png',ground,color)
 model,b=normalized(path)
 return (a&b).sum()/(a|b).sum(),ref,model,a,b

def outline(a):return a & ~(np.roll(a,1,0)&np.roll(a,-1,0)&np.roll(a,1,1)&np.roll(a,-1,1))

def main(kind,mode=None):
 here=ROOT/kind/'production';cfg=json.loads((here/'spirit.json').read_text());out=here/'renders'
 if mode=='fit-views':
  data=json.loads((here/'sheet.json').read_text());data['cameras']={};report={}
  for view in ('front','back','right','left'):
   results=[]
   for path in out.glob(f'fit-{view}_*.png'):
    _,t,e=path.stem.split('_');t=int(t);e=int(e)
    results.append((float(score(here,view,path,cfg)[0]),t,e))
   results.sort(reverse=True);best=results[0]
   data['cameras'][view]={'turn':best[1],'elevation':best[2]};report[view]=results
  (here/'sheet.json').write_text(json.dumps(data,indent=2)+'\n')
  (out/'view-camera-sweep.json').write_text(json.dumps(report,indent=2)+'\n')
  print(kind,'sheet cameras',data['cameras']);return
 if mode=='sweep':
  results=[]
  for path in out.glob('sweep*.png'):
   t,e=map(int,path.stem[5:].split('_'))
   results.append((float(score(here,'hero',path,cfg)[0]),t,e))
  results.sort(reverse=True);best=results[0]
  data=json.loads((here/'sheet.json').read_text());data['hero']={'turn':best[1],'elevation':best[2]}
  (here/'sheet.json').write_text(json.dumps(data,indent=2)+'\n')
  (out/'camera-sweep.json').write_text(json.dumps({'best':data['hero'],'scores':results},indent=2)+'\n')
  print(kind,'hero camera',data['hero'],'IoU',best[0]);return
 scores={};cells=[];comparisons=[]
 font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',20)
 for view in ('front','back','right','left','top','bottom','hero'):
  iou,ref,model,a,b=score(here,view,out/f'{view}.png',cfg);scores[view]=float(iou)
  bg=Image.new('RGBA',ref.size,'#DDDDE6');bg.alpha_composite(ref)
  overlay=Image.blend(bg,Image.alpha_composite(Image.new('RGBA',model.size,'#DDDDE6'),model),.5)
  pixels=np.asarray(overlay).copy();pixels[outline(a)]=(255,192,0,255);pixels[outline(b)]=(220,38,70,255)
  overlay=Image.fromarray(pixels).convert('RGB');ImageDraw.Draw(overlay).text((12,12),f'{view}: {iou:.1%}',font=font,fill='#242536')
  overlay.save(out/f'overlay-{view}.png');cells.append(overlay.resize((420,280)))
  pair=Image.new('RGB',(1200,420),'#DDDDE6');pair.paste(bg.convert('RGB'),(0,0));pair.paste(Image.alpha_composite(Image.new('RGBA',model.size,'#DDDDE6'),model).convert('RGB'),(600,0))
  ImageDraw.Draw(pair).text((12,390),f'{view}: sheet / model',font=font,fill='#242536');comparisons.append(pair.resize((600,210)))
 grid=Image.new('RGB',(1680,560),'#DDDDE6')
 for i,c in enumerate(cells):grid.paste(c,((i%4)*420,(i//4)*280))
 grid.save(out/'overlay-all.png')
 compare=Image.new('RGB',(1200,840),'#DDDDE6')
 for i,c in enumerate(comparisons):compare.paste(c,((i%2)*600,(i//2)*210))
 compare.save(out/'compare.png')
 (out/'overlap.json').write_text(json.dumps({'metric':'silhouette intersection over union after uniform height normalization','target':.9,'scores':scores},indent=2)+'\n')
 print(kind,scores)

if __name__=='__main__':main(sys.argv[1],sys.argv[2] if len(sys.argv)>2 else None)
