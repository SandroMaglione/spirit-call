"""A walking weight: chipped stone, bronze braces and enormous hammer hands."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import Creature, motion

c = Creature('brute', {
    'body': ((0, .07, .80), 'root'), 'head': ((0, -.05, 1.63), 'body'),
    'arm.L': ((-.64, 0, 1.47), 'body'), 'arm.R': ((.64, 0, 1.47), 'body'),
    'leg.L': ((-.32, .05, .29), 'root'), 'leg.R': ((.32, .05, .29), 'root'),
})
c.box('Massive torso', (0, .07, 1.20), (1.10, .73, 1.02), 'darkstone', bevel=.19)
c.box('Breastplate', (0, -.35, 1.18), (.81, .17, .71), 'stone', bevel=.10)
c.box('Small recessed head', (0, -.08, 1.80), (.43, .39, .42), 'stone', 'head', .08)
c.box('Brow ledge', (0, -.31, 1.91), (.51, .15, .10), 'gold', 'head', .025)
c.eyes(-.28, 1.81, .12, .06)
c.box('Chest inset', (0, -.449, 1.29), (.25, .035, .30), 'jade', bevel=.025)
for side, sign in (('L', -1), ('R', 1)):
    c.box('Shoulder block', (sign*.69, .01, 1.54), (.49, .66, .50), 'stone', 'arm.'+side, .10)
    c.taper('Bronze elbow', (sign*.73, 0, 1.35), (sign*.85, -.06, 1.01), .18, .18, 'gold', 'arm.'+side)
    c.box('Hammer fist', (sign*.85, -.13, .83), (.56, .61, .60), 'stone', 'arm.'+side, .11)
    c.box('Fist band', (sign*.85, -.13, .89), (.58, .63, .13), 'gold', 'arm.'+side, .035)
    c.box('Thick shin', (sign*.32, .05, .40), (.32, .37, .49), 'darkstone', 'leg.'+side, .055)
    c.box('Stone foot', (sign*.32, -.08, .15), (.42, .60, .30), 'stone', 'leg.'+side, .075)
    c.box('Back brace', (sign*.30, .45, 1.20), (.12, .08, .83), 'gold', bevel=.02)
c.animate(lambda action, t: motion('brute', action, t))
