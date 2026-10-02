"""A dry seed pest: leaf plates, a sharp face and springy little feet."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import Creature, motion

c = Creature('swarmer', {
    'body': ((0, 0, .25), 'root'), 'head': ((0, -.12, .38), 'body'),
    'jaw': ((0, -.22, .26), 'body'), 'tail': ((0, .18, .34), 'body'),
    'leg.L': ((-.16, 0, .10), 'root'), 'leg.R': ((.16, 0, .10), 'root'),
})
c.ellipsoid('Seed shell', (0, .02, .35), (.25, .31, .28), 'orange', segments=8, rings=4)
c.ellipsoid('Leaf carapace', (0, .075, .47), (.255, .25, .19), 'leaf', segments=8, rings=4)
c.taper('Trailing leaf', (0, .20, .48), (0, .47, .62), .17, .002, 'leaf', 'tail', 6)
c.taper('Pointed face', (0, -.20, .38), (0, -.48, .26), .19, .015, 'cream', 'head', 6)
c.ellipsoid('Lower jaw', (0, -.27, .23), (.15, .18, .08), 'wood', 'jaw', 8, 4)
c.eyes(-.267, .46, .13, .05)
for side, sign in (('L', -1), ('R', 1)):
    c.taper('Spring leg', (sign*.15, 0, .22), (sign*.23, -.03, .08), .065, .035, 'wood', 'leg.'+side, 5)
    c.ellipsoid('Foot', (sign*.23, -.085, .05), (.07, .13, .05), 'wood', 'leg.'+side, 6, 3)
c.animate(lambda action, t: motion('swarmer', action, t))
