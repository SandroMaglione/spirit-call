"""Measure labeled parts of the attached sheets, preserving their pixel scale.

Regions identify touching surfaces; masks and measured row contours determine
the geometry. The light backgrounds need separate surface masks, unlike the
dark spirit sheets. No game content or registered assets are changed.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'spirits/tools'))
from common import blobs


def surface(image, color='all'):
    a = np.asarray(image.convert('RGB')).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    masks = {
        'blue': (b-r > 16) & (b-g > 4) & (r < 165),
        'red': (r-g > 35) & (r-b > 30),
        'coral': (r-g > 26) & (g-b > 8) & (r > 130),
        'bone': (r-b > 17) & (g-b > 8) & (r > 150),
        'stone': (r < 183) & (g < 175) & (b < 173),
        'dark': (a.max(axis=2) < 130),
        'gold': (r > 170) & (g > 110) & (r-b > 70) & (g-b > 35),
        'fire': (r > 210) & (r-b > 55) & (g > 105),
        'purple': (b-r > 8) & (b-g > 7) & (r < 180),
        'all': (a.min(axis=2) < 153) | ((r-b > 18) & (g-b > 7)) | ((b-r > 20) & (r < 172)),
    }
    return masks[color]


def region_mask(image, points, origin):
    label = Image.new('1', image.size)
    ImageDraw.Draw(label).polygon([(x-origin[0], y-origin[1]) for x, y in points], fill=1)
    return np.asarray(label, dtype=bool)


def rect(x0, y0, x1, y1):
    return [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]


def measure(kind):
    here = ROOT / kind / 'production'
    config = json.loads((here / 'spirit.json').read_text())
    sheet = Image.open(here / 'reference/sheet.png').convert('RGB')
    data = {'meters_per_pixel':config['meters_per_pixel'], 'ground_pixels':config['ground'],
            'center_pixels':config['center'], 'regions_pixels':config['parts'], 'parts':{},
            'palette':{}, 'eyes':[], 'hero':{'turn':35,'elevation':25}}
    if (here / 'sheet.json').exists():
        data['hero'] = json.loads((here / 'sheet.json').read_text()).get('hero',data['hero'])
    images = {}
    for view, box in config['crops'].items():
        images[view] = sheet.crop(box)
        images[view].save(here / 'reference' / f'{view}.png')
    debug = {v:im.copy() for v,im in images.items()}
    for index,(part,entry) in enumerate(config['parts'].items()):
        data['parts'][part] = {}
        for view,region in entry['views'].items():
            im=images[view]; origin=config['crops'][view][:2]
            mask=surface(im,entry['mask']) & region_mask(im,region,origin)
            rows=[]
            for y in range(mask.shape[0]):
                xs=np.flatnonzero(mask[y])
                if len(xs)>1:
                    lo=(int(xs.min())+origin[0]-config['center'][view])*config['meters_per_pixel']
                    hi=(int(xs.max())+origin[0]-config['center'][view])*config['meters_per_pixel']
                    if view in ('back','left'):lo,hi=-hi,-lo
                    z=(config['ground'][view]-y-origin[1])*config['meters_per_pixel']
                    rows.append([z,lo,hi])
            if not rows:raise ValueError(f'No measured pixels: {kind}/{part}/{view}')
            data['parts'][part][view]=rows
            a=np.asarray(debug[view]).copy()
            a[mask]=[(80+index*67)%220+20,(110+index*93)%220+20,(150+index*37)%220+20]
            debug[view]=Image.fromarray(a)
    for name,(x,y) in config['swatches'].items():
        rgb=np.median(np.asarray(sheet)[y-8:y+8,x-8:x+8].reshape(-1,3),axis=0).astype(int)
        data['palette'][name]='#'+''.join(f'{c:02X}' for c in rgb)
    if 'eye_regions' in config:
        im=images['front'];origin=config['crops']['front'][:2]
        region=np.zeros((im.height,im.width),dtype=bool)
        for points in config['eye_regions']:region |= region_mask(im,points,origin)
        mask=surface(im,'gold') & region
        for p in sorted(blobs(mask,3),key=len,reverse=True)[:2]:
            data['eyes'].append({'x':float((p[:,1].mean()+origin[0]-config['center']['front'])*config['meters_per_pixel']),
                                'z':float((config['ground']['front']-p[:,0].mean()-origin[1])*config['meters_per_pixel']),
                                'width':float((np.ptp(p[:,1])+1)*config['meters_per_pixel']),
                                'height':float((np.ptp(p[:,0])+1)*config['meters_per_pixel'])})
    for view,im in debug.items():im.resize((im.width*3,im.height*3)).save(here/'renders'/f'measure-{view}.png')
    (here/'sheet.json').write_text(json.dumps(data,indent=2)+'\n')
    print(kind, 'measured',list(data['parts']), 'palette',data['palette'],'eyes',data['eyes'])


if __name__ == '__main__':measure(sys.argv[1])
