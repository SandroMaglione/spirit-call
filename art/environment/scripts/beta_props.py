"""Authored landmark, work, vegetation and objective props for the beta settings."""
import math
from geometry import Mesh
from beta_architecture import metadata
from props import prop
from beta_specs import UTILITIES


def beta_prop(recipe, style):
    m = utility(recipe, style) if recipe in UTILITIES else globals()[style](recipe)
    meta = metadata('prop')
    meta['placement_note'] = 'Decorative until runtime assigns collision or interaction. Keep large props at boundaries.'
    if recipe in UTILITIES:
        meta['presentation_role'] = 'Supply, navigation or objective art. No reward, activation or timer is defined here.'
        if recipe.startswith('beacon-'):
            meta['state_family'] = 'beacon'
            meta['state'] = recipe.removeprefix('beacon-')
            meta['sockets'] = [{'name': 'effect', 'position_m': [0, 1.35, 0]}]
        elif recipe.startswith('supply-cache'):
            meta['state_family'] = 'supply-cache'
            meta['state'] = 'open' if recipe.endswith('-open') else 'closed'
    return [('body', m, (0, 0, 0))], meta


def old(recipe):
    return prop(recipe, 'courtyard')[0][0][1]


def ring(radius=.4, tube=.035, shade='metal', n=16):
    return Mesh().lathe([(radius + tube, -tube), (radius + tube, tube),
                         (radius - tube, tube), (radius - tube, -tube)], [shade], n=n, cyclic=True)


def crystal(radius=.25, height=1, shade='accent', n=6):
    return Mesh().lathe([(radius * .8, 0), (radius, height * .15),
                         (radius * .86, height * .72), (.012, height)], ['dark', shade, 'edge'], n=n)


def vessel(radius=.4, height=.8, shade='stone'):
    return Mesh().lathe([(radius * .65, 0), (radius, height * .35), (radius * .8, height * .8),
                         (radius * .68, height), (radius * .52, height), (radius * .65, height * .35),
                         (radius * .45, .07)], [shade, shade, 'light', 'edge', shade, 'dark'], n=12)


def tray(w=1.2, d=.7, h=.5, shade='wood'):
    m = Mesh().box(0, 0, 0, w, d, .08, shade)
    for x in (-w / 2 + .04, w / 2 - .04):
        m.box(x, 0, .08, .08, d, h - .08, shade)
    for y in (-d / 2 + .04, d / 2 - .04):
        m.box(0, y, .08, w - .16, .08, h - .08, shade)
    return m


def table(w=1.5, d=.8, h=.75, shade='wood'):
    m = Mesh().box(0, 0, h - .10, w, d, .10, shade, top='light')
    for x in (-w * .38, w * .38):
        for y in (-d * .32, d * .32):
            m.box(x, y, 0, .12, .12, h - .1, shade)
    return m


def canopy(w=2.3, d=1.5, h=2):
    m = Mesh()
    for x in (-w / 2, w / 2):
        for y in (-d / 2, d / 2):
            m.beam((x, y, 0), (x, y, h), .055, 'wood', n=6)
    for s in (-1, 1):
        m.shell([[(0, y, h + .35), (s * (w / 2 + .15), y, h),
                  (s * (w / 2 + .15), y, h + .045), (0, y, h + .395)]
                 for y in (-d / 2 - .1, d / 2 + .1)], ['cloth'])
    return m


def tree(size=1, palm=False):
    m = Mesh().beam((0, 0, 0), (.12 * size, .04 * size, 2.1 * size), .12 * size, 'wood', n=7, radius_end=.075 * size)
    for i in range(5):
        a = i * math.tau / 5
        end = (math.cos(a) * .75 * size, math.sin(a) * .75 * size, (1.8 + .14 * (i % 2)) * size)
        m.beam((.1 * size, 0, 1.3 * size), end, .045 * size, 'wood', n=5)
        if palm:
            leaf = Mesh().shell([[(-.025, 0, 0), (.35, .8, -.25), (0, 1.3, -.5), (-.35, .8, -.25)],
                                 [(-.025, 0, .035), (.35, .8, -.215), (0, 1.3, -.465), (-.35, .8, -.215)]], ['green'])
            m.join(leaf.rotate(a).move(z=2.1 * size))
        else:
            m.rock(*end, 1.2 * size, .9 * size, .65 * size, 'cloth' if i % 3 else 'warm', seed=i)
    return m


def mushroom(radius=.6, h=1, shade='cloth'):
    m = Mesh().lathe([(.14, 0), (.1, h * .7), (.18, h)], ['wood', 'light'], n=7)
    m.lathe([(.15, h * .88), (radius, h * .95), (radius * .93, h * 1.07),
             (radius * .55, h * 1.3), (.025, h * 1.39)], ['light', shade, shade, 'edge'], n=10)
    return m


def boulder(w=1.6, d=1.1, h=1, seed=0):
    return Mesh().rock(0, 0, 0, w, d, h, 'stone', seed)


def wheel(radius=.25):
    m = ring(radius, .04, 'metal', 12)
    for i in range(4):
        a = i * math.pi / 4
        m.beam((-radius * math.cos(a), -radius * math.sin(a), 0),
               (radius * math.cos(a), radius * math.sin(a), 0), .025, 'wood', n=4)
    return m


def cart(loaded=False):
    m = tray(1.35, .8, .6, 'metal').move(z=.23)
    for x in (-.48, .48):
        for y in (-.46, .46):
            m.join(wheel(.23).rotate(math.pi / 2, 'X').move(x=x, y=y, z=.23))
    if loaded:
        for x, y in [(-.35, -.15), (.2, .15), (.4, -.1)]:
            m.join(crystal(.2, .6).move(x=x, y=y, z=.36))
    return m


def post(h=1.6):
    return Mesh().box(0, 0, 0, .4, .4, .12, 'stone').beam((0, 0, .12), (0, 0, h), .06, 'metal')


