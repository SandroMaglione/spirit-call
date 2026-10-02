"""Construction silhouettes for eight settings, sharing the established meter grid."""
import math
from architecture import architecture, box_collision, connections, walk_rect, STRUCTURES
from beta_specs import EXTRA_STRUCTURES
from geometry import Mesh


def metadata(category='architecture'):
    return {'category': category, 'origin': 'Ground center', 'collision': [],
            'walk_surfaces': [], 'connections': [], 'moving_parts': [], 'sockets': []}


def wall(m, w, d, h, style, broken=False):
    m.box(0, 0, 0, w, d, .12, 'dark', top='light')
    if style in ('harbor', 'estate'):
        m.box(0, 0, .12, w - .07, d - .08, h - .22, 'stone')
        n = max(1, round(w / .5))
        for i in range(n + 1):
            x = -w / 2 + .09 + i * (w - .18) / n
            m.box(x, -d / 2, .12, .1, .075, h - .15, 'wood')
        if h > .6:
            for z in (.25, h - .18):
                m.box(0, -d / 2 - .025, z, w - .08, .065, .075, 'wood')
    elif style in ('quarry', 'fungal'):
        count = max(2, round(w / .65))
        for i in range(count):
            rock = Mesh().rock(-w / 2 + (i + .5) * w / count, 0, .1,
                               w / count * .98, d * .9, h - .16, 'stone', seed=i)
            m.join(rock)
        if style == 'quarry':
            for x in (-w / 2 + .12, w / 2 - .12):
                m.box(x, -d / 2, 0, .16, .16, h, 'wood')
            m.box(0, -d / 2, h - .15, w, .16, .15, 'wood')
        else:
            m.beam((-w * .42, -d * .5, .15), (w * .38, -d * .5, h * .73), .06, 'wood', radius_end=.025)
    elif style == 'citadel':
        for row in range(max(1, round(h / .3))):
            count = max(1, round(w / .7))
            dh = (h - .22) / max(1, round(h / .3))
            for i in range(count):
                m.box(-w / 2 + (i + .5) * w / count, 0, .12 + row * dh,
                      w / count - .02, d - .06, dh - .008, 'stone' if (i + row) % 3 else 'light')
        for x in (-w / 2 + .10, w / 2 - .10):
            m.box(x, -d / 2, .1, .1, .055, h - .16, 'metal')
    else:
        courses = 2 if h < 1.1 else 4
        dh = (h - .22) / courses
        for j in range(courses):
            m.box(0, 0, .12 + j * dh, w - .06, d - .08, dh - .012, 'stone' if j % 2 else 'light')
        if h > .6:
            if style == 'desert':
                for x in (-w * .3, w * .3):
                    m.box(x, -d / 2 + .012, h * .35, .085, .05, h * .32, 'accent', bevel=.008)
            elif style == 'storm':
                for x in (-w * .3, w * .3):
                    m.join(Mesh().box(0, 0, -.13, .19, .035, .26, 'accent').rotate(math.pi / 4, 'Y').move(x=x, y=-d / 2, z=h * .52))
            elif style == 'archive':
                m.box(0, -d / 2 + .005, h * .3, w * .86, .035, .035, 'accent', bevel=.004)
                for x in (-w * .36, w * .36):
                    m.box(x, -d / 2, .12, .09, .07, h - .2, 'light')
    if not broken:
        m.box(0, 0, h - .10, w, d, .10, 'edge')
    else:
        for i, x in enumerate((-.28 * w, .18 * w)):
            m.rock(x, .03, h - .12, min(w * .3, .7), d * .7, .26, seed=i)


