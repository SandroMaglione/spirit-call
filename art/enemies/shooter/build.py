"""Bell-mouthed spitter. Squat, soft body with a conspicuous firing organ."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import Creature, motion

c = Creature('shooter', {
    'body': ((0, .05, .48), 'root'), 'head': ((0, -.03, .92), 'body'),
    'jaw': ((0, -.22, .86), 'head'), 'arm.L': ((-.35, 0, .68), 'body'),
    'arm.R': ((.35, 0, .68), 'body'), 'leg.L': ((-.23, .03, .20), 'root'),
    'leg.R': ((.23, .03, .20), 'root'),
})
c.ellipsoid('Squat pear body', (0, .08, .66), (.43, .36, .48), 'purple')
c.ellipsoid('Soft belly', (0, -.235, .57), (.30, .10, .30), 'pink')
c.ellipsoid('Broad skull', (0, -.04, 1.05), (.40, .31, .28), 'purple', 'head')
c.taper('Bell throat', (0, -.24, .91), (0, -.60, .89), .16, .26, 'pink', 'jaw', 10)
c.taper('Bell lip', (0, -.58, .89), (0, -.66, .89), .28, .28, 'cream', 'jaw', 10)
c.ellipsoid('Dark mouth', (0, -.669, .89), (.219, .025, .219), 'ink', 'jaw', 10, 5)
c.eyes(-.30, 1.16, .21, .075)
for side, sign in (('L', -1), ('R', 1)):
    c.ellipsoid('Cheek gland', (sign*.34, -.11, .90), (.17, .20, .21), 'pink', 'head')
    c.taper('Short arm', (sign*.36, .02, .69), (sign*.49, -.12, .42), .105, .08, 'purple', 'arm.'+side)
    c.ellipsoid('Hand', (sign*.49, -.13, .40), (.10, .13, .10), 'cream', 'arm.'+side, 8, 4)
    c.ellipsoid('Short leg', (sign*.23, .03, .22), (.13, .13, .17), 'purple', 'leg.'+side)
    c.ellipsoid('Broad foot', (sign*.23, -.09, .085), (.17, .23, .085), 'ink', 'leg.'+side)
for y, z in ((.20, 1.25), (.38, 1.07), (.43, .85)):
    c.taper('Dorsal fin', (0, y, z-.10), (0, y+.12, z+.14), .11, .005, 'pink', 'body', 5)
c.animate(lambda action, t: motion('shooter', action, t))
