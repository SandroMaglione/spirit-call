"""Authored prop silhouettes. Geometry is opaque and uses the set's vertex palette."""
import math
from geometry import Mesh
from architecture import box_collision


def vessel(m, radius=.38, height=.8, shade='accent', center=(0, 0, 0)):
    m.lathe([(radius * .55, 0), (radius * .64, height * .10), (radius, height * .47),
             (radius * .88, height * .70), (radius * .65, height * .83),
             (radius * .70, height * .90), (radius * .70, height),
             (radius * .55, height), (radius * .53, height * .89),
             (radius * .70, height * .65), (radius * .81, height * .45),
             (radius * .42, height * .16)],
            ['dark', shade, shade, shade, 'metal', 'accent', 'accent', 'dark', 'dark', 'dark', 'dark'], center=center)


def pipe(m, a, b, radius=.18):
    # Hollow straight pipe, with flanges. Both mouths remain visibly open.
    length = (sum((a[i] - b[i]) ** 2 for i in range(3))) ** .5
    p = Mesh()
    p.lathe([(radius, 0), (radius, length), (radius * .72, length), (radius * .72, 0)], ['metal', 'metal', 'dark'], cyclic=True)
    for z in (.04, length - .08):
        p.lathe([(radius * 1.28, z), (radius * 1.28, z + .05), (radius * 1.01, z + .05), (radius * 1.01, z)], ['accent'], cyclic=True)
    from mathutils import Vector
    q = Vector((0, 0, 1)).rotation_difference(Vector(b) - Vector(a))
    p.vertices = [tuple(q @ Vector(v) + Vector(a)) for v in p.vertices]
    m.join(p)


