"""Find the closest physical camera for the sheet's turned upright views."""
import json
from pathlib import Path
from PIL import Image
from review import HERE,normalize

SWEEP=Path('/tmp/windwall-camera-fit')
candidates=[]
for path in SWEEP.glob('*.png'):
    turn,elevation=map(int,path.stem.split('_'))
    _,mask=normalize(path)
    candidates.append((turn,elevation,mask,path))
fits={}
for view in ('front','back','left','right','hero'):
    _,ref=normalize(HERE/'reference'/f'{view}.png')
    allowed={'front':lambda t:abs(t)<=30,'hero':lambda t:abs(t)<=30,
             'back':lambda t:t>=170,'left':lambda t:-90<=t<=-50,
             'right':lambda t:50<=t<=90}[view]
    scored=sorted([(float((ref&m).sum()/(ref|m).sum()),t,e,path)
                   for t,e,m,path in candidates if allowed(t)],reverse=True)
    score,turn,elevation,path=scored[0]
    fits[view]={'turn':turn,'elevation':elevation,'silhouette_iou':score}
    Image.open(path).save(HERE/'renders'/f'fitted-{view}.png')
(HERE/'camera-fit.json').write_text(json.dumps(fits,indent=2)+'\n')
print(json.dumps(fits,indent=2))
