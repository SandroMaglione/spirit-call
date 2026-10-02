"""A needle seer: long legs, a narrow mantle and one forward optical focus."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import Creature, motion

c = Creature('sniper', {
    'body': ((0, 0, .85), 'root'), 'head': ((0, 0, 1.55), 'body'),
    'jaw': ((0, -.15, 1.62), 'head'), 'arm.L': ((-.20, 0, 1.32), 'body'),
    'arm.R': ((.20, 0, 1.32), 'body'), 'leg.L': ((-.13, 0, .35), 'root'),
    'leg.R': ((.13, 0, .35), 'root'),
})
c.taper('Narrow mantle', (0, 0, .57), (0, 0, 1.40), .32, .20, 'blue', sides=10)
c.ellipsoid('Dark collar', (0, -.03, 1.41), (.24, .20, .12), 'ink')
c.ellipsoid('Long mask', (0, -.04, 1.70), (.21, .22, .30), 'cream', 'head')
c.taper('Aiming tube', (0, -.21, 1.70), (0, -.65, 1.70), .13, .09, 'gold', 'jaw', 8)
c.taper('Focus rim', (0, -.61, 1.70), (0, -.71, 1.70), .125, .125, 'ink', 'jaw', 8)
c.ellipsoid('Single lens', (0, -.715, 1.70), (.085, .015, .085), 'blue', 'jaw', 10, 5)
c.taper('Crest', (0, .05, 1.89), (0, .19, 2.15), .14, .004, 'blue', 'head', 6)
for side, sign in (('L', -1), ('R', 1)):
    c.taper('Long shin', (sign*.13, .02, .68), (sign*.14, -.02, .12), .06, .04, 'ink', 'leg.'+side, 6)
    c.ellipsoid('Claw foot', (sign*.14, -.09, .065), (.085, .18, .065), 'gold', 'leg.'+side, 8, 4)
    c.taper('Folded arm', (sign*.22, 0, 1.31), (sign*.30, -.06, .95), .075, .05, 'ink', 'arm.'+side)
    c.ellipsoid('Hand', (sign*.30, -.07, .94), (.065, .09, .10), 'cream', 'arm.'+side, 8, 4)
    c.box('Mantle trim', (sign*.16, -.17, .95), (.045, .035, .55), 'gold', bevel=.008)
c.animate(lambda action, t: motion('sniper', action, t))