def utility(recipe, style):
    m = Mesh()
    if recipe.startswith('beacon-'):
        m.lathe([(.5, 0), (.5, .14), (.34, .2), (.27, .9), (.42, 1)], ['dark', 'light', 'stone', 'accent'], n=8)
        if recipe == 'beacon-active':
            m.join(crystal(.23, .65, 'warm').move(z=1.02))
            for i in range(4):
                a = i * math.pi / 2
                m.beam((.25 * math.cos(a), .25 * math.sin(a), .95),
                       (.46 * math.cos(a), .46 * math.sin(a), 1.25), .035, 'accent')
        else:
            m.lathe([(.3, 1), (.3, 1.12)], ['dark'], n=8)
    elif recipe.startswith('supply-cache'):
        m = tray(1.2, .7, .6)
        lid = Mesh().box(0, 0, 0, 1.2, .7, .10, 'wood', top='light')
        for x in (-.4, .4):
            lid.box(x, 0, .10, .07, .72, .03, 'metal', bevel=.004)
            m.box(x, -.356, .08, .07, .025, .51, 'metal', bevel=.004)
        if recipe.endswith('-open'):
            m.join(lid.move(y=-.35).rotate(-math.pi * .42, 'X').move(y=.35, z=.6))
            for x in (-.3, .1, .3):
                m.join(vessel(.14, .26, 'accent').move(x=x, z=.09))
        else:
            m.join(lid.move(z=.6))
            m.box(0, -.38, .44, .13, .05, .18, 'accent')
    elif recipe == 'waymarker':
        m = post(1.4)
        m.box(0, 0, 1.05, .8, .12, .25, 'wood', top='edge')
        m.join(Mesh().box(0, 0, 0, .12, .035, .12, 'accent').rotate(math.pi / 4, 'Y').move(x=.24, y=-.085, z=1.16))
    elif recipe == 'seal-plinth':
        m.lathe([(.6, 0), (.6, .12), (.42, .18), (.42, .42)], ['dark', 'stone', 'light'], n=8)
        m.join(ring(.27, .045, 'accent', 8).move(z=.47))
        m.join(crystal(.12, .33).move(z=.44))
    else:
        raise ValueError(recipe)
    return m


def harbor(r):
    m = Mesh()
    if r in ('bollard', 'jetty-post'):
        h = .55 if r == 'bollard' else 1.4
        m.lathe([(.22, 0), (.22, .1), (.16, .1 + .01), (.16, h), (.25, h + .07)], ['metal' if r == 'bollard' else 'wood'], n=8)
        for z in (.2, .3):
            m.join(ring(.175, .025, 'warm', 10).move(z=z))
    elif r in ('rope-coil', 'life-ring'):
        if r == 'life-ring':
            m = ring(.42, .09, 'cloth', 16).move(z=.09)
            for x in (-.42, .42):
                m.box(x, 0, 0, .19, .19, .185, 'edge', bevel=.03)
        else:
            for i in range(3):
                m.join(ring(.22 + .065 * i, .027, 'warm').move(z=.03))
            m.beam((.34, .05, .03), (.6, .4, .03), .025, 'warm')
    elif r == 'capstan':
        m.lathe([(.5, 0), (.5, .15), (.25, .23), (.25, .8), (.38, .9)], ['wood', 'metal', 'wood', 'metal'], n=8)
        for a in (0, math.pi / 2):
            m.beam((-.75 * math.cos(a), -.75 * math.sin(a), .72), (.75 * math.cos(a), .75 * math.sin(a), .72), .055, 'wood')
    elif r == 'dock-crane':
        m = post(2.3)
        m.beam((0, 0, 2.2), (1.35, 0, 2.5), .09, 'wood', n=4)
        m.beam((0, 0, 1.2), (1.05, 0, 2.4), .07, 'wood', n=4)
        m.beam((1.3, 0, 2.5), (1.3, 0, 1.1), .025, 'warm')
        m.join(ring(.14, .035, 'metal', 10).rotate(math.pi / 2, 'X').move(x=1.3, z=.97))
        m.join(wheel(.3).rotate(math.pi / 2, 'X').move(y=-.12, z=.8))
    elif r == 'anchor':
        m.beam((0, 0, .1), (0, 0, 1.4), .075, 'metal')
        m.beam((-.48, 0, 1.1), (.48, 0, 1.1), .06, 'wood')
        for s in (-1, 1):
            m.beam((0, 0, .1), (s * .55, 0, .35), .08, 'metal')
            m.beam((s * .55, 0, .35), (s * .62, 0, .62), .09, 'metal', radius_end=.02)
        m.join(ring(.15, .04).rotate(math.pi / 2, 'X').move(z=1.52))
    elif r == 'barrel-stack':
        for x, y, z in [(-.36, 0, 0), (.36, 0, 0), (0, .1, .78)]:
            m.join(old('barrel').move(x=x, y=y, z=z))
    elif r == 'fish-crate':
        m = tray(1.1, .65, .35)
        for i in range(4):
            m.rock(-.35 + i * .23, .02 * (i % 2), .10, .17, .48, .16, 'light', i)
    elif r == 'cargo-pallet':
        for x in (-.6, -.3, 0, .3, .6):
            m.box(x, 0, .10, .27, 1, .10, 'wood')
        for y in (-.35, .35):
            m.box(0, y, 0, 1.45, .16, .1, 'dark')
        m.join(old('crate').move(x=-.2, z=.2))
        m.join(vessel(.23, .6).move(x=.48, y=.18, z=.2))
    elif r in ('boat-hull', 'wreck-hull'):
        # Open hull with inner walls and a solid floor, no invisible cap.
        outer = [(-1.55, 0), (-.9, -.6), (.9, -.6), (1.55, 0), (.9, .6), (-.9, .6)]
        inner = [(x * .90, y * .80) for x, y in outer]
        bottom = [(x * .77, y * .6) for x, y in outer]
        m.shell([[(x, y, z) for x, y in pts] for pts, z in [(bottom, 0), (outer, .55), (inner, .55), (bottom, .12)]], ['wood', 'light', 'wood'])
        for x in (-.5, .5):
            if r == 'wreck-hull' and x > 0:
                m.join(Mesh().box(0, 0, 0, .20, .75, .08, 'wood').rotate(.35).move(x=x, z=.43))
            else:
                m.box(x, 0, .42, .22, 1, .08, 'wood')
        if r == 'wreck-hull':
            m.beam((-.5, .2, .2), (-.1, .3, 1.3), .07, 'wood')
    elif r == 'buoy':
        m.lathe([(.33, 0), (.42, .22), (.24, .62), (.08, .8)], ['metal', 'cloth', 'light'], n=10)
        m.join(ring(.09, .025).rotate(math.pi / 2, 'X').move(z=.89))
    elif r == 'net-rack':
        for x in (-.75, .75):
            m.beam((x, 0, 0), (x, 0, 1.6), .065, 'wood')
        m.beam((-.85, 0, 1.6), (.85, 0, 1.6), .06, 'wood')
        for i in range(7):
            x = -.6 + i * .2
            m.beam((x, 0, .4), (x, 0, 1.48), .012, 'warm', n=4)
        for j in range(6):
            m.beam((-.6, 0, .4 + j * .2), (.6, 0, .4 + j * .2), .012, 'warm', n=4)
    elif r == 'lantern-hook':
        m = post(1.7)
        m.beam((0, 0, 1.7), (.45, 0, 1.7), .045, 'metal')
        m.join(old('lantern').move(x=.45, z=.62))
    elif r in ('wave-rock', 'cliff-large', 'cliff-small'):
        w, h = (1.4, .6) if r == 'wave-rock' else (2.6, 2.4) if r == 'cliff-large' else (1.5, 1.3)
        m = boulder(w, w * .65, h, 3)
        m.rock(-w * .24, -.16, 0, w * .65, w * .55, h * .7, 'dark', 4)
    elif r == 'sail-awning':
        m = canopy()
    elif r == 'signpost':
        m = post(1.7)
        m.box(.25, 0, 1.25, .9, .13, .28, 'wood')
        m.box(-.18, 0, .85, .65, .13, .22, 'cloth')
    else:
        raise ValueError(r)
    return m


