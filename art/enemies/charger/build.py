"""Low ram beetle with a bronze wedge, plated back and four pounding feet."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import Creature, motion

c = Creature('charger', {
    'body': ((0, .06, .45), 'root'), 'head': ((0, -.33, .57), 'body'),
    'leg.L': ((-.31, -.30, .20), 'root'), 'leg.R': ((.31, -.30, .20), 'root'),
    'back.L': ((-.32, .35, .20), 'root'), 'back.R': ((.32, .35, .20), 'root'),
})
c.ellipsoid('Barrel body', (0, .09, .57), (.42, .61, .36), 'rust')
c.ellipsoid('Back carapace', (0, .14, .73), (.44, .49, .30), 'pink')
for y in (-.1, .15, .40):
    c.box('Carapace band', (0, y, .92), (.55, .08, .10), 'rust', bevel=.025)
c.ellipsoid('Armored head', (0, -.45, .60), (.36, .35, .26), 'rust', 'head')
c.taper('Bronze charging wedge', (0, -.55, .69), (0, -1.01, .59), .27, .045, 'gold', 'head', 5)
c.box('Heavy brow', (0, -.55, .83), (.68, .22, .12), 'gold', 'head', .035)
c.eyes(-.706, .71, .23, .058)
for side, sign in (('L', -1), ('R', 1)):
    for prefix, y in (('leg.', -.30), ('back.', .35)):
        c.ellipsoid('Shoulder', (sign*.33, y, .39), (.19, .22, .24), 'hide', prefix+side)
        c.taper('Foreleg', (sign*.37, y, .36), (sign*.40, y-.05, .12), .11, .095, 'ink', prefix+side)
        c.ellipsoid('Hoof', (sign*.40, y-.09, .09), (.15, .20, .09), 'gold', prefix+side, 8, 4)
c.animate(lambda action, t: motion('charger', action, t))
