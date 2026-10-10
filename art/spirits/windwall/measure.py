"""Crop the supplied sheet and retain pixel measurements for the static model.

Region outlines mark visible seams where cape and hood touch. Bright-color
masks retain the original silhouettes; the sheet remains the source.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
BOXES = {
    'front': (12, 218, 354, 481), 'left': (408, 220, 640, 481),
    'back': (730, 218, 1073, 481), 'right': (1168, 220, 1377, 481),
    'top': (20, 589, 349, 751), 'bottom': (373, 591, 685, 744),
    'hero': (700, 550, 1018, 796), 'face': (1043, 561, 1206, 806),
    'cape': (1236, 561, 1417, 806),
}
REGIONS = {
    'hood': [(196,277),(232,294),(248,322),(258,360),(244,380),(212,393),(172,391),(139,378),(117,359),(129,332),(154,305),(176,285)],
    'face': [(217,315),(229,325),(239,348),(238,365),(230,376),(213,383),(191,386),(173,379),(163,368),(164,352),(180,332),(198,321)],
    'upper_cape': [(24,320),(103,338),(143,348),(165,374),(190,388),(213,383),(250,341),(345,315),(326,375),(266,390),(229,393),(188,392),(116,386),(49,376)],
    'lower_body': [(164,391),(215,389),(230,415),(210,443),(187,473),(162,444),(145,415)],
    'crest': [(140,248),(167,248),(180,256),(197,227),(211,257),(202,282),(188,288),(151,275)],
}

def bright(rgb):
    return (rgb.max(axis=2)>95)&(rgb[...,1]>80)&(rgb[...,1]>rgb[...,0]*.76)

if __name__ == '__main__':
    image = Image.open(HERE/'reference/sheet.png').convert('RGB')
    data = {'sheet_height_pixels': 246, 'sheet_height_m': .62, 'hover_m': .04,
            'meters_per_pixel': .62/246, 'front_center_pixel': 192,
            'front_bottom_pixel': 473, 'crops': BOXES, 'region_pixels': REGIONS,
            'palette': {'mint':'#5EE6C4','pale_green':'#B7F4A7','teal':'#2CB9A6','cream':'#F6F8E7','eye':'#FFF6A5'},
            'hero': {'turn': -20, 'elevation': 12}, 'views': {}}
    for name, box in BOXES.items():
        crop = image.crop(box); crop.save(HERE/'reference'/f'{name}.png')
        rgb = np.asarray(crop).astype(float); mask = bright(rgb)
        ys,xs=np.where(mask)
        data['views'][name]={'bounds_pixels':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],
                            'rows':[[int(y),int(np.where(mask[y])[0].min()),int(np.where(mask[y])[0].max())]
                                    for y in range(mask.shape[0]) if mask[y].any()]}
        Image.fromarray((mask*255).astype('uint8')).save(HERE/'reference'/f'{name}-mask.png')
    debug = image.crop(BOXES['front']); draw=ImageDraw.Draw(debug)
    for name, points in REGIONS.items():
        poly=[(x-BOXES['front'][0],y-BOXES['front'][1]) for x,y in points]
        draw.line(poly+[poly[0]],fill=(255,100,120),width=1)
    debug.save(HERE/'renders/measured-front.png')
    rgb=np.asarray(image).astype(int)
    eyes=(rgb[...,0]>215)&(rgb[...,1]>215)&(rgb[...,2]>110)&(rgb[...,2]<220)
    out=[]
    for xmin,xmax in ((181,199),(210,228)):
        y,x=np.where(eyes[337:377,xmin:xmax])
        out.append({'center':[float(x.mean()+xmin),float(y.mean()+337)],
                    'width':int(np.ptp(x)+1),'height':int(np.ptp(y)+1)})
    data['front_eyes']=out
    (HERE/'sheet.json').write_text(json.dumps(data,indent=2)+'\n')
    print('eye measurements',out)
