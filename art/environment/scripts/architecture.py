"""Modular architecture; decorative geometry is separate from placement metadata."""
import math
from geometry import Mesh


STRUCTURES = [
    'floor-plain', 'floor-worn', 'floor-cracked', 'floor-inset', 'floor-small', 'floor-large',
    'floor-border', 'floor-border-corner', 'floor-threshold', 'floor-transition',
    'wall-short', 'wall-straight', 'wall-long', 'wall-low', 'wall-tall', 'wall-corner',
    'wall-end', 'wall-broken', 'pillar-small', 'pillar-large', 'pillar-broken',
    'stair-short', 'stair-full', 'stair-wide', 'stair-rail', 'landing', 'platform', 'platform-edge',
    'railing-straight', 'railing-corner', 'doorway', 'gate-wide', 'floor-grate', 'wall-grille', 'bridge',
]


def box_collision(w, d, h, x=0, y=0, z=0):
    return {'center_m': [x, z + h / 2, -y], 'size_m': [w, h, d]}


def walk_rect(w, d, h=0):
    return {'kind': 'plane', 'bounds_xz_m': [-w / 2, -d / 2, w / 2, d / 2], 'height_m': h}


def connections(w, d, h=0):
    return [{'name': name, 'position_m': pos} for name, pos in [
        ('left', [-w / 2, h, 0]), ('right', [w / 2, h, 0]),
        ('front', [0, h, d / 2]), ('back', [0, h, -d / 2])]]


def masonry(m, x, y, w, d, h, style, broken=False):
    m.box(x, y, 0, w, d, .12, 'dark', top='light')
    courses = max(1, round((h - .24) / .28))
    course = (h - .24) / courses
    for j in range(courses):
        if style == 'kiln':
            n = max(1, round(w / .5))
            for i in range(n):
                top = h - .12 if not broken else h - .12 - .12 * ((i + j) % 3)
                base = .12 + j * course
                if top > base:
                    m.box(x - w / 2 + (i + .5) * w / n, y, base, w / n - .014, d - .05,
                          min(course - .008, top - base), 'stone' if (i + j) % 3 else 'light')
        else:
            m.box(x, y, .12 + j * course, w - .04, d - .08, course - .008,
                  'stone' if j % 2 else 'light')
    if not broken:
        m.box(x, y, h - .12, w, d, .12, 'light', top='edge')
    if style == 'sanctuary':
        middle = (x - w * .15, y - d / 2 - .015, h * .34)
        m.beam((x - w * .42, y - d / 2, .03), middle, .045, 'wood', radius_end=.03)
        m.beam(middle, (x + w * .2, y - d / 2 - .015, h * .75), .03, 'wood', radius_end=.015)
        m.beam(middle, (x + w * .04, y - d / 2, h * .13), .025, 'wood', radius_end=.009)
        if not broken:
            m.rock(x - w * .25, y, h, w * .37, d * .7, .035, 'green', seed=4)
    elif style == 'kiln':
        for side in (-1, 1):
            m.box(x + side * (w / 2 - .12), y - d / 2, 0, .12, .035, h, 'metal')
    elif style == 'monastery':
        m.box(x, y + .08, h, w - .06, d * .6, .055, 'snow')


def railing(m, w, style):
    for x in (-w / 2 + .08, w / 2 - .08):
        m.box(x, 0, 0, .16, .2, .78, 'metal' if style in ('kiln', 'cistern') else 'stone')
        m.box(x, 0, .78, .20, .24, .07, 'accent')
    m.box(0, 0, .62, w, .12, .1, 'metal')
    m.box(0, 0, .15, w, .10, .07, 'metal')
    for i in range(1, round(w / .25)):
        x = -w / 2 + i * .25
        m.box(x, 0, .22, .045, .055, .40, 'metal', bevel=.007)


