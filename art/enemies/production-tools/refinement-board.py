"""Before/after evidence for the requested Brute face and Swarmer fang edits."""
from pathlib import Path
from PIL import Image, ImageDraw
from review import font

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'production-tools/review'
board=Image.new('RGB',(1120,860),'#E3E4EA')
draw=ImageDraw.Draw(board)
draw.text((24,14),'Brute | pale brow and centered face',font=font(26),fill='#252C3C')
draw.text((24,420),'Swarmer | tapered fangs project forward',font=font(26),fill='#252C3C')
for row,kind,view,crop in ((0,'brute','front',(235,190,405,345)),(1,'swarmer','right',None)):
    for col,version in enumerate(('Before','After')):
        path=OUT/f'{kind}-before-refinement.png' if col==0 else ROOT/kind/'production/renders'/f'{view}.png'
        im=Image.open(path).convert('RGBA')
        im=im.crop(crop or im.getchannel('A').getbbox())
        factor=min(475/im.width,330/im.height)
        im=im.resize((round(im.width*factor),round(im.height*factor)),Image.Resampling.LANCZOS)
        x=col*560+280-im.width//2;y=row*410+80
        board.paste(im,(x,y),im)
        draw.text((col*560+24,row*410+50),version,font=font(20),fill='#526074')
board.save(OUT/'refinements.png')
print(OUT/'refinements.png')