def column(m, size, height, style, broken=False):
    m.box(0, 0, 0, size, size, .13, 'dark', top='edge')
    if style in ('harbor', 'estate'):
        m.box(0, 0, .13, size * .60, size * .60, height - .26, 'wood')
        for z in (.25, height - .3):
            m.box(0, 0, z, size * .67, size * .67, .10, 'metal' if style == 'harbor' else 'light')
        if style == 'estate':
            m.box(0, -.32 * size, height * .45, size * .34, .05, .4, 'cloth')
    elif style in ('desert', 'storm', 'archive'):
        n = 6 if style == 'desert' else 8
        m.lathe([(size * .42, .13), (size * .33, .28), (size * .28, height - .26),
                 (size * .4, height - .15)], ['light', 'stone', 'accent'], n=n)
        if style == 'archive':
            for z in (.25, height - .38):
                m.lathe([(size * .35, z), (size * .35, z + .05)], ['accent'], n=8)
    elif style == 'quarry':
        m.box(0, 0, .13, size * .5, size * .5, height - .26, 'wood')
        for s in (-1, 1):
            m.beam((s * size * .43, 0, .13), (0, 0, height * .7), .08, 'wood', n=4)
        for z in (.3, height - .3):
            m.box(0, 0, z, size * .54, size * .54, .09, 'metal')
    elif style == 'fungal':
        m.lathe([(size * .38, .13), (size * .27, height * .3), (size * .2, height - .2)], ['wood'], n=7)
        for i in range(3):
            a = i * math.tau / 3
            m.beam((math.cos(a) * size * .4, math.sin(a) * size * .4, .1),
                   (math.cos(a) * size * .16, math.sin(a) * size * .16, height * .8), .07, 'wood', n=5)
    else:
        m.lathe([(size * .42, .13), (size * .34, .25), (size * .34, height - .22)], ['stone'], n=6)
        for z in (.25, height - .3):
            m.lathe([(size * .36, z), (size * .36, z + .08)], ['metal'], n=6)
    if broken:
        m.rock(0, 0, height - .22, size * .7, size * .65, .25, seed=2)
    else:
        m.box(0, 0, height - .13, size, size, .13, 'light', top='edge')