def desert(r):
    m = Mesh()
    if r in ('obelisk', 'obelisk-broken'):
        h = 2.4 if r == 'obelisk' else 1.15
        m.box(0, 0, 0, 1, 1, .18, 'dark', top='edge')
        m.lathe([(.46, .18), (.31, h - .35), (.025 if r == 'obelisk' else .26, h)], ['stone', 'light'], n=4)
        for i in range(3):
            m.box(0, -.225, .4 + i * .19, .09, .035, .10, 'accent', bevel=.004)
    elif r in ('sarcophagus', 'sarcophagus-open'):
        m = tray(.9, 1.9, .48, 'stone')
        lid = Mesh().box(0, 0, 0, 1, 2, .18, 'light', top='edge')
        lid.join(Mesh().lathe([(.22, 0), (.18, .08)], ['accent'], n=8).move(y=.4, z=.18))
        if r.endswith('-open'):
            m.join(lid.rotate(.23).move(x=.7, z=.43))
        else:
            m.join(lid.move(z=.48))
    elif r in ('canopic-jars', 'urn-tall', 'urn-broken'):
        if r == 'canopic-jars':
            for x, y, h in [(-.35, 0, .65), (.3, 0, .52), (0, .4, .72)]:
                m.join(vessel(.22, h, 'accent').move(x=x, y=y))
                m.join(crystal(.13, .12, 'light', 4).move(x=x, y=y, z=h))
        elif r == 'urn-tall':
            m = vessel(.4, 1.25)
        else:
            m = vessel(.45, .45)
            m.rock(.5, -.1, 0, .3, .2, .12, 'light', 3)
    elif r == 'sun-disc':
        m.box(0, 0, 0, 1.2, .65, .2, 'stone')
        m.join(ring(.6, .12, 'warm', 12).rotate(math.pi / 2, 'X').move(z=1.05))
        m.beam((0, 0, .2), (0, 0, 1.05), .12, 'stone')
        for i in range(8):
            a = i * math.tau / 8
            m.beam((math.cos(a) * .58, 0, 1.05 + math.sin(a) * .58),
                   (math.cos(a) * .86, 0, 1.05 + math.sin(a) * .86), .055, 'warm', n=4, radius_end=.015)
    elif r == 'offering-table':
        m = table(1.7, .85, .65, 'stone')
        m.join(vessel(.27, .12, 'accent').move(z=.65))
        for x in (-.55, .55):
            m.join(vessel(.15, .3).move(x=x, z=.65))
    elif r == 'wing-statue':
        m.box(0, 0, 0, 1.4, .65, .15, 'dark', top='edge')
        m.lathe([(.3, .15), (.25, .6), (.10, 1.05)], ['stone'], n=6)
        for s in (-1, 1):
            for i in range(5):
                m.beam((s * .12, 0, .65), (s * (.35 + i * .16), 0, 1.55 - i * .1), .07, 'light', n=4, radius_end=.025)
    elif r == 'sand-drift':
        m.rock(0, 0, 0, 2.3, 1.3, .22, 'earth', 4)
        m.rock(.5, .25, .02, 1.3, .65, .28, 'earth', 5)
    elif r in ('sand-rock-large', 'sand-rock-small'):
        m = boulder(2.2 if r.endswith('large') else 1.1, 1.3, 1.4 if r.endswith('large') else .55, 3)
    elif r == 'palm':
        m = tree(palm=True)
    elif r == 'dead-shrub':
        for i in range(5):
            a = i * math.tau / 5
            m.beam((0, 0, .02), (math.cos(a) * .38, math.sin(a) * .38, .65), .035, 'wood', n=5, radius_end=.012)
    elif r == 'market-awning':
        m = canopy(2.5, 1.4, 1.8)
        m.join(table(1.9, .65, .7))
    elif r == 'torch-stand':
        m = post(1.1)
        m.join(vessel(.24, .25, 'metal').move(z=1.05))
    elif r == 'rune-console':
        m.box(0, 0, 0, .7, .6, .2, 'dark')
        m.box(0, 0, .2, .55, .5, .5, 'stone')
        m.join(Mesh().box(0, 0, 0, .65, .6, .1, 'accent').rotate(.3, 'X').move(z=.75))
        for x in (-.17, .17):
            m.box(x, -.31, .36, .07, .025, .16, 'edge', bevel=.004)
    elif r == 'ruined-lintel':
        for x in (-.9, .9):
            m.box(x, 0, 0, .45, .55, 1.35 if x < 0 else .8, 'stone')
        m.join(Mesh().box(0, 0, 0, 2.1, .6, .3, 'light').rotate(-.25, 'Y').move(z=1.05))
    elif r == 'buried-column':
        m.join(Mesh().lathe([(.38, 0), (.32, .1), (.32, 1.5)], ['stone'], n=8).rotate(.65, 'Y').move(z=.1))
        m.rock(0, 0, 0, 1.4, 1, .32, 'earth', 2)
    else:
        raise ValueError(r)
    return m


