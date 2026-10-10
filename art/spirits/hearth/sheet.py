"""Crop the supplied sheet and measure its colored silhouette and flame rows."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sheet = Image.open(HERE / 'reference/sheet.png').convert('RGB')
CROPS = {'front': (30,166,362,491), 'left': (383,166,714,491),
         'back': (736,166,1068,491), 'right': (1089,166,1420,491),
         'top': (31,571,358,857), 'bottom': (385,573,706,856),
         'hero': (736,572,1069,858)}
# The bowl ellipses imply elevated cameras rather than level ones.
ANCHORS = {'front': {'tip': [196,178], 'rim_center': [197,315], 'rim_width':246,
                    'side_support_centers': [[73,409],[321,410]],
                    'eyes': [[195,390],[231,390]], 'lowest': [183,479]},
           'left': {'tip':[569,181], 'rim_center':[551,315]},
           'back': {'tip':[900,178], 'rim_center':[902,315]},
           'right': {'tip':[1258,181], 'rim_center':[1259,315]}}
measurements = {}
for name, box in CROPS.items():
    im = sheet.crop(box)
    im.save(HERE / f'reference/{name}.png')
    a = np.asarray(im, dtype=float)
    r, g, b = a[:,:,0], a[:,:,1], a[:,:,2]
    mask = (r>48) & (r>g*1.13) & (r>b*.97)
    rows = []
    for y in range(im.height):
        xs = np.flatnonzero(mask[y])
        if len(xs)>2:
            rows.append([y,int(xs.min()),int(xs.max())])
    measurements[name] = {'crop':box, 'silhouette_rows_px':rows}
front = np.asarray(sheet)
flame = []
for y in range(178,324,12):
    row = front[y,142:276].astype(float)
    xs = np.flatnonzero((row[:,0]>110) & (row[:,0]>row[:,2]*1.7) & (row[:,1]>45))
    if len(xs):
        flame.append([y,int(xs.min()+142),int(xs.max()+142)])
info = {'name':'Hearth',
        'source_sha256':hashlib.sha256((HERE/'reference/sheet.png').read_bytes()).hexdigest(),
        'source_size_px':list(sheet.size), 'anchors':ANCHORS, 'views':measurements,
        'main_flame_front_rows_px':flame, 'meters_per_pixel':.8/(479-178),
        'modeled_silhouette_height_m':.8, 'hover_gap_m':.08,
        'reference_policy':'Front, sides and back determine proportions. The top and bottom confirm three supports. All four cardinal drawings show the top rim at a small elevation. Perspective differences are recorded in the review, not treated as a physical shape change.'}
(HERE/'sheet.json').write_text(json.dumps(info,indent=2)+'\n')
print('Measured flame rows:',flame)
