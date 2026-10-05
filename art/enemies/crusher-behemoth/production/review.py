"""Score every sheet view and compose boss-sized review images."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'review-tools'))
from review import main, font, normalized

main('crusher-behemoth', 'sweep' in sys.argv)
if 'sweep' not in sys.argv:
    out=HERE/'renders'
    board=Image.new('RGB',(1100,680),'#292e34')
    d=ImageDraw.Draw(board)
    d.text((24,18),'Crusher Behemoth | 45° turn, 30° elevation',font=font(25),fill='white')
    large=Image.open(out/'game.png').resize((570,570))
    board.paste(large,(10,75),large)
    for name,x,size in [('game-size',620,128),('game-size-64',820,64)]:
        im=Image.open(out/(name+'.png'))
        d.text((x,112),f'{size} px, native',font=font(18),fill='white')
        board.paste(im,(x,160),im)
    im=Image.open(out/'game-size-64.png').resize((256,256),Image.Resampling.NEAREST)
    d.text((640,330),'64 px, 4x enlargement',font=font(18),fill='white')
    board.paste(im,(640,370),im)
    board.save(out/'review-game-size.png')
    board=Image.new('RGB',(1500,1050),'#dfdfe8')
    d=ImageDraw.Draw(board)
    for name,path,x,y in [('Reference hero',HERE/'reference/hero.png',0,0),
                         ('Static model',out/'hero.png',750,0),
                         ('Game camera',out/'game.png',0,525),
                         ('Rear facing',out/'game-back.png',750,525)]:
        if y==0:
            # Equal visible height makes the reference comparison honest.
            im,_=normalized(path)
            im=im.crop((105,0,855,460)).convert('RGBA')
        else:
            im=Image.open(path).convert('RGBA')
            im=im.crop(im.getchannel('A').getbbox())
            im.thumbnail((700,460))
        board.paste(im,(x+(750-im.width)//2,y+55),im)
        d.text((x+24,y+15),name,font=font(24),fill='#252c3c')
    board.save(out/'review-board.png')