def prop(recipe, style, **options):
    m = Mesh()
    parts = [('body', m, (0, 0, 0))]
    meta = {'category': 'prop', 'origin': 'Ground center', 'collision': [], 'walk_surfaces': [],
            'connections': [], 'moving_parts': [], 'sockets': [],
            'placement_note': 'Decoration by default. Gameplay must explicitly opt into obstruction or interaction.'}
    if recipe == 'urn':
        r, h = options.get('radius', .34), options.get('height', 1.15)
        vessel(m, r, h)
        for sign in (-1, 1):
            m.beam((sign * r * .8, 0, h * .55), (sign * r * 1.15, 0, h * .72), .055, 'accent')
    elif recipe == 'bench':
        for x in (-.58, .58):
            m.box(x, 0, 0, .22, .48, .39, 'stone', top='edge')
        for y in (-.16, .04, .24):
            m.box(0, y, .39, 1.65, .18, .12, 'wood')
        for x in (-.70, .70):
            m.box(x, .25, .4, .10, .1, .62, 'metal')
        m.box(0, .25, .72, 1.65, .10, .25, 'wood')
    elif recipe == 'planter':
        vessel(m, .55, .53, 'stone')
        m.lathe([(.41, .39), (.41, .41)], ['earth'])
        for i in range(7):
            a = i * math.tau / 7
            m.rock(.25 * math.cos(a), .25 * math.sin(a), .40, .44, .40, .35, 'green', i)
    elif recipe in ('fountain', 'basin'):
        r = 1.05 if recipe == 'fountain' else .8
        m.lathe([(r * .88, 0), (r, .10), (r, .3), (r * .90, .40),
                 (r * .77, .40), (r * .77, .12)], ['dark', 'stone', 'edge', 'light', 'dark'], n=16)
        if recipe == 'fountain':
            m.lathe([(.24, .12), (.18, .3), (.15, .75), (.4, .85), (.48, 1), (.40, 1.04), (.18, .86)], ['stone', 'stone', 'accent', 'accent', 'edge', 'dark'])
        meta['sockets'] = [{'name': 'water-surface', 'position_m': [0, .2, 0], 'note': 'Optional presentation effect; dry geometry supplied.'}]
    elif recipe in ('lantern', 'lantern-post', 'brazier'):
        h = 1.7 if recipe == 'lantern-post' else .85
        m.box(0, 0, 0, .42, .42, .12, 'stone', top='edge')
        m.lathe([(.11, .12), (.08, .24), (.08, h - .35), (.16, h - .30)], ['metal'])
        if recipe == 'brazier':
            vessel(m, .34, .32, 'metal', (0, 0, h - .30))
        else:
            m.box(0, 0, h - .33, .36, .36, .06, 'metal')
            m.box(0, 0, h - .27, .22, .22, .28, 'warm')
            for x in (-.14, .14):
                for y in (-.14, .14):
                    m.box(x, y, h - .27, .035, .035, .3, 'metal', bevel=.005)
            m.lathe([(.28, h + .035), (.26, h + .09), (.05, h + .23)], ['metal', 'accent'], n=4)
        meta['sockets'] = [{'name': 'light', 'position_m': [0, h - .10, 0], 'note': 'No light or emissive shader included.'}]
    elif recipe in ('stump', 'fallen-log', 'timber-post'):
        r, h = (.44, .62) if recipe == 'stump' else (.25, 1.9) if recipe == 'fallen-log' else (.18, 1.7)
        m.lathe([(r * 1.25, 0), (r, .18), (r * .91, h - .06), (r * .82, h)], ['wood', 'wood', 'earth'], n=9)
        m.lathe([(r * .57, h + .001), (r * .57, h + .015)], ['warm'], n=9)
        if recipe == 'fallen-log':
            m.rotate(math.pi / 2, 'Y').move(x=-h / 2, z=r * 1.25)
        elif recipe == 'stump':
            for i in range(5):
                a = i * math.tau / 5
                m.beam((0, 0, .35), (.75 * math.cos(a), .75 * math.sin(a), .055), .09, 'wood', radius_end=.025)
    elif recipe in ('root-arch', 'root-clump', 'timber-arch'):
        if recipe == 'root-clump':
            for i in range(5):
                a = i * 1.4
                m.beam((0, 0, .5), (.8 * math.cos(a), .6 * math.sin(a), .07), .11, 'wood', radius_end=.028)
        else:
            for s in (-1, 1):
                pts = [(s * 1.2, 0, 0), (s * 1.02, 0, 1.2), (s * .65, 0, 2.0), (0, 0, 2.3)]
                for i in range(3):
                    m.beam(pts[i], pts[i + 1], .19 - i * .04, 'wood', radius_end=.15 - i * .04)
            if recipe == 'root-arch':
                for x in (-1.1, .85):
                    m.rock(x, 0, 1.85, .72, .55, .38, 'green', seed=2)
    elif recipe in ('sapling', 'bush', 'fern'):
        if recipe == 'sapling':
            m.beam((0, 0, 0), (.06, 0, 1.5), .12, 'wood', radius_end=.055)
            for x, y, z, r in [(-.3, 0, .9, .65), (.3, .07, 1.25, .65), (0, 0, 1.7, .55)]:
                m.rock(x, y, z, r, r, .55, 'green')
        elif recipe == 'bush':
            for i, (x, y) in enumerate([(-.3, 0), (.28, .05), (0, -.15)]):
                m.rock(x, y, 0, .65, .6, .6 - .1 * i, 'green', i)
        else:
            for i in range(7):
                a = i * math.tau / 7
                m.beam((0, 0, .03), (.43 * math.cos(a), .43 * math.sin(a), .3), .04, 'green', n=4, radius_end=.005)
                for j in range(1, 4):
                    for s in (-1, 1):
                        p = (.1 * j * math.cos(a), .1 * j * math.sin(a), .07 * j)
                        q = (p[0] + .13 * math.cos(a + s * .8), p[1] + .13 * math.sin(a + s * .8), p[2] + .04)
                        m.beam(p, q, .045, 'green', n=4, radius_end=.004)
    elif recipe == 'mushrooms':
        for x, y, h in [(-.22, 0, .6), (.22, .12, .4), (.2, -.22, .25)]:
            m.beam((x, y, 0), (x, y, h * .75), h * .075, 'edge')
            m.lathe([(h * .42, h * .70), (h * .44, h * .76), (h * .30, h * .95), (h * .05, h)], ['earth', 'warm', 'warm'], center=(x, y, 0))
    elif recipe in ('shrine', 'shrine-broken'):
        m.box(0, 0, 0, 1.2, .85, .16, 'dark', top='edge')
        m.box(0, .06, .16, .84, .5, .22, 'stone')
        if recipe == 'shrine-broken':
            m.rock(-.12, 0, .38, .7, .45, .48)
            m.rock(.52, -.30, 0, .38, .35, .35, seed=3)
        else:
            m.lathe([(.30, .38), (.22, .47), (.20, 1.1), (.32, 1.25), (.1, 1.5)], ['stone', 'light', 'accent', 'edge'], n=4)
            m.box(0, -.155, .65, .12, .05, .26, 'accent')
    elif recipe.startswith('channel-'):
        m.box(0, 0, -.28, .75, .75, .08, 'dark')
        arms = [0, 2] if recipe == 'channel-straight' else [0, 1] if recipe == 'channel-corner' else [0, 1, 2, 3]
        for i in range(4):
            segment = Mesh()
            if i in arms:
                segment.box(.6875, 0, -.28, .625, .75, .08, 'dark')
                for y in (-.32, .32):
                    segment.box(.6875, y, -.2, .625, .11, .2, 'stone', top='edge')
            else:
                segment.box(.32, 0, -.2, .11, .75, .2, 'stone', top='edge')
            m.join(segment.rotate(i * math.pi / 2))
        meta['origin'] = 'Top center; recessed drainage channel, not a walkable floor'
        meta['connections'] = [{'name': 'channel-' + str(i), 'position_m': [round(math.cos(i * math.pi / 2), 6), 0, round(-math.sin(i * math.pi / 2), 6)]} for i in arms]
    elif recipe in ('pipe-straight', 'pipe-elbow', 'pipe-outlet'):
        if recipe == 'pipe-elbow':
            path = [(-.8, 0, 0)] + [(-.4 + .4 * math.sin(i * math.pi / 10), .4 - .4 * math.cos(i * math.pi / 10), i * math.pi / 10) for i in range(6)] + [(0, .8, math.pi / 2)]
            rings = []
            for radius, samples in [(.18, path), (.13, list(reversed(path)))]:
                for x, y, angle in samples:
                    rings.append([(x - math.sin(angle) * radius * math.cos(i * math.tau / 12),
                                   y + math.cos(angle) * radius * math.cos(i * math.tau / 12),
                                   .23 + radius * math.sin(i * math.tau / 12)) for i in range(12)])
            m.shell(rings, ['metal'], cyclic=True)
        else:
            pipe(m, (-.8, 0, .23), (.8, 0, .23))
        if recipe == 'pipe-outlet':
            m.box(-.8, 0, 0, .15, .75, .9, 'stone')
    elif recipe == 'valve':
        m.box(0, 0, 0, .5, .4, .18, 'stone')
        m.beam((0, 0, .18), (0, 0, .8), .08, 'metal')
        wheel = Mesh()
        wheel.lathe([(.32, -.035), (.32, .035), (.26, .035), (.26, -.035)], ['accent'], cyclic=True)
        for i in range(5):
            a = i * math.tau / 5
            wheel.beam((0, 0, 0), (.27 * math.cos(a), .27 * math.sin(a), 0), .026, 'metal')
        m.join(wheel.rotate(math.pi / 2, 'X').move(y=-.08, z=.85))
    elif recipe == 'buttress':
        m.box(0, 0, 0, .9, 1, .15, 'stone', top='edge')
        m.box(0, .2, .15, .58, .48, 1.55, 'stone', top='light')
        for i in range(4):
            m.box(0, -.25 + i * .13, .15 + i * .27, .58, .26, .28, 'light')
    elif recipe == 'sluice':
        for x in (-.9, .9):
            m.box(x, 0, 0, .25, .5, 2.1, 'stone', top='edge')
        m.box(0, 0, 2.1, 2.05, .5, .2, 'metal')
        panel = Mesh().box(0, 0, 0, 1.5, .16, 1.6, 'metal')
        for z in (.15, .65, 1.25):
            panel.box(0, -.1, z, 1.48, .08, .1, 'accent')
        parts.append(('sluice-panel', panel, (0, 0, .03)))
        meta['moving_parts'] = [{'node': 'sluice-panel', 'kind': 'slide', 'axis': '+Y', 'closed_position_m': [0, .03, 0], 'open_position_m': [0, 1.7, 0], 'closed_collision': box_collision(1.5, .16, 1.6, z=.03)}]
        meta['opening'] = {'clear_width_m': 1.55, 'clear_height_m': 1.7, 'depth_m': .5}
        meta['collision'] = [box_collision(.25, .5, 2.1, x=x) for x in (-.9, .9)]
    elif recipe in ('boiler', 'pump'):
        m.lathe([(.5, 0), (.55, .13), (.55, 1.25), (.38, 1.5), (.18, 1.55)], ['metal', 'metal', 'accent', 'metal'])
        for z in (.25, 1.15):
            m.lathe([(.57, z), (.57, z + .10)], ['accent'])
        pipe(m, (.45, 0, .45), (1, 0, .45))
        m.box(0, -.55, .7, .27, .07, .3, 'warm')
        if recipe == 'pump':
            m.beam((0, 0, 1.55), (.55, 0, 1.78), .065, 'metal')
    elif recipe == 'furnace':
        m.box(0, .12, 0, 1.85, 1.2, 1.7, 'stone', top='light')
        m.box(0, -.5, .28, 1.15, .08, .9, 'dark')
        m.box(0, -.55, .36, .78, .03, .61, 'warm')
        for x in (-.45, -.225, 0, .225, .45):
            m.box(x, -.60, .3, .06, .08, .85, 'metal')
        m.box(0, .12, 1.7, 1.95, 1.3, .15, 'metal')
        pipe(m, (0, .15, 1.85), (0, .15, 2.5), .24)
        meta['sockets'] = [{'name': 'fire', 'position_m': [0, .65, .62], 'note': 'Optional presentation effect.'}]
    elif recipe == 'chimney':
        for i in range(7):
            m.box(0, 0, i * .3, .65, .65, .29, 'stone' if i % 2 else 'light')
        m.lathe([(.47, 2.1), (.47, 2.3), (.27, 2.3), (.27, 2.1)], ['metal'], n=4, cyclic=True)
    elif recipe == 'vent':
        m.box(0, 0, 0, 1, .6, .12, 'metal')
        for i in range(5):
            m.box(0, -.24 + i * .12, .12, .86, .065, .12, 'accent')
    elif recipe == 'crucible':
        vessel(m, .55, .72, 'metal')
        for x in (-.6, .6):
            m.beam((x * .7, 0, .5), (x, 0, .5), .08, 'accent')
    elif recipe in ('cart', 'coal-bin'):
        m.box(0, 0, .25, 1.3, .85, .14, 'wood')
        for x in (-.60, .60):
            m.box(x, 0, .39, .10, .85, .48, 'metal')
        for y in (-.38, .38):
            m.box(0, y, .39, 1.1, .1, .48, 'wood')
        if recipe == 'cart':
            for x in (-.72, .72):
                for y in (-.28, .28):
                    m.beam((x - .06, y, .25), (x + .06, y, .25), .24, 'metal', n=10)
            for y in (-.29, .29):
                m.beam((.6, y, .6), (1.3, y, .6), .06, 'wood')
        else:
            for i in range(6):
                m.rock(-.4 + i % 3 * .4, -.18 + i // 3 * .35, .4, .44, .4, .42, 'dark', i)
    elif recipe == 'anvil':
        m.box(0, 0, 0, .7, .55, .12, 'metal')
        m.box(0, 0, .12, .34, .3, .35, 'metal')
        m.box(0, 0, .47, .88, .4, .22, 'metal', top='light')
        m.beam((.4, 0, .58), (.82, 0, .58), .16, 'metal', radius_end=.025)
    elif recipe == 'barrel':
        m.lathe([(.29, 0), (.38, .18), (.41, .5), (.35, .84), (.3, .91)], ['wood', 'wood', 'wood', 'earth'])
        for z, r in [(.12, .365), (.70, .39)]:
            m.lathe([(r, z), (r, z + .09)], ['metal'])
    elif recipe in ('crate', 'tool-rack'):
        if recipe == 'crate':
            m.box(0, 0, 0, .85, .75, .7, 'wood')
            for x in (-.32, .32):
                m.box(x, -.39, .04, .1, .05, .62, 'metal')
            m.beam((-.32, -.43, .06), (.32, -.43, .64), .055, 'earth', n=4)
        else:
            for x in (-.6, .6):
                m.box(x, 0, 0, .1, .4, 1.45, 'wood')
            m.box(0, 0, 1.25, 1.4, .15, .12, 'metal')
            for x in (-.35, 0, .35):
                m.beam((x, -.04, .35), (x, -.04, 1.2), .035, 'wood')
                m.box(x, -.04, .96, .23, .15, .14, 'metal')
    elif recipe in ('bell', 'bell-arch'):
        bell = Mesh()
        bell.lathe([(.40, 0), (.46, .09), (.42, .18), (.26, .5), (.22, .72), (.09, .82),
                    (.06, .77), (.16, .65), (.20, .45), (.35, .15), (.36, 0)], ['accent', 'metal', 'accent', 'accent', 'metal', 'dark', 'dark', 'dark', 'dark', 'dark'], cyclic=True)
        bell.beam((0, 0, .6), (0, 0, -.04), .045, 'metal')
        if recipe == 'bell-arch':
            for x in (-.85, .85):
                m.box(x, 0, 0, .28, .55, 2.05, 'stone', top='snow')
            m.beam((-.95, 0, 1.95), (.95, 0, 1.95), .13, 'wood')
            m.join(bell.move(z=1.04))
            m.beam((0, 0, 1.84), (0, 0, 1.95), .05, 'metal')
        else:
            m.join(bell.move(z=.04))
    elif recipe in ('snow-rocks', 'snowdrift'):
        for i, (x, y, h) in enumerate([(-.27, 0, .62), (.36, .1, .38), (.1, -.3, .22)]):
            m.rock(x, y, 0, .8, .62, h if recipe == 'snow-rocks' else h * .4, 'stone' if recipe == 'snow-rocks' else 'snow', i)
            if recipe == 'snow-rocks':
                m.rock(x, y, h * .76, .64, .50, .12, 'snow', i)
    elif recipe == 'ice-cluster':
        for x, y, h in [(-.18, 0, .9), (.22, .04, .65), (0, -.28, .4)]:
            m.lathe([(.16, 0), (.19, h * .15), (.16, h * .73), (.015, h)], ['stone', 'light', 'edge'], n=5, center=(x, y, 0))
    elif recipe == 'banner':
        m.box(0, 0, 0, .48, .48, .12, 'stone')
        m.beam((0, 0, .12), (0, 0, 1.8), .045, 'metal')
        m.beam((-.43, 0, 1.6), (.43, 0, 1.6), .035, 'metal')
        m.box(0, 0, .66, .68, .045, .93, 'cloth', bevel=.007)
        m.box(0, -.026, .97, .15, .008, .3, 'accent', bevel=.002)
    elif recipe == 'roof-canopy':
        for x in (-1, 1):
            m.box(x, 0, 0, .17, .3, 1.8, 'wood')
        for s in (-1, 1):
            r = Mesh().box(s * .56, 0, 0, 1.2, 1.25, .10, 'metal')
            r.rotate(s * .4, 'Y').move(z=2.22)
            m.join(r)
            cap = Mesh().box(s * .56, .04, 0, 1.2, 1.14, .045, 'snow')
            m.join(cap.rotate(s * .4, 'Y').move(z=2.305))
    else:
        raise ValueError(recipe)
    return parts, meta
