"""Shield porter: a broad wooden guard, an exposed back and a side mace."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import Creature, motion

c = Creature('guardian', {
    'body': ((0, .08, .64), 'root'), 'head': ((0, .02, 1.21), 'body'),
    'arm.L': ((-.35, .04, .96), 'body'), 'arm.R': ((.35, .04, .96), 'body'),
    'leg.L': ((-.22, .07, .23), 'root'), 'leg.R': ((.22, .07, .23), 'root'),
    # Shield has its own world-facing pivot; the simulation turns it independently.
    'shield': ((0, 0, 0), 'root'),
})
c.ellipsoid('Porter torso', (0, .08, .80), (.37, .29, .42), 'hide')
c.box('Shoulder mantle', (0, .07, 1.10), (.80, .47, .19), 'darkstone', bevel=.06)
c.ellipsoid('Head', (0, .015, 1.36), (.27, .24, .25), 'hide', 'head')
c.box('Helmet', (0, .04, 1.51), (.56, .45, .20), 'stone', 'head', .075)
c.box('Nose guard', (0, -.25, 1.36), (.07, .065, .29), 'gold', 'head', .015)
c.eyes(-.23, 1.40, .14, .06)
for side, sign in (('L', -1), ('R', 1)):
    c.taper('Arm', (sign*.35, .03, .98), (sign*.47, -.02, .64), .12, .10, 'hide', 'arm.'+side)
    c.ellipsoid('Leg', (sign*.22, .07, .29), (.13, .14, .21), 'ink', 'leg.'+side)
    c.ellipsoid('Boot', (sign*.22, -.045, .10), (.16, .23, .10), 'wood', 'leg.'+side)
c.taper('Mace haft', (.48, .03, .56), (.48, -.42, .72), .055, .055, 'wood', 'arm.R')
c.box('Mace head', (.48, -.42, .72), (.23, .24, .28), 'stone', 'arm.R', .045)
for x in (-.29, 0, .29):
    c.box('Shield plank', (x, -.39 + abs(x)*.14, .77), (.285, .15, 1.02-abs(x)*.3), 'wood', 'shield', .045)
for z in (.39, 1.12):
    c.box('Shield binding', (0, -.48, z), (.84, .075, .10), 'gold', 'shield', .025)
c.ellipsoid('Shield boss', (0, -.50, .77), (.18, .11, .18), 'stone', 'shield', 10, 5)
c.box('Back strap', (0, .37, .81), (.10, .055, .60), 'gold', bevel=.012)
c.animate(lambda action, t: motion('guardian', action, t))
