"""A stitched practice target on a flexible post, with a fixed weighted base."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import Creature, motion

c = Creature('dummy', {'body': ((0, 0, .28), 'root'), 'head': ((0, 0, 1.15), 'body')})
c.box('Weighted base', (0, 0, .09), (.70, .55, .18), 'darkstone', 'root', .06)
c.taper('Flexible post', (0, 0, .17), (0, 0, 1.15), .08, .07, 'wood')
c.ellipsoid('Padded torso', (0, 0, .89), (.33, .22, .42), 'rust')
c.ellipsoid('Sack head', (0, 0, 1.36), (.24, .20, .26), 'cream', 'head')
c.box('Target patch', (0, -.223, .93), (.33, .035, .28), 'cream', bevel=.025)
c.box('Target center', (0, -.246, .93), (.13, .022, .12), 'rust', bevel=.025)
for z in (.63, 1.1):
    c.box('Rope binding', (0, 0, z), (.59, .46, .065), 'gold', bevel=.025)
for sign in (-1, 1):
    c.taper('Crossbar', (0, 0, 1.03), (sign*.53, 0, 1.03), .075, .075, 'wood')
    c.box('Stitched eye', (sign*.095, -.191, 1.39), (.10, .025, .028), 'ink', 'head', .005, (0, sign*.4, 0))
c.box('Stitched mouth', (0, -.203, 1.25), (.15, .026, .025), 'wood', 'head', .005)
c.animate(lambda action, t: motion('dummy', action, t))