def beta_architecture(recipe, style):
    m, meta = Mesh(), metadata()
    if recipe.startswith('wall-') and recipe != 'wall-grille':
        w = {'wall-short': 1, 'wall-long': 4, 'wall-end': .6}.get(recipe, 2)
        h = {'wall-low': .38, 'wall-tall': 1.8, 'wall-end': 1.05,
             'wall-broken': .65, 'wall-window': 2.3, 'wall-buttress': 1.8}.get(recipe, .95)
        if recipe == 'wall-corner':
            wall(m, 2, .5, h, style)
            m.move(y=-.75)
            other = Mesh()
            wall(other, 1.5, .5, h, style)
            m.join(other.rotate(math.pi / 2).move(x=-.75, y=.25))
            meta['collision'] = [box_collision(2, .5, h, y=-.75), box_collision(.5, 1.5, h, x=-.75, y=.25)]
        elif recipe == 'wall-window':
            wall(m, 2, .5, .65, style)
            for x in (-.8, .8):
                other = Mesh()
                wall(other, .4, .5, 1.65, style)
                m.join(other.move(x=x, z=.65))
            m.box(0, 0, 2.05, 1.2, .5, .25, 'light', top='edge')
            for x in (-.32, 0, .32):
                m.box(x, 0, .65, .035, .06, 1.4, 'metal', bevel=.005)
            meta['collision'] = [box_collision(2, .5, .65), box_collision(.4, .5, h, x=-.8), box_collision(.4, .5, h, x=.8)]
            meta['opening'] = {'clear_width_m': 1.2, 'clear_height_m': 1.4, 'sill_height_m': .65, 'depth_m': .5}
        else:
            wall(m, w, .5, h, style, recipe == 'wall-broken')
            meta['collision'] = [box_collision(w, .5, h)]
            if recipe == 'wall-buttress':
                for x in (-.7, .7):
                    section = [(-.9, 0), (-.9, .25), (-.4, h - .2), (-.22, h - .2), (-.22, 0)]
                    m.shell([[(x + dx, y, z) for y, z in section] for dx in (-.13, .13)], ['light'])
                    meta['collision'].append(box_collision(.26, .68, h - .2, x=x, y=-.56))
        meta['connections'] = connections(w, .5)[:2]
    elif recipe.startswith('pillar-'):
        size = .72 if recipe == 'pillar-small' else 1
        h = 1.45 if recipe == 'pillar-small' else 1.05 if recipe == 'pillar-broken' else 1.9
        column(m, size, h, style, recipe == 'pillar-broken')
        meta['collision'] = [box_collision(size, size, h)]
    elif recipe in ('platform', 'platform-edge', 'platform-wide'):
        w, d = (4, 2) if recipe == 'platform-wide' else (2, .25) if recipe == 'platform-edge' else (2, 2)
        wall(m, w, d, 1.2, style)
        meta['collision'] = [box_collision(w, d, 1.2)]
        meta['walk_surfaces'] = [walk_rect(w, d, 1.2)]
        meta['connections'] = connections(w, d, 1.2)
    elif recipe in ('bridge', 'bridge-wide', 'floor-deck'):
        w, d = (4, 4) if recipe == 'bridge-wide' else (2, 4) if recipe == 'bridge' else (2, 2)
        for i in range(round(d / .25)):
            m.box(0, -d / 2 + (i + .5) * .25, -.14, w, .233, .14,
                  'metal' if style in ('storm', 'citadel') else 'stone' if style in ('desert', 'archive') else 'wood', bevel=.01)
        for x in (-w / 2 + .18, w / 2 - .18):
            m.box(x, 0, -.30, .17, d, .16, 'dark')
        meta.update(category='floor', origin='Top center; deck Y=0', walk_surfaces=[walk_rect(w, d)], connections=connections(w, d))
    elif recipe in ('floor-radial', 'floor-rubble'):
        m.box(0, 0, -.14, 2, 2, .075, 'dark')
        if recipe == 'floor-radial':
            # A square outer panel with a real circular opening avoids coplanar inlays.
            angles = [i * math.tau / 16 for i in range(16)]
            outer = [(math.cos(a) * .99 / max(abs(math.cos(a)), abs(math.sin(a))),
                      math.sin(a) * .99 / max(abs(math.cos(a)), abs(math.sin(a)))) for a in angles]
            inner = [(math.cos(a) * .90, math.sin(a) * .90) for a in angles]
            m.shell([[(x, y, z) for x, y in ring] for ring, z in
                     [(outer, -.065), (outer, 0), (inner, 0), (inner, -.065)]], ['stone'], cyclic=True)
            m.lathe([(.88, -.063), (.88, 0), (.72, 0), (.72, -.063)], ['light', 'accent', 'light'], n=16, cyclic=True)
            m.lathe([(.69, -.064), (.69, -.008)], ['stone'], n=16)
            m.join(Mesh().box(0, 0, -.007, .65, .65, .007, 'accent', bevel=.001).rotate(math.pi / 4))
        else:
            for i in range(4):
                for j in range(4):
                    m.rock(-.75 + i * .5, -.75 + j * .5, -.064, .46, .46,
                           .064 if (i + j) % 2 else .049, 'light' if (i + j) % 3 else 'stone', seed=i * 4 + j)
        meta.update(category='floor', origin='Top center; surface at Y=0', walk_surfaces=[walk_rect(2, 2)], connections=connections(2, 2))
    elif recipe == 'stair-narrow':
        parts, meta = architecture('stair-full', style)
        m = parts[0][1]
        m.vertices = [(x * .5, y, z) for x, y, z in m.vertices]
        meta['walk_surfaces'][0]['width_m'] = 1
        for edge in meta['side_boundaries']:
            edge['start_m'][0] *= .5
            edge['end_m'][0] *= .5
    elif recipe == 'arch-free':
        for x in (-1.2, 1.2):
            other = Mesh()
            column(other, .4, 1.85, style)
            m.join(other.move(x=x))
        if style in ('harbor', 'quarry', 'estate'):
            m.box(0, 0, 1.85, 2.8, .4, .22, 'wood', top='edge')
        else:
            m.arch(2, 1.85, .4, .4, 'light')
        meta['collision'] = [box_collision(.4, .4, 1.85, x=s * 1.2) for s in (-1, 1)]
        meta['opening'] = {'clear_width_m': 2, 'clear_height_m': 1.85, 'depth_m': .4}
    else:
        parts, meta = architecture(recipe, 'kiln' if style == 'citadel' else style)
        # Frame shape is an area cue. Rectangular lintels fit timber and instruments.
        if recipe == 'doorway' and style in ('harbor', 'quarry', 'estate', 'storm'):
            frame = Mesh()
            for x in (-1.15, 1.15):
                column_part = Mesh()
                column(column_part, .3, 1.7, style)
                frame.join(column_part.move(x=x))
            frame.box(0, 0, 1.7, 2.6, .5, .26, 'wood' if style in ('harbor', 'quarry', 'estate') else 'metal', top='edge')
            parts[0] = ('body', frame, (0, 0, 0))
        return parts, meta
    return [('body', m, (0, 0, 0))], meta