def architecture(recipe, style):
    m = Mesh()
    parts = [('body', m, (0, 0, 0))]
    meta = {'category': 'architecture', 'origin': 'Ground center', 'collision': [],
            'walk_surfaces': [], 'connections': [], 'moving_parts': [], 'sockets': []}
    if (recipe.startswith('floor-') and recipe != 'floor-grate') or recipe == 'landing':
        w, d = (1, 1) if recipe == 'floor-small' else (4, 2) if recipe == 'floor-large' else (2, .3) if recipe == 'floor-border' else (2, .6) if recipe == 'floor-threshold' else (2, 2)
        meta.update(category='floor', origin='Top center; surface at Y=0')
        if recipe == 'floor-border-corner':
            m.box(0, -.85, -.14, 2, .3, .14, 'stone', top='edge')
            m.box(-.85, .15, -.14, .3, 1.7, .14, 'stone', top='edge')
            meta['walk_surfaces'] = [dict(walk_rect(2, .3), center_xz_m=[0, .85]), dict(walk_rect(.3, 1.7), center_xz_m=[-.85, -.15])]
        else:
            m.box(0, 0, -.14, w, d, .075, 'dark')
            nx, ny = max(1, round(w)), max(1, round(d))
            if recipe == 'floor-worn':
                nx, ny = int(w * 2), int(d * 2)
            for i in range(0 if recipe == 'floor-inset' else nx):
                for j in range(ny):
                    x, y = -w / 2 + (i + .5) * w / nx, -d / 2 + (j + .5) * d / ny
                    shade = 'light' if (i + j) % 3 == 0 else 'stone'
                    if recipe == 'floor-transition' and i >= nx / 2:
                        shade = 'earth' if style == 'sanctuary' else 'metal' if style == 'kiln' else 'dark'
                    if recipe == 'floor-cracked' and i == j:
                        for sign in (-1, 1):
                            m.box(x + sign * w / nx * .25, y, -.065, w / nx / 2 - .03, d / ny - .025, .065, shade, bevel=.02)
                    else:
                        m.box(x, y, -.065, w / nx - .018, d / ny - .018, .065, shade, bevel=.014)
            if recipe == 'floor-inset':
                # Separate inset pieces avoid coplanar overlays on the flags.
                m.box(0, 0, -.065, 1.36, 1.36, .065, 'stone', bevel=.008)
                for sign in (-1, 1):
                    m.box(sign * .725, 0, -.065, .07, 1.52, .065, 'accent', bevel=.003)
                    m.box(0, sign * .725, -.065, 1.37, .07, .065, 'accent', bevel=.003)
                    m.box(sign * .88, 0, -.065, .22, 1.98, .065, 'light', bevel=.008)
                    m.box(0, sign * .88, -.065, 1.53, .22, .065, 'light', bevel=.008)
            meta['walk_surfaces'] = [walk_rect(w, d)]
        meta['connections'] = connections(w, d)
    elif recipe.startswith('wall-') and recipe != 'wall-grille':
        w = {'wall-short': 1, 'wall-long': 4, 'wall-end': .6}.get(recipe, 2)
        h = {'wall-low': .38, 'wall-tall': 1.8, 'wall-end': 1.05, 'wall-broken': .62}.get(recipe, .95)
        d = .6 if recipe == 'wall-end' else .5
        if recipe == 'wall-corner':
            masonry(m, 0, -.75, 2, .5, h, style)
            masonry(m, -.75, .25, .5, 1.5, h, style)
            meta['collision'] = [box_collision(2, .5, h, 0, -.75), box_collision(.5, 1.5, h, -.75, .25)]
            meta['connections'] = [{'name': 'arm-x', 'position_m': [1, 0, .75]}, {'name': 'arm-z', 'position_m': [-.75, 0, -1]}]
        else:
            masonry(m, 0, 0, w, d, h, style, recipe == 'wall-broken')
            if recipe == 'wall-broken':
                m.rock(-.7, .04, .5, .5, .38, .38, seed=2)
                m.rock(.1, -.01, .48, .38, .34, .23, seed=3)
            meta['collision'] = [box_collision(w, d, h)]
            meta['connections'] = connections(w, d)[:2]
    elif recipe.startswith('pillar-'):
        size = .72 if recipe == 'pillar-small' else 1
        h = 1.45 if recipe == 'pillar-small' else 1.05 if recipe == 'pillar-broken' else 1.9
        m.box(0, 0, 0, size, size, .16, 'dark', top='edge')
        if style == 'cistern':
            m.lathe([(size * .38, .16), (size * .32, .27), (size * .31, h - .2)], ['stone', 'light'], n=8)
        else:
            m.box(0, 0, .16, size * .68, size * .68, h - .32, 'stone', top='light')
        if recipe != 'pillar-broken':
            m.box(0, 0, h - .16, size, size, .16, 'light', top='edge')
        else:
            m.rock(.02, .02, h - .22, size * .7, size * .7, .3)
        if style == 'sanctuary':
            for s in (-1, 1):
                middle = (s * .29, -.36, h * .35)
                m.beam((s * size * .43, -.25, 0), middle, .09, 'wood', radius_end=.06)
                m.beam(middle, (s * .12, -.35, h * .8), .06, 'wood', radius_end=.025)
            if recipe != 'pillar-broken':
                m.rock(0, .05, h, size * .7, size * .65, .035, 'green', seed=4)
        elif style == 'kiln':
            for z in (.3, h - .35):
                m.box(0, 0, z, size * .75, size * .75, .09, 'metal')
        elif style == 'monastery':
            m.box(0, .08, h, size * .94, size * .75, .07, 'snow')
        else:
            m.box(0, -size * .347, h * .5, .14, .02, .27, 'accent', bevel=.006)
        meta['collision'] = [box_collision(size, size, h)]
    elif recipe.startswith('stair-') and recipe != 'stair-rail':
        n = 2 if recipe == 'stair-short' else 6
        w, run, rise = 4 if recipe == 'stair-wide' else 2, n * .4, n * .2
        for i in range(n):
            y, h = -run / 2 + (i + .5) * .4, (i + 1) * .2
            m.box(0, y, 0, w, .4, h, 'stone', top='light', bevel=.014)
            m.box(0, y - .178, h - .026, w - .08, .03, .025, 'edge', bevel=.004)
        meta['walk_surfaces'] = [{'kind': 'ramp', 'width_m': w, 'bottom_m': [0, 0, run / 2], 'top_m': [0, rise, -run / 2]}]
        meta['connections'] = [{'name': 'bottom', 'position_m': [0, 0, run / 2]}, {'name': 'top', 'position_m': [0, rise, -run / 2]}]
        meta['traversal_note'] = 'Suggested continuous ramp for automatic walking. Visible treads are not a physics collider.'
        meta['side_boundaries'] = [{'start_m': [s * w / 2, 0, run / 2], 'end_m': [s * w / 2, rise, -run / 2]} for s in (-1, 1)]
    elif recipe == 'stair-rail':
        for y in (-1.2, 0, 1.2):
            base = (y + 1.2) / 2
            m.box(0, y, base, .12, .12, .75, 'metal')
        m.beam((0, -1.2, .75), (0, 1.2, 1.95), .07, 'accent', n=6)
        meta['origin'] = 'Bottom walking elevation at front endpoint; align Z endpoints with stair-full'
        meta['connections'] = [{'name': 'bottom', 'position_m': [0, 0, 1.2]}, {'name': 'top', 'position_m': [0, 1.2, -1.2]}]
    elif recipe in ('platform', 'platform-edge'):
        d = 2 if recipe == 'platform' else .25
        masonry(m, 0, 0, 2, d, 1.2, style)
        # Seasonal caps and roots are decorative sides; walk plane stays fixed.
        meta['walk_surfaces'] = [walk_rect(2, d, 1.2)]
        meta['connections'] = connections(2, d, 1.2)
        meta['collision'] = [box_collision(2, d, 1.2)]
    elif recipe.startswith('railing-'):
        railing(m, 2, style)
        if recipe == 'railing-corner':
            m.move(y=-.9)
            other = Mesh()
            railing(other, 1.8, style)
            m.join(other.rotate(math.pi / 2).move(x=-.9, y=.1))
            meta['collision'] = [box_collision(2, .2, .85, y=-.9), box_collision(.2, 1.8, .85, x=-.9, y=.1)]
        else:
            meta['collision'] = [box_collision(2, .2, .85)]
    elif recipe in ('doorway', 'gate-wide'):
        w = 4 if recipe == 'gate-wide' else 2
        h, jamb = 1.7, .3
        for sign in (-1, 1):
            m.box(sign * (w / 2 + jamb / 2), 0, 0, jamb, .5, h, 'stone', top='edge')
            m.box(sign * (w / 2 + jamb / 2), 0, .12, jamb + .09, .58, .1, 'accent')
        if recipe == 'doorway' and style != 'kiln':
            m.arch(w, h, jamb, .5)
        else:
            m.box(0, 0, h, w + 2 * jamb, .5, .26, 'metal' if style == 'kiln' else 'edge')
        meta['collision'] = [box_collision(jamb, .5, h, x=s * (w / 2 + jamb / 2)) for s in (-1, 1)]
        meta['opening'] = {'clear_width_m': w, 'clear_height_m': h, 'depth_m': .5}
        meta['category'] = 'door'
        for sign, name in [(-1, 'leaf-left'), (1, 'leaf-right')]:
            leaf = Mesh()
            center = -sign * (w / 4 - .02)
            leaf_w = w / 2 - .04
            if recipe == 'gate-wide':
                for i in range(max(3, round(leaf_w / .23))):
                    x = center - leaf_w / 2 + .05 + i * (leaf_w - .1) / (max(3, round(leaf_w / .23)) - 1)
                    leaf.box(x, 0, .06, .06, .08, h - .12, 'metal', bevel=.01)
                for z in (.15, 1.3):
                    leaf.box(center, 0, z, leaf_w, .11, .10, 'metal')
            else:
                for i in range(4):
                    leaf.box(center - leaf_w / 2 + (i + .5) * leaf_w / 4, 0, .035,
                             leaf_w / 4 - .014, .12, h - .065, 'metal' if style == 'kiln' else 'wood')
                for z in (.23, 1.25):
                    leaf.box(center, -.075, z, leaf_w, .05, .10, 'metal')
                leaf.box(-sign * (leaf_w - .13), -.105, .8, .06, .06, .18, 'accent')
            pivot = (sign * w / 2, 0, 0)
            parts.append((name, leaf, pivot))
            meta['moving_parts'].append({'node': name, 'kind': 'hinge', 'pivot_m': [pivot[0], 0, 0],
                'axis': '+Y', 'closed_degrees': 0, 'open_degrees': sign * 95,
                'closed_collision': box_collision(leaf_w, .16, h, x=sign * w / 4),
                'collision_note': 'Rotate this closed box about pivot_m with the leaf; do not leave it blocking the opening.'})
        meta['connections'] = [{'name': 'front', 'position_m': [0, 0, .25]}, {'name': 'back', 'position_m': [0, 0, -.25]}]
    elif recipe in ('floor-grate', 'wall-grille'):
        w, d = (2, 2) if recipe == 'floor-grate' else (1.5, 1.2)
        for x in (-w / 2 + .07, w / 2 - .07):
            m.box(x, 0, -.14, .14, d, .14, 'metal')
        for y in (-d / 2 + .07, d / 2 - .07):
            m.box(0, y, -.14, w - .28, .14, .14, 'metal')
        for i in range(1, int(w / .2)):
            m.box(-w / 2 + i * .2, 0, -.10, .055, d - .26, .10, 'metal', bevel=.008)
        for y in (-d / 4, d / 4):
            m.box(0, y, -.10, w - .26, .045, .06, 'accent', bevel=.006)
        if recipe == 'wall-grille':
            m.rotate(math.pi / 2, 'X').move(z=d / 2)
        else:
            meta.update(category='floor', origin='Top center; surface at Y=0', walk_surfaces=[walk_rect(w, d)])
            meta['connections'] = connections(w, d)
    elif recipe == 'bridge':
        for i in range(12):
            m.box(0, -2 + (i + .5) / 3, -.16, 2, 1 / 3 - .018, .16,
                  'metal' if style == 'kiln' else 'wood', top='light' if style == 'cistern' else None)
        for x in (-.78, .78):
            m.box(x, 0, -.3, .18, 4, .14, 'dark')
        meta.update(category='floor', origin='Top center; deck Y=0', walk_surfaces=[walk_rect(2, 4)])
        meta['connections'] = [{'name': 'front', 'position_m': [0, 0, 2]}, {'name': 'back', 'position_m': [0, 0, -2]}]
    else:
        raise ValueError(recipe)
    return parts, meta