def quarry(r):
    m = Mesh()
    if r in ('crystal-large', 'crystal-small', 'crystal-cluster', 'ore-vein'):
        if r == 'crystal-large':
            m = crystal(.45, 2.1)
        elif r == 'crystal-small':
            m = crystal(.23, .7)
        else:
            m = boulder(1.5, .9, .35, 2)
            for i, (x, y, h) in enumerate([(-.35, 0, .9), (.1, .2, 1.3), (.42, -.1, .65)]):
                c = crystal(.22, h if r == 'crystal-cluster' else h * .55)
                m.join(c.rotate((i - 1) * .2, 'Y').move(x=x, y=y, z=.2))
    elif r in ('mine-cart', 'cart-empty'):
        m = cart(r == 'mine-cart')
    elif r in ('track-straight', 'track-corner'):
        if r == 'track-straight':
            for y in (-.75, -.25, .25, .75):
                m.box(0, y, 0, 1.15, .15, .09, 'wood')
            for x in (-.4, .4):
                m.box(x, 0, .09, .06, 2, .08, 'metal', bevel=.007)
        else:
            for i in range(7):
                a, b = i * math.pi / 12, (i + 1) * math.pi / 12
                if i == 6:
                    break
                for radius in (.6, 1.4):
                    m.beam((math.cos(a) * radius - 1, math.sin(a) * radius - 1, .13),
                           (math.cos(b) * radius - 1, math.sin(b) * radius - 1, .13), .04, 'metal', n=4)
                a += math.pi / 24
                m.beam((math.cos(a) * .45 - 1, math.sin(a) * .45 - 1, .045),
                       (math.cos(a) * 1.55 - 1, math.sin(a) * 1.55 - 1, .045), .06, 'wood', n=4)
    elif r in ('timber-shoring', 'support-broken'):
        for x in (-.85, .85):
            m.box(x, 0, 0, .2, .3, 1.9 if r == 'timber-shoring' else (1.5 if x < 0 else .9), 'wood')
        beam = Mesh().box(0, 0, 0, 2.1, .3, .22, 'wood')
        m.join(beam.rotate(0 if r == 'timber-shoring' else .32, 'Y').move(z=1.9 if r == 'timber-shoring' else 1.2))
        if r == 'timber-shoring':
            for s in (-1, 1):
                m.beam((s * .8, 0, 1.3), (s * .35, 0, 1.9), .08, 'wood', n=4)
    elif r == 'winch':
        m = table(1.1, .7, .55, 'metal')
        m.join(Mesh().lathe([(.28, -.35), (.28, .35)], ['wood'], n=12).rotate(math.pi / 2, 'X').move(z=.85))
        for y in (-.39, .39):
            m.join(wheel(.34).rotate(math.pi / 2, 'X').move(y=y, z=.85))
    elif r == 'lift-cage':
        m = tray(1.5, 1.5, .18, 'metal')
        for x in (-.68, .68):
            for y in (-.68, .68):
                m.box(x, y, .18, .1, .1, 1.85, 'metal')
        m.box(0, 0, 2.03, 1.5, 1.5, .12, 'metal')
        for i in range(6):
            x = -.5 + i * .2
            m.box(x, .68, .18, .03, .06, 1.85, 'metal', bevel=.005)
    elif r == 'drill-rig':
        m = table(1.2, 1, .6, 'metal')
        m.beam((-.35, 0, .6), (-.35, 0, 1.82), .10, 'metal')
        m.box(0, 0, 1.6, 1, .6, .3, 'metal', top='accent')
        m.join(crystal(.22, .8, 'metal').rotate(math.pi, 'X').move(x=.32, z=1.6))
        for z in (1.0, 1.15, 1.3):
            m.join(ring(.16, .025, 'accent', 8).move(x=.32, z=z))
    elif r == 'ore-bin':
        m = tray(1.6, .9, .6)
        for i in range(6):
            m.rock(-.5 + (i % 3) * .5, -.2 + (i // 3) * .4, .1, .4, .35, .45, 'accent', i)
    elif r == 'pickaxe-rack':
        m = old('tool-rack')
        for x in (-.35, .35):
            m.beam((x, -.08, .15), (x, -.08, 1.05), .025, 'wood')
            m.beam((x - .2, -.08, 1), (x + .2, -.08, 1.1), .045, 'metal', n=4)
    elif r == 'mine-lamp':
        m = post(.6)
        m.box(0, 0, .5, .3, .3, .35, 'warm')
        m.join(ring(.14, .025).rotate(math.pi / 2, 'X').move(z=1))
    elif r in ('cave-rock-large', 'cave-rock-small'):
        m = boulder(2.6 if r.endswith('large') else 1.1, 1.4, 1.9 if r.endswith('large') else .75, 6)
    elif r == 'stalagmites':
        for x, y, h in [(-.4, 0, 1.1), (.2, .2, 1.8), (.45, -.25, .65)]:
            m.join(crystal(.24, h, 'stone', 7).move(x=x, y=y))
    elif r == 'powder-kegs':
        for x, y in [(-.3, 0), (.3, .15)]:
            m.join(old('barrel').move(x=x, y=y))
        m.box(0, -.4, .3, .35, .04, .25, 'cloth')
    else:
        raise ValueError(r)
    return m


def fungal(r):
    m = Mesh()
    if r == 'mushroom-giant':
        m = mushroom(.95, 1.9)
        for x in (-.28, .32):
            m.join(mushroom(.25, .4, 'accent').move(x=x, y=-.2))
    elif r == 'mushroom-cluster':
        for x, y, h in [(-.35, 0, .55), (.1, .2, .9), (.4, -.15, .4)]:
            m.join(mushroom(h * .6, h).move(x=x, y=y))
    elif r == 'shelf-fungus':
        m = boulder(.8, .6, 1.3, 2)
        for x, y, z in [(-.2, -.2, .3), (.2, -.1, .65), (0, .1, 1)]:
            m.rock(x, y, z, .85, .7, .18, 'cloth', 3)
    elif r in ('spore-pod', 'pod-open', 'cocoon'):
        m.lathe([(.35, 0), (.5, .4), (.4, .85), (.17, 1.2)], ['wood', 'cloth', 'light'], n=8)
        if r == 'pod-open':
            for i in range(6):
                a = i * math.tau / 6
                m.beam((.15 * math.cos(a), .15 * math.sin(a), .7),
                       (.7 * math.cos(a), .7 * math.sin(a), 1), .11, 'cloth', n=4, radius_end=.035)
            m.join(crystal(.18, .3, 'warm').move(z=1.18))
        elif r == 'cocoon':
            for z, rad in [(.2, .43), (.45, .5), (.7, .46), (.9, .35)]:
                m.join(ring(rad, .025, 'wood', 10).move(z=z))
    elif r in ('root-tangle', 'root-gateway', 'root-rib'):
        if r == 'root-gateway':
            m = old('root-arch')
            for x in (-1.05, 1.05):
                m.join(mushroom(.32, .6).move(x=x, y=.1))
        elif r == 'root-rib':
            pts = [(-.7, 0, 0), (-.55, 0, .85), (.05, 0, 1.55), (.65, 0, 1.7)]
            for i in range(3):
                m.beam(pts[i], pts[i + 1], .16 - i * .035, 'wood', n=6, radius_end=.11 - i * .035)
        else:
            m = old('root-clump')
            m.join(mushroom(.22, .33, 'accent').move(x=.2))
    elif r in ('hollow-stump', 'fallen-trunk', 'stepping-log'):
        log = Mesh().lathe([(.47, 0), (.4, .75), (.3, .75), (.34, .13)], ['wood', 'light', 'dark'], n=9)
        if r == 'fallen-trunk':
            log.vertices = [(x, y, z * 2.4) for x, y, z in log.vertices]
            m.join(log.rotate(math.pi / 2, 'Y').move(x=-.9, z=.47))
            m.join(mushroom(.32, .6).move(x=-.3, z=.45))
        elif r == 'stepping-log':
            m.lathe([(.65, 0), (.6, .25)], ['wood'], n=10)
            m.lathe([(.5, .25), (.5, .28)], ['light'], n=10)
            m.join(ring(.27, .015, 'wood', 10).move(z=.29))
        else:
            m = log
    elif r in ('reed-cluster', 'glow-stalk'):
        for i in range(7 if r == 'reed-cluster' else 3):
            a = i * 2.4
            x, y, h = .3 * math.cos(a), .3 * math.sin(a), .6 + .13 * (i % 4)
            m.beam((x, y, 0), (x * 1.35, y * 1.35, h), .025, 'green', n=5)
            m.join(crystal(.06 if r == 'reed-cluster' else .12, .22, 'warm').move(x=x * 1.35, y=y * 1.35, z=h))
    elif r == 'fungal-lantern':
        m = post(.9)
        m.join(mushroom(.38, .3, 'warm').move(z=.8))
    elif r == 'woven-basket':
        m = vessel(.45, .6, 'wood')
        for z in (.15, .3, .45):
            m.join(ring(.42, .025, 'warm', 12).move(z=z))
        m.join(ring(.3, .025, 'wood').rotate(math.pi / 2, 'X').move(z=.65))
    elif r == 'fungal-shrine':
        m = old('shrine')
        m.join(mushroom(.25, .45).move(x=.45, y=.1))
        m.join(mushroom(.2, .3, 'accent').move(x=-.42))
    elif r == 'cap-seat':
        m = mushroom(.55, .34)
    elif r == 'mycelium-rock':
        m = boulder(1.5, .9, .7, 5)
        for i in range(5):
            x = -.55 + i * .25
            m.beam((x, -.36, .15), (x + .15, -.34, .55), .022, 'accent', n=5)
        m.join(mushroom(.3, .45).move(x=.35, z=.45))
    elif r == 'leaf-shelter':
        m = canopy(2.2, 1.6, 1.6)
        for i in range(4):
            m.join(Mesh().rock(0, 0, 0, .75, 1.7, .12, 'green', i).rotate((i - 1.5) * .15, 'Y').move(x=-.75 + i * .5, z=1.8))
    else:
        raise ValueError(r)
    return m


def instrument_base():
    m = Mesh().lathe([(.45, 0), (.45, .13), (.22, .2), (.17, .7)], ['dark', 'light', 'metal'], n=8)
    return m


def storm(r):
    m = Mesh()
    if r in ('orrery', 'armillary', 'ring-pedestal'):
        m = instrument_base()
        if r == 'ring-pedestal':
            m.join(ring(.56, .07, 'accent').move(z=.78))
        else:
            m.join(ring(.58, .04, 'accent').rotate(math.pi / 2, 'X').move(z=1.35))
            m.join(ring(.5, .035, 'metal').rotate(math.pi / 3, 'Y').move(z=1.35))
            m.join(crystal(.18, .3, 'warm', 8).move(z=1.15))
            if r == 'orrery':
                m.join(ring(.8, .025, 'accent').move(z=1.25))
                for a in (0, 2, 4):
                    m.rock(math.cos(a) * .8, math.sin(a) * .8, 1.21, .18, .18, .18, 'warm', 3)
    elif r == 'telescope':
        m = instrument_base()
        tube = Mesh().lathe([(.18, -.55), (.18, .2), (.27, .3), (.27, .62), (.21, .62), (.16, .48)], ['metal', 'accent', 'metal', 'edge', 'dark'], n=12)
        m.join(tube.rotate(1.0, 'Y').move(z=1.18))
    elif r in ('lightning-rod', 'antenna-array', 'wind-vane'):
        m = post(2.2)
        if r == 'wind-vane':
            m.beam((-.65, 0, 1.9), (.65, 0, 1.9), .025, 'accent')
            m.join(Mesh().box(0, 0, 0, .35, .04, .35, 'cloth').rotate(math.pi / 4, 'Y').move(x=-.5, z=1.9))
        else:
            for i in range(3):
                z, w = 1.2 + .3 * i, .7 - .15 * i
                m.beam((-w, 0, z), (w, 0, z), .025, 'accent')
                if r == 'antenna-array':
                    for x in (-w, w):
                        m.beam((x, 0, z), (x, 0, z + .22), .02, 'metal')
            m.join(crystal(.06, .35, 'warm').move(z=2.2))
    elif r in ('conductor-coil', 'capacitor'):
        m.box(0, 0, 0, .85, .85, .15, 'stone')
        m.lathe([(.24, .15), (.24, 1.3)], ['metal'], n=10)
        for i in range(6):
            m.join(ring(.3 if r == 'conductor-coil' else .35, .035 if r == 'conductor-coil' else .06, 'accent', 12).move(z=.3 + i * .16))
        m.lathe([(.35, 1.3), (.35, 1.43)], ['light'], n=10)
    elif r in ('star-chart', 'console'):
        m = table(1.35, .8, .75, 'metal')
        if r == 'star-chart':
            m.join(ring(.28, .018, 'accent', 12).move(z=.78))
            for a in (0, 1, 2):
                m.beam((-.2 * math.cos(a), -.2 * math.sin(a), .78), (.2 * math.cos(a), .2 * math.sin(a), .78), .012, 'warm', n=4)
        else:
            for i in range(3):
                m.join(crystal(.07, .12, 'accent', 6).move(x=-.35 + i * .35, z=.75))
            m.box(0, .22, .75, 1, .2, .3, 'dark', top='edge')
    elif r in ('astrolabe', 'lens-stand', 'signal-dish'):
        m = instrument_base()
        if r == 'signal-dish':
            dish = vessel(.6, .25, 'metal')
            m.join(dish.rotate(.7, 'X').move(z=1))
            m.beam((0, 0, .7), (0, -.45, 1.5), .04, 'accent')
        else:
            m.join(ring(.46, .06, 'accent', 12).rotate(math.pi / 2, 'X').move(z=1.15))
            if r == 'astrolabe':
                m.beam((-.4, -.03, .9), (.4, -.03, 1.4), .025, 'metal')
                m.beam((0, -.03, .7), (0, -.03, 1.6), .02, 'metal')
    elif r == 'crystal-prism':
        m = instrument_base()
        m.join(crystal(.28, .9, 'accent', 3).move(z=.72))
    elif r == 'cable-spool':
        m.lathe([(.5, 0), (.5, .12), (.27, .13), (.27, .7), (.5, .71), (.5, .83)], ['wood', 'wood', 'dark', 'wood'], n=12)
        for z in (.2, .3, .4, .5, .6):
            m.join(ring(.29, .035, 'metal').move(z=z))
    elif r == 'instrument-crate':
        m = tray(1.25, .8, .6)
        for x in (-.35, .3):
            m.join(ring(.23, .055, 'accent', 12).rotate(math.pi / 2, 'X').move(x=x, z=.45))
    elif r == 'broken-ring':
        for i in range(10):
            a, b = i * math.pi / 8, (i + 1) * math.pi / 8
            m.beam((math.cos(a) * .65, 0, .8 + math.sin(a) * .65),
                   (math.cos(b) * .65, 0, .8 + math.sin(b) * .65), .065, 'accent', n=6)
        m.box(0, 0, 0, 1.3, .5, .15, 'stone')
    elif r == 'sky-rock':
        m = boulder(1.5, 1.2, .8, 4)
        m.join(crystal(.25, .6).rotate(.25, 'Y').move(x=.2, z=.55))
    elif r == 'banner-forked':
        m = post(1.9)
        m.beam((-.5, 0, 1.9), (.5, 0, 1.9), .04, 'accent')
        for x in (-.22, .22):
            m.box(x, 0, .82, .35, .035, 1, 'cloth', bevel=.005)
            m.join(crystal(.12, .2, 'accent', 4).rotate(math.pi, 'X').move(x=x, z=.82))
    else:
        raise ValueError(r)
    return m


def estate(r):
    m = Mesh()
    if r in ('maple-large', 'maple-small'):
        m = tree(1 if r.endswith('large') else .62)
    elif r in ('hedge-straight', 'hedge-corner', 'topiary'):
        if r == 'topiary':
            m = vessel(.38, .4)
            m.beam((0, 0, .35), (0, 0, 1.5), .06, 'wood')
            for z, sz in [(1, .85), (1.55, .6)]:
                m.rock(0, 0, z, sz, sz, sz * .6, 'green', 2)
        else:
            m.box(0, 0, 0, 2, .6, .18, 'stone', top='light')
            for x in (-.7, 0, .7):
                m.rock(x, 0, .18, .83, .62, .85, 'green', 2)
            if r == 'hedge-corner':
                m.box(-.7, .9, 0, .6, 1.2, .18, 'stone')
                for y in (.6, 1.25):
                    m.rock(-.7, y, .18, .62, .83, .85, 'green', 3)
    elif r in ('fountain', 'dry-fountain'):
        m = old('fountain')
        if r == 'dry-fountain':
            for i in range(6):
                a = i * 2.4
                m.rock(math.cos(a) * .62, math.sin(a) * .62, .16, .2, .13, .02, 'cloth', i)
        else:
            # A separate opaque water disk is visual dressing, not a hazard plane.
            m.lathe([(.82, .15), (.82, .16)], ['accent'], n=16)
    elif r == 'garden-bench':
        m = old('bench')
        for x in (-.65, .65):
            m.box(x, 0, .45, .07, .65, .20, 'wood')
    elif r in ('pergola', 'gazebo-roof'):
        if r == 'pergola':
            for x in (-1.15, 1.15):
                for y in (-.75, .75):
                    m.box(x, y, 0, .16, .16, 2.1, 'wood')
                m.box(x, 0, 2.1, .18, 1.9, .16, 'wood')
            for y in (-.8, -.4, 0, .4, .8):
                m.box(0, y, 2.26, 2.7, .12, .10, 'wood')
        else:
            m = canopy(2.4, 2.4, 2.1)
            for x in (-1.2, 1.2):
                m.box(x, 0, .65, .08, 2.4, .1, 'wood')
    elif r in ('tea-table', 'tea-stool'):
        if r == 'tea-stool':
            m = table(.55, .55, .4)
            m.box(0, 0, .4, .48, .48, .06, 'cloth')
        else:
            m = table(1.4, .85, .65)
            m.join(vessel(.14, .22, 'accent').move(z=.65))
            for x in (-.4, .4):
                m.join(vessel(.08, .09, 'light').move(x=x, z=.65))
    elif r == 'leaf-pile':
        for i in range(13):
            a, rad = i * 2.4, .15 + (i % 4) * .15
            m.rock(rad * math.cos(a), rad * math.sin(a), (i % 3) * .015, .25, .18, .025, 'cloth' if i % 2 else 'warm', i)
    elif r in ('planter-round', 'planter-square'):
        m = vessel(.5, .45) if r.endswith('round') else tray(.9, .9, .45, 'stone')
        for i in range(4):
            a = i * math.pi / 2
            m.rock(math.cos(a) * .2, math.sin(a) * .2, .35, .5, .4, .45, 'green', i)
    elif r == 'urn-pair':
        m.join(vessel(.33, 1, 'accent').move(x=-.35))
        m.join(vessel(.23, .65, 'light').move(x=.3, y=.1))
    elif r == 'birdbath':
        m = instrument_base()
        m.join(vessel(.48, .14, 'light').move(z=.7))
    elif r == 'lantern-stone':
        m.lathe([(.35, 0), (.35, .12), (.18, .2), (.15, .8)], ['stone'], n=6)
        m.box(0, 0, .8, .4, .4, .4, 'warm')
        for x in (-.22, .22):
            for y in (-.22, .22):
                m.box(x, y, .78, .07, .07, .5, 'stone')
        m.lathe([(.42, 1.28), (.10, 1.5)], ['light'], n=4)
    elif r == 'garden-screen':
        for x in (-.8, .8):
            m.box(x, 0, 0, .12, .15, 1.7, 'wood')
        for z in (.2, 1.5):
            m.box(0, 0, z, 1.6, .12, .1, 'wood')
        for x in (-.6, -.3, 0, .3, .6):
            m.box(x, 0, .3, .035, .06, 1.2, 'wood', bevel=.005)
        for z in (.6, .9, 1.2):
            m.box(0, 0, z, 1.5, .035, .035, 'wood', bevel=.005)
    elif r == 'wheelbarrow':
        m = tray(1.1, .65, .45).move(z=.3)
        m.join(wheel(.27).rotate(math.pi / 2, 'X').move(x=-.6, z=.27))
        for y in (-.22, .22):
            m.beam((.2, y, .3), (1.1, y, .65), .035, 'wood')
            m.beam((.4, y, 0), (.4, y, .3), .035, 'metal')
    else:
        raise ValueError(r)
    return m


def bookcase(w=1.4, h=1.8, broken=False, books=True):
    m = Mesh()
    for x in (-w / 2, w / 2):
        m.box(x, 0, 0, .1, .42, h if not broken or x < 0 else h * .65, 'wood')
    m.box(0, .2, 0, w, .05, h * .92, 'dark')
    for row in range(3 if h > 1 else 2):
        z = .1 + row * (h - .2) / (3 if h > 1 else 2)
        m.box(0, 0, z, w - .1, .42, .065, 'wood', top='light')
        if not books:
            continue
        for i in range(7):
            if broken and (i + row) % 3 == 0:
                continue
            bh = min(.38, h * .28) * (1 - .12 * (i % 3))
            m.box(-w / 2 + .14 + i * (w - .25) / 7, -.02, z + .065,
                  (w - .25) / 7 - .018, .3, bh, ['cloth', 'accent', 'earth'][i % 3], bevel=.005)
    if not broken:
        m.box(0, 0, h - .07, w + .12, .47, .1, 'light')
    return m


def archive(r):
    m = Mesh()
    if r.startswith('bookcase-'):
        m = bookcase(h=.85 if r == 'bookcase-low' else 1.8, broken=r == 'bookcase-broken')
    elif r in ('reading-desk', 'map-table'):
        m = table(1.7, 1, .75)
        m.box(0, 0, .75, 1.2, .68, .02, 'edge', bevel=.003)
        if r == 'map-table':
            for x, y, w, d in [(-.3, .1, .3, .2), (.25, -.1, .4, .25)]:
                m.rock(x, y, .775, w, d, .014, 'accent', 2)
        else:
            m.box(-.4, .1, .77, .35, .45, .10, 'cloth')
            m.join(vessel(.06, .1, 'metal').move(x=.4, z=.77))
    elif r == 'lectern':
        m = instrument_base()
        top = Mesh().box(0, 0, 0, .85, .65, .1, 'wood')
        top.box(0, 0, .1, .55, .5, .04, 'edge', bevel=.005)
        m.join(top.rotate(.32, 'X').move(z=.8))
    elif r in ('scroll-rack', 'scroll-pile'):
        if r == 'scroll-rack':
            m = bookcase(.9, 1.1, books=False)
            for x in (-.25, 0, .25):
                for z in (.22, .52, .82):
                    m.join(Mesh().lathe([(.055, 0), (.055, .35)], ['edge'], n=8).rotate(math.pi / 2, 'X').move(x=x, y=.1, z=z))
        else:
            for i in range(5):
                m.join(Mesh().lathe([(.07, 0), (.07, .6)], ['edge'], n=8).rotate(math.pi / 2, 'Y').move(x=-.3, y=-.2 + i * .1, z=.07 + (i % 2) * .13))
    elif r == 'book-stack':
        for i in range(5):
            m.join(Mesh().box(0, 0, 0, .45, .6, .09, 'cloth' if i % 2 else 'accent').rotate((i % 3 - 1) * .14).move(z=i * .10))
    elif r == 'armored-vault':
        m.box(0, 0, 0, 1.15, .8, 1.35, 'metal', top='light')
        m.box(0, -.43, .12, .92, .08, 1.1, 'dark')
        m.join(wheel(.23).rotate(math.pi / 2, 'X').move(y=-.5, z=.7))
        for x in (-.35, .35):
            m.box(x, -.49, .2, .08, .06, .9, 'accent')
    elif r == 'tablet-plinth':
        m = instrument_base()
        m.box(0, 0, .7, .7, .16, .7, 'stone', top='light')
        for i in range(3):
            m.box(0, -.09, .85 + i * .13, .42 - i * .07, .03, .035, 'accent', bevel=.004)
    elif r in ('coral-fan', 'coral-branch'):
        for i in range(7):
            a = -.9 + i * .3
            x, z = math.sin(a) * .75, .3 + math.cos(a) * .8
            m.beam((0, 0, .03), (x, 0, z), .035, 'cloth', n=5, radius_end=.02)
            if r == 'coral-branch':
                m.beam((x * .65, 0, z * .65), (x + .13, .16, z - .12), .025, 'cloth', n=5, radius_end=.012)
        if r == 'coral-fan':
            for z in (.4, .65, .9):
                m.beam((-.4, 0, z), (.4, 0, z + .04), .015, 'cloth', n=4)
    elif r == 'shell-cluster':
        for i in range(4):
            shell = vessel(.18 + .03 * i, .14, 'edge')
            m.join(shell.rotate(.2 * i, 'Y').move(x=-.4 + i * .25, y=(i % 2) * .2, z=.08))
    elif r == 'barnacle-rock':
        m = boulder(1.5, 1, .8, 3)
        for i in range(7):
            a = i * 2.4
            m.join(vessel(.07, .09, 'edge').move(x=.4 * math.cos(a), y=.3 * math.sin(a), z=.55 + (i % 2) * .12))
    elif r == 'diving-bell':
        m.lathe([(.62, 0), (.57, .12), (.53, .95), (.33, 1.35), (.06, 1.45)], ['metal', 'accent', 'metal', 'light'], n=12)
        for y in (-.5, .5):
            m.join(ring(.16, .035, 'accent', 10).rotate(math.pi / 2, 'X').move(y=y, z=.72))
        m.join(ring(.13, .035).rotate(math.pi / 2, 'X').move(z=1.57))
    elif r == 'globe':
        m = instrument_base()
        m.rock(0, 0, .72, .75, .75, .7, 'accent', 1)
        m.join(ring(.43, .025, 'warm').rotate(1.1, 'X').move(z=1.08))
    elif r == 'chain-post':
        m = post(.85)
        for i in range(6):
            m.join(ring(.09, .018, 'metal', 8).rotate(math.pi / 2, 'X').rotate((i % 2) * math.pi / 2).move(x=.1 + i * .13, z=.78 - .1 * math.sin(i * math.pi / 5)))
    elif r == 'archive-lamp':
        m = instrument_base()
        m.box(0, 0, .7, .35, .35, .32, 'warm')
        m.lathe([(.34, 1.02), (.16, 1.2)], ['metal'], n=8)
    elif r == 'sunken-statue':
        m.box(0, 0, 0, 1, .85, .16, 'stone')
        m.lathe([(.3, .16), (.25, .8), (.2, 1.2)], ['light'], n=7)
        m.rock(0, 0, 1.2, .4, .35, .4, 'stone', 1)
        m.beam((-.18, 0, 1), (-.5, -.05, .55), .08, 'light')
        m.beam((.18, 0, 1), (.45, -.05, .8), .08, 'light')
        m.join(vessel(.12, .25, 'cloth').move(x=.32, y=.2))
    else:
        raise ValueError(r)
    return m


def citadel(r):
    m = Mesh()
    if r == 'buttress-heavy':
        m = old('buttress')
        for z in (.3, .8, 1.3):
            m.box(0, .45, z, .64, .07, .1, 'metal')
    elif r in ('battlement', 'watchtower'):
        if r == 'battlement':
            m.box(0, 0, 0, 2, .65, .65, 'stone')
            for x in (-.75, 0, .75):
                m.box(x, 0, .65, .43, .65, .38, 'light')
        else:
            m.lathe([(.85, 0), (.75, .2), (.67, 2.5), (.85, 2.65)], ['dark', 'stone', 'light'], n=8)
            for i in range(8):
                a = i * math.pi / 4
                m.join(Mesh().box(0, 0, 0, .37, .26, .32, 'stone').rotate(a).move(x=math.sin(a) * .7, y=math.cos(a) * .7, z=2.65))
            m.box(0, -.68, .95, .16, .045, .5, 'dark')
    elif r in ('weapon-rack', 'shield-rack'):
        m = old('tool-rack')
        for x in (-.4, 0, .4):
            if r == 'weapon-rack':
                m.beam((x, -.1, .1), (x, -.1, 1.35), .025, 'wood')
                m.join(crystal(.08, .24, 'light', 4).move(x=x, y=-.1, z=1.35))
            else:
                shield = Mesh().lathe([(.24, 0), (.24, .055), (.06, .10)], ['metal', 'cloth'], n=6)
                m.join(shield.rotate(math.pi / 2, 'X').move(x=x, y=-.12, z=.8))
    elif r in ('banner-tall', 'victory-standard'):
        m = post(2.3)
        m.beam((-.55, 0, 2.2), (.55, 0, 2.2), .045, 'metal')
        m.box(0, 0, .85, .85, .04, 1.3, 'cloth', bevel=.005)
        m.join(Mesh().box(0, 0, 0, .22, .035, .22, 'accent').rotate(math.pi / 4, 'Y').move(y=-.04, z=1.5))
        if r == 'victory-standard':
            m.join(crystal(.18, .3, 'warm', 4).move(z=2.3))
            for x in (-.5, .5):
                m.box(x, 0, 1.7, .15, .04, .5, 'accent')
    elif r == 'war-table':
        m = table(1.8, 1, .8, 'wood')
        m.box(0, 0, .8, 1.5, .8, .018, 'earth', bevel=.003)
        for x, y in [(-.45, .2), (0, -.2), (.4, .1)]:
            m.join(crystal(.06, .16, 'cloth', 4).move(x=x, y=y, z=.82))
    elif r in ('throne', 'throne-broken'):
        m.box(0, 0, 0, 1.2, 1.1, .18, 'dark')
        m.box(0, 0, .18, .85, .8, .4, 'stone')
        m.box(0, 0, .58, .7, .65, .06, 'cloth')
        m.box(0, .33, .6, .9, .2, 1.15 if r == 'throne' else .5, 'stone')
        for x in (-.48, .48):
            m.box(x, 0, .35, .15, .9, .55, 'light')
        if r == 'throne':
            m.join(crystal(.2, .35, 'accent', 4).move(y=.33, z=1.75))
        else:
            m.rock(.7, -.4, 0, .5, .35, .3, 'stone', 2)
    elif r in ('brazier-large', 'brazier-small'):
        m = old('brazier')
        if r.endswith('large'):
            m.vertices = [(x * 1.5, y * 1.5, z * 1.45) for x, y, z in m.vertices]
            for i in range(4):
                a = i * math.pi / 2
                m.beam((.35 * math.cos(a), .35 * math.sin(a), .55), (.45 * math.cos(a), .45 * math.sin(a), 1.25), .035, 'metal')
    elif r in ('basalt-spires', 'basalt-rubble'):
        for i in range(5):
            a = i * 2.4
            h = 1.4 + .22 * (i % 3) if r == 'basalt-spires' else .2 + .12 * (i % 3)
            m.lathe([(.28, 0), (.25, h)], ['stone' if i % 2 else 'dark'], n=6, center=(math.cos(a) * .45, math.sin(a) * .45, 0))
    elif r == 'chain-anchor':
        m = boulder(1.2, .8, .5, 3)
        m.join(ring(.3, .08).rotate(math.pi / 2, 'X').move(z=.5))
        for i in range(4):
            m.join(ring(.1, .025, 'metal', 8).rotate((i % 2) * math.pi / 2, 'X').move(x=.1 + i * .18, z=.08))
    elif r == 'siege-crate':
        m = old('crate')
        for x in (-.3, .3):
            m.box(x, 0, .75, .09, .9, .07, 'metal')
        m.box(0, -.46, .24, .22, .06, .28, 'cloth')
    elif r == 'battering-ram':
        m = cart()
        m.beam((-1.2, 0, .9), (1.2, 0, .9), .24, 'wood', n=10)
        for x in (-1.1, 1.1):
            m.join(ring(.25, .05, 'metal', 10).rotate(math.pi / 2, 'Y').move(x=x, z=.9))
    elif r == 'drum':
        m.lathe([(.45, 0), (.48, .15), (.48, .65), (.45, .75)], ['metal', 'wood', 'metal'], n=12)
        m.lathe([(.41, .75), (.41, .78)], ['edge'], n=12)
        for a in (0, 1, 2):
            m.beam((-.3 * math.cos(a), -.3 * math.sin(a), .82), (.3 * math.cos(a), .3 * math.sin(a), .82), .022, 'wood')
    elif r == 'gargoyle':
        m.box(0, 0, 0, 1, .65, .18, 'dark')
        m.rock(0, 0, .18, .5, .4, .85, 'stone', 2)
        m.rock(0, -.2, .85, .35, .45, .3, 'light', 1)
        for s in (-1, 1):
            m.shell([[(s * .15, y, .5), (s * .85, y, 1.05), (s * .7, y, .55)]
                     for y in (-.03, .09)], ['stone'])
    elif r == 'cage':
        m = tray(1.25, 1.25, .15, 'metal')
        for side in range(4):
            for i in range(6):
                bar = Mesh().box(-.5 + i * .2, -.58, .15, .035, .05, 1.4, 'metal', bevel=.005)
                m.join(bar.rotate(side * math.pi / 2))
        m.box(0, 0, 1.55, 1.25, 1.25, .08, 'metal')
    else:
        raise ValueError(r)
    return m
