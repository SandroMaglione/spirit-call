"""Hook-handed scavenger: forward brow, asymmetric swipe, narrow trailing tail."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import Creature, motion

c = Creature('chaser', {
    'body': ((0, 0, .62), 'root'), 'head': ((0, -.1, 1.1), 'body'),
    'arm.L': ((-.35, 0, .98), 'body'), 'arm.R': ((.35, 0, .98), 'body'),
    'leg.L': ((-.2, 0, .25), 'root'), 'leg.R': ((.2, 0, .25), 'root'),
    'tail': ((0, .25, .68), 'body'),
})
c.ellipsoid('Pear-shaped torso', (0, .03, .82), (.34, .28, .46), 'rust')
c.ellipsoid('Chest bib', (0, -.225, .81), (.23, .08, .32), 'orange')
c.ellipsoid('Heavy brow and skull', (0, -.10, 1.30), (.39, .31, .27), 'rust', 'head')
c.box('Brow ridge', (0, -.34, 1.40), (.69, .17, .12), 'orange', 'head', .035)
c.ellipsoid('Muzzle', (0, -.34, 1.20), (.22, .18, .13), 'cream', 'head')
c.eyes(-.389, 1.32, .19, .07)
for side, sign in (('L', -1), ('R', 1)):
    c.taper('Pointed ear', (sign*.28, .03, 1.4), (sign*.53, .15, 1.63), .15, .012, 'rust', 'head')
    c.ellipsoid('Shin', (sign*.20, .03, .28), (.12, .12, .24), 'ink', 'leg.'+side)
    c.ellipsoid('Planted foot', (sign*.20, -.09, .10), (.14, .23, .10), 'hide', 'leg.'+side)
c.taper('Small arm', (-.33, 0, .95), (-.48, -.10, .55), .13, .08, 'rust', 'arm.L')
c.ellipsoid('Small fist', (-.48, -.12, .53), (.12, .14, .13), 'hide', 'arm.L')
c.taper('Striking upper arm', (.33, 0, .99), (.50, -.03, .73), .18, .16, 'rust', 'arm.R')
c.taper('Oversized hooked forearm', (.50, -.03, .73), (.56, -.43, .55), .21, .12, 'hide', 'arm.R')
c.taper('Hook base', (.56, -.43, .55), (.52, -.64, .58), .12, .075, 'cream', 'arm.R')
c.taper('Hook tip', (.52, -.64, .58), (.46, -.67, .80), .075, .005, 'cream', 'arm.R')
c.taper('Tail', (0, .26, .68), (0, .62, .83), .11, .012, 'rust', 'tail')
c.animate(lambda action, t: motion('chaser', action, t))
