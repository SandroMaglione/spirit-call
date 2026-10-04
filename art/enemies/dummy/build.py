"""A wooden bullseye target on a flexible post, with a fixed weighted base."""
import sys
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import Creature, motion, transform

c = Creature('dummy', {'body': ((0, 0, .28), 'root'), 'head': ((0, 0, 1.15), 'body')})
c.box('Weighted base', (0, 0, .09), (.70, .55, .18), 'darkstone', 'root', .06)
c.taper('Flexible post', (0, 0, .17), (0, 0, 1.15), .08, .07, 'wood')
c.box('Wooden torso', (0, 0, .89), (.48, .32, .78), 'wood', bevel=.035)
c.box('Wooden head', (0, 0, 1.40), (.32, .28, .39), 'wood', 'head', bevel=.025)
c.box('Top peg', (0, 0, 1.65), (.12, .12, .13), 'gold', 'head', bevel=.018)
for name,y,radius,color in [('Target backing',-.171,.19,'cream'),('Target ring',-.192,.145,'rust'),
    ('Target inner ring',-.211,.100,'cream'),('Target center',-.230,.054,'rust')]:
    c.ellipsoid(name,(0,y,.94),(radius,.020,radius),color,segments=12,rings=4)
for z in (.63, 1.1):
    c.box('Rope binding', (0, 0, z), (.59, .46, .065), 'gold', bevel=.025)
for sign in (-1, 1):
    c.taper('Crossbar', (0, 0, 1.03), (sign*.53, 0, 1.03), .075, .075, 'wood')
    c.box('Wood grain', (sign*.065, -.146, 1.40), (.013, .009, .11), 'hide', 'head', .002)
def pose(action,t):
    if action in ('Windup','Active','Recovery'):
        ready=math.sin(min(1,t/.72)*math.pi/2) if action=='Windup' else (1 if action=='Active' else (1-t)**2)
        strike=max(0,(t-.82)/.18) if action=='Windup' else (1 if action=='Active' else (1-t)**2)
        return {'body':transform((.06*strike,0,-.4*ready+.75*strike)),
            'head':transform((0,0,.1*ready-.15*strike))}
    return motion('dummy',action,t)
c.animate(pose,full_lifecycle=True)
