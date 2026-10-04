"""A wooden bullseye target on a flexible post, with a fixed weighted base."""
import sys
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import Creature, motion, transform

kind = sys.argv[sys.argv.index('--variant')+1] if '--variant' in sys.argv else 'dummy'
assert kind in ('dummy', 'sparring-dummy', 'heavy-dummy')
sparring, heavy = kind == 'sparring-dummy', kind == 'heavy-dummy'
joints = {'body': ((0, 0, .28), 'root'), 'head': ((0, 0, 1.15), 'body')}
if sparring: joints['arm.R'] = ((.25, 0, 1.03), 'body')
c = Creature(kind, joints)
c.box('Weighted base', (0, 0, .09), (.90 if heavy else .70, .72 if heavy else .55, .18), 'darkstone', 'root', .06)
c.taper('Flexible post', (0, 0, .17), (0, 0, 1.15), .12 if heavy else .08, .11 if heavy else .07, 'wood')
c.box('Wooden torso', (0, 0, .89), (.68 if heavy else .48, .42 if heavy else .32, .78), 'wood', bevel=.035)
c.box('Wooden head', (0, 0, 1.40), (.38 if heavy else .32, .34 if heavy else .28, .39), 'wood', 'head', bevel=.025)
c.box('Top peg', (0, 0, 1.65), (.12, .12, .13), 'darkstone' if heavy else 'gold', 'head', bevel=.018)
target = 'blue' if heavy else '#a9453e' if sparring else 'rust'
for name,y,radius,color in [('Target backing',-.171,.19,'cream'),('Target ring',-.192,.145,target),
    ('Target inner ring',-.211,.100,'cream'),('Target center',-.230,.054,target)]:
    if heavy: y -= .05; radius *= 1.15
    c.ellipsoid(name,(0,y,.94),(radius,.020,radius),color,segments=12,rings=4)
for z in (.63, 1.1):
    c.box('Iron band' if heavy else 'Rope binding', (0, 0, z),
        (.79 if heavy else .59, .56 if heavy else .46, .085 if heavy else .065),
        'darkstone' if heavy else 'gold', bevel=.025)
for sign in (-1, 1):
    if sparring and sign == 1:
        # The pivot is embedded in the torso and the sleeve follows both
        # bones. The padded end swings across the front on contact.
        c.ellipsoid('Striking shoulder', (.25, 0, 1.03), (.12, .13, .13), 'gold', segments=8, rings=4)
        c.taper('Striking bar', (.25, 0, 1.03), (.72, 0, 1.03), .075, .075, 'wood', 'arm.R')
        c.box('Striking pad', (.72, 0, 1.03), (.25, .27, .30), '#a9453e', 'arm.R', .055)
        c.box('Pad binding', (.57, 0, 1.03), (.055, .19, .19), 'cream', 'arm.R', .018)
    else:
        c.taper('Crossbar', (0, 0, 1.03), (sign*(.46 if heavy else .53), 0, 1.03), .09 if heavy else .075, .075, 'wood')
        if sparring:
            c.box('Guard pad', (sign*.53, 0, 1.03), (.22, .25, .27), '#a9453e', bevel=.045)
        if heavy:
            c.box('Shoulder weight', (sign*.46, 0, 1.03), (.25, .34, .30), 'darkstone', bevel=.045)
    c.box('Wood grain', (sign*.065, -.146, 1.40), (.013, .009, .11), 'hide', 'head', .002)
if heavy:
    c.box('Head cap', (0, 0, 1.57), (.43, .39, .075), 'darkstone', 'head', .018)
    for sign in (-1, 1):
        for z in (.63, 1.1):
            c.ellipsoid('Band rivet', (sign*.30, -.293, z), (.03, .025, .03), 'stone', segments=8, rings=4)
def pose(action,t):
    if action in ('Windup','Active','Recovery'):
        ready=math.sin(min(1,t/.72)*math.pi/2) if action=='Windup' else (1 if action=='Active' else (1-t)**2)
        strike=max(0,(t-.82)/.18) if action=='Windup' else (1 if action=='Active' else (1-t)**2)
        out = {'body':transform((.06*strike,0,-.4*ready+.75*strike)),
            'head':transform((0,0,.1*ready-.15*strike))}
        if sparring: out['arm.R'] = transform((0, 0, .60*ready-1.80*strike))
        return out
    out = motion('dummy',action,t)
    if sparring and action == 'Idle': out['arm.R'] = transform((0, 0, .065*math.sin(math.tau*t)))
    return out
c.animate(pose,full_lifecycle=True)
