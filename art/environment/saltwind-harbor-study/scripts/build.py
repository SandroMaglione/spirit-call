"""Build the feedback study into new files, without opening the shipped source."""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE.parent / 'scripts'))
from geometry import Mesh, palette_material
from pipeline import write_json

PALETTE = {
    'stone': '788C8D', 'light': 'A7B3AC', 'edge': 'B8C3B3', 'dark': '344C54',
    'wood': '98765A', 'wood-light': 'B49470', 'wood-dark': '715340',
    'metal': '49666C', 'metal-light': '779394', 'rope': 'C1AB7C',
    'cloth': '9C6758', 'sail': 'C9C2A5', 'fish': '91A7A5', 'warm': 'C89D59',
}


class Assembly:
    """Closed pieces remain distinct for a physical support audit, but export as one mesh."""
    def __init__(self):
        self.parts = []

    def add(self, mesh, name):
        self.parts.append((name, mesh))
        return self

    def box(self, name, x, y, z, w, d, h, shade='wood', bevel=.012):
        return self.add(Mesh().box(x, y, z, w, d, h, shade, bevel=bevel), name)

    def beam(self, name, a, b, r, shade='wood', n=8, end=None):
        return self.add(Mesh().beam(a, b, r, shade, n=n, radius_end=end), name)

    def lathe(self, name, profile, shade, n=12, at=(0, 0, 0), cyclic=False):
        return self.add(Mesh().lathe(profile, shade if isinstance(shade, list) else [shade], n=n, center=at, cyclic=cyclic), name)

    def ring(self, name, r, tube, shade='metal', at=(0, 0, 0), axis=None, n=12):
        # A rounded cross-section avoids the old flat rectangular rope silhouette.
        rings = [[((r + tube * math.cos(j * math.tau / 6)) * math.cos(i * math.tau / n),
                   (r + tube * math.cos(j * math.tau / 6)) * math.sin(i * math.tau / n),
                   tube * math.sin(j * math.tau / 6)) for j in range(6)] for i in range(n)]
        mesh = Mesh().shell(rings, [shade], cyclic=True)
        if axis:
            mesh.rotate(math.pi / 2, axis)
        return self.add(mesh.move(*at), name)

    def extend(self, other, at=(0, 0, 0), yaw=0):
        for name, mesh in other.parts:
            copy = Mesh()
            copy.vertices, copy.faces, copy.shades = list(mesh.vertices), list(mesh.faces), list(mesh.shades)
            self.add(copy.rotate(yaw).move(*at), name)
        return self

    def mesh(self):
        result = Mesh()
        for _, part in self.parts:
            result.join(part)
        return result


def path(a, name, pts, radius=.018, shade='rope', n=6):
    for i, (start, end) in enumerate(zip(pts, pts[1:])):
        a.beam(name + str(i), start, end, radius, shade, n=n)


def deck(w, d, h=.16):
    a = Assembly()
    for x in (-w * .34, w * .34):
        a.box('ground sleeper', x, 0, 0, .14, d, h - .06, 'wood-dark')
    for y in (-d * .31, d * .31):
        a.box('cross joist supporting every plank', 0, y, h - .11, w, .13, .055, 'wood-dark')
    count = math.ceil(w / .24)
    for i in range(count):
        a.box('deck plank', -w / 2 + (i + .5) * w / count, 0, h - .075,
              w / count - .008, d, .075, 'wood' if i % 3 else 'wood-light')
    return a


def crate(w=.52, d=.42, h=.40):
    a = Assembly()
    # Boards overlap their frame slightly; the brace is attached to the face.
    a.box('solid floor', 0, 0, 0, w, d, .045, 'wood-dark')
    for y in (-d / 2 + .025, d / 2 - .025):
        for i in range(3):
            a.box('front plank', 0, y, .035 + i * (h - .035) / 3,
                  w, .045, (h - .035) / 3 - .004, 'wood' if i != 1 else 'wood-light')
        for x in (-w / 2 + .035, w / 2 - .035):
            a.box('corner upright', x, y, 0, .07, .065, h, 'wood-dark')
        brace = Mesh().box(0, 0, 0, math.hypot(w - .09, h - .09), .035, .055, 'wood-light', bevel=.006)
        a.add(brace.rotate(-math.atan2(h - .09, w - .09), 'Y').move(y=y - math.copysign(.025, -y), z=h / 2), 'attached diagonal brace')
    for x in (-w / 2 + .025, w / 2 - .025):
        for i in range(3):
            a.box('side plank', x, 0, .035 + i * (h - .035) / 3, .045, d, (h - .035) / 3 - .004, 'wood')
    for i in range(3):
        a.box('lid plank', -w / 2 + (i + .5) * w / 3, 0, h - .035, w / 3 - .004, d, .035, 'wood-light' if i == 1 else 'wood')
    for x in (-w * .34, w * .34):
        a.box('lid batten', x, 0, h - .007, .045, d, .018, 'metal')
    return a


def barrel(h=.53, r=.205):
    a = Assembly()
    profile = [(r * .86, 0), (r, h * .15), (r * 1.06, h * .5), (r, h * .86), (r * .86, h)]
    a.lathe('barrel body', profile, ['wood-dark'], n=14)
    # Individual stave strips leave narrow dark seams and a real bulge.
    for i in range(14):
        angle = i * math.tau / 14
        rings = []
        for rad, z in profile:
            rings.append([(rr * math.cos(aa), rr * math.sin(aa), z)
                          for rr, aa in [(rad * .995, angle - .21), (rad + .009, angle - .21),
                                         (rad + .009, angle + .21), (rad * .995, angle + .21)]])
        a.add(Mesh().shell(rings, ['wood-light' if i % 4 == 0 else 'wood']), 'curved stave')
    for z in (h * .14, h * .78):
        rad = r * (1 if z < h / 2 else 1.028)
        a.lathe('iron hoop', [(rad - .018, z), (rad + .015, z), (rad + .015, z + .035), (rad - .018, z + .035)], 'metal', n=14, cyclic=True)
    a.lathe('lid', [(r * .84, h - .02), (r * .84, h + .005)], 'wood-light', n=14)
    for x in (-r * .28, r * .28):
        a.box('lid seam', x, 0, h + .001, .008, r * 1.48, .005, 'wood-dark', bevel=.001)
    return a


def barrel_stack():
    a = Assembly()
    a.extend(barrel(), (-.23, 0, 0))
    a.extend(barrel(), (.23, 0, 0))
    a.extend(barrel(), (0, .035, .525))
    return a


def coil():
    a = Assembly()
    # A continuous spiral rests on the ground; its loose end touches the outer turn.
    pts = []
    for i in range(89):
        t = i / 88
        angle = t * math.tau * 3.3
        radius = .048 + t * .16
        pts.append((radius * math.cos(angle), radius * math.sin(angle), .018))
    path(a, 'coiled rope', pts, .020, n=6)
    last = pts[-1]
    path(a, 'rope tail', [last, (last[0] + .11, last[1] + .04, .018), (last[0] + .18, last[1] + .02, .018)], .020)
    return a


def bucket():
    a = Assembly()
    a.lathe('bucket floor', [(.105, 0), (.105, .026)], 'wood-dark')
    a.lathe('open bucket', [(.11, 0), (.15, .24), (.13, .24), (.091, .023)], ['wood', 'wood-light', 'wood-dark'], cyclic=True)
    for z, r in ((.045, .118), (.205, .144)):
        a.lathe('bucket hoop', [(r - .009, z), (r + .012, z), (r + .012, z + .023), (r - .009, z + .023)], 'metal', cyclic=True)
    path(a, 'handle', [(-.145, 0, .20), (-.16, 0, .28), (-.11, 0, .36), (.11, 0, .36), (.16, 0, .28), (.145, 0, .20)], .013, 'metal')
    return a


def basket():
    a = Assembly()
    a.box('basket bottom', 0, 0, 0, .48, .34, .035, 'wood-dark')
    for y in (-.16, .16):
        for z in (.04, .09, .14):
            a.box('basket slat', 0, y, z, .48, .03, .039, 'wood-light')
    for x in (-.225, .225):
        for z in (.04, .09, .14):
            a.box('end slat', x, 0, z, .03, .34, .039, 'wood')
        for y in (-.16, .16):
            a.box('woven corner', x, y, .02, .032, .032, .17, 'rope')
    for i in range(3):
        fish = Mesh().lathe([(.011, 0), (.046, .06), (.041, .18), (.012, .25)], ['fish'], n=8)
        fish.rotate(math.pi / 2, 'X').rotate(.11 * (i - 1)).move(x=-.135 + i * .135, y=.10, z=.07)
        a.add(fish, 'fish resting on floor')
    return a


def folded_sail():
    a = Assembly()
    for i in range(4):
        a.box('folded sailcloth', 0, .012 * (i % 2), i * .032, .52 - .012 * i, .30, .038, 'sail', bevel=.025)
    for x in (-.16, .16):
        path(a, 'tied sail strap', [(x, -.145, .02), (x, -.15, .12), (x, .15, .12), (x, .145, .02)], .013, 'rope')
    return a


def bollard():
    a = Assembly()
    a.box('stone mounting', 0, 0, 0, .38, .33, .065, 'stone')
    a.lathe('bollard foot and neck', [(.10, .055), (.12, .09), (.09, .26), (.135, .29), (.135, .33)], ['metal', 'metal', 'metal-light', 'metal'], n=10)
    for z in (.11, .14):
        a.ring('wrapped rope', .103, .016, 'rope', at=(0, 0, z))
    for x in (-.13, .13):
        a.lathe('mounting bolt', [(.017, .055), (.017, .077)], 'metal-light', n=6, at=(x, -.10, 0))
    return a


def life_ring_stand():
    a = Assembly()
    a.box('stand foot', 0, 0, 0, .39, .22, .05, 'wood-dark')
    for x in (-.12, .12):
        a.beam('upright support', (x, 0, .035), (x, 0, .43), .025, 'wood', n=6)
    a.beam('cross support', (-.17, 0, .28), (.17, 0, .28), .025, 'wood', n=6)
    a.ring('life ring', .19, .043, 'cloth', at=(0, -.025, .24), axis='X', n=16)
    for x in (-.19, .19):
        a.box('ring binding', x, -.025, .20, .065, .091, .08, 'sail', bevel=.012)
    return a


def lantern():
    a = Assembly()
    a.box('lantern foot', 0, 0, 0, .43, .39, .08, 'stone')
    a.box('timber post', 0, 0, .06, .09, .10, 1.06, 'wood-dark')
    a.beam('arm', (0, 0, 1.06), (.36, 0, 1.06), .035, 'metal', n=6)
    a.beam('arm brace', (0, 0, .80), (.25, 0, 1.06), .026, 'metal', n=6)
    a.beam('visible hanger', (.32, 0, 1.065), (.32, 0, .935), .016, 'metal', n=6)
    # The roof, cage and light block are connected to the hanger; no dangling pedestal.
    a.lathe('lantern roof', [(.145, .87), (.13, .90), (.025, .95)], ['metal', 'metal-light'], n=4, at=(.32, 0, 0))
    a.box('lantern base', .32, 0, .65, .23, .23, .045, 'metal')
    a.box('amber glass', .32, 0, .685, .15, .15, .19, 'warm')
    for x in (.22, .42):
        for y in (-.10, .10):
            a.box('cage upright', x, y, .675, .025, .025, .215, 'metal')
    return a


def net_rack():
    a = Assembly()
    for x in (-.53, .53):
        a.box('rack foot', x, 0, 0, .22, .40, .07, 'wood-dark')
        a.box('rack post', x, 0, .045, .07, .075, 1.0, 'wood')
        a.beam('foot brace', (x, -.17, .045), (x, 0, .34), .028, 'wood-dark', n=6)
    a.beam('top rail', (-.60, 0, 1.02), (.60, 0, 1.02), .04, 'wood', n=6)
    # The upper ends wrap onto the rail; intersecting strands form one supported net.
    for i in range(7):
        x = -.45 + i * .15
        path(a, 'hanging net warp', [(x, 0, 1.02), (x, -.02, .90), (x, -.05, .48), (x, -.08, .31)], .010, 'rope', n=5)
    for z in (.34, .49, .64, .79, .94):
        t = (1.02 - z) / .71
        a.beam('net weft', (-.46, -.08 * t, z), (.46, -.08 * t, z), .011, 'rope', n=5)
    return a


def handcart():
    a = Assembly()
    # The full axle bridges both wheels and supports the cart body.
    for x in (-.31, .31):
        a.ring('cart wheel', .17, .03, 'wood-dark', at=(x, 0, .20), axis='Y', n=12)
        for angle in (0, math.pi / 3, math.pi * 2 / 3):
            a.beam('wheel spoke', (x, -.16 * math.cos(angle), .20 - .16 * math.sin(angle)),
                   (x, .16 * math.cos(angle), .20 + .16 * math.sin(angle)), .018, 'wood', n=6)
    a.beam('wheel axle', (-.34, 0, .20), (.34, 0, .20), .028, 'metal')
    a.box('cart bed', 0, 0, .185, .60, .72, .06, 'wood-dark')
    for x in (-.285, .285):
        for z in (.24, .34):
            a.box('side board', x, 0, z, .045, .72, .095, 'wood')
    a.box('end board', 0, .34, .24, .60, .045, .19, 'wood-light')
    for x in (-.22, .22):
        a.beam('cart handle', (x, .18, .215), (x, -.80, .34), .026, 'wood', n=6)
    a.box('parking leg', 0, .25, 0, .09, .10, .24, 'wood-dark')
    return a


def mooring():
    a = deck(1.30, .85)
    a.extend(bollard(), (.34, 0, .155))
    a.extend(coil(), (-.29, -.12, .157))
    # A continuous rope connects the coil to the bollard, resting on the deck.
    path(a, 'mooring tail', [(-.29, -.12, .177), (.02, -.17, .177), (.26, -.06, .29), (.34, .10, .29)], .022)
    return a


def boat():
    a = Assembly()
    # Deliberate broad stern and narrow prow; a cradle carries the entire hull.
    for x in (-.68, .63):
        a.box('cradle ground foot', x, 0, 0, .16, .96, .09, 'wood-dark')
        for y in (-.27, .27):
            a.beam('cradle arm', (x, y * 1.30, .07), (x, y * .72, .39), .075, 'wood-dark', n=6)
    outer = [(-1.18, -.30), (-1.18, .30), (-.60, .48), (.62, .40), (1.22, 0), (.62, -.40), (-.60, -.48)]
    inner = [(x * .94, y * .84) for x, y in outer]
    bottom = [(x * .89, y * .50) for x, y in outer]
    a.add(Mesh().shell([[(x, y, z) for x, y in p] for p, z in [(bottom, .28), (outer, .69), (inner, .69), (bottom, .35)]], ['wood-dark', 'wood-light', 'wood']), 'open boat hull')
    for y in (-.13, 0, .13):
        a.box('interior bottom plank', -.12, y, .32, 1.7, .12, .04, 'wood')
    for x in (-.63, .30):
        a.box('bench touching hull', x, 0, .53, .17, .82 if x < 0 else .74, .055, 'wood-light')
        for y in (-.28, .28):
            a.box('bench support', x, y, .335, .08, .07, .21, 'wood-dark')
    # Oar is lashed along the gunwale and physically rests on a bench.
    a.beam('oar shaft', (-.91, -.28, .60), (.77, -.28, .60), .025, 'wood', n=6)
    a.box('oar blade', -.95, -.28, .58, .36, .16, .045, 'wood-light')
    return a


def crane():
    a = deck(1.45, 1.20, .18)
    a.box('crane mast', -.35, 0, .16, .16, .17, 1.65, 'wood-dark')
    for y in (-.40, .40):
        a.beam('mast foot brace', (-.35, y, .16), (-.35, 0, .69), .06, 'wood', n=6)
    a.beam('boom', (-.44, 0, 1.65), (1.30, 0, 1.86), .095, 'wood', n=6)
    a.beam('boom strut', (-.35, 0, .74), (.84, 0, 1.81), .057, 'wood-dark', n=6)
    a.ring('tip pulley', .105, .025, 'metal', at=(1.16, 0, 1.77), axis='X')
    path(a, 'lift rope', [(-.35, -.035, .55), (-.35, -.035, 1.68), (1.16, -.035, 1.85), (1.16, -.035, .86)], .022)
    # Load is stationary on a real loading extension, and the bridle joins it to the rope.
    a.extend(deck(.84, .90, .18), (1.04, 0, 0))
    a.extend(crate(.48, .40, .39), (1.04, 0, .175))
    path(a, 'cargo bridle left', [(1.16, -.035, .87), (.84, -.18, .54), (.84, -.18, .20)], .022)
    path(a, 'cargo bridle right', [(1.16, -.035, .87), (1.24, .18, .54), (1.24, .18, .20)], .022)
    a.lathe('winch drum', [(.12, 0), (.12, .25)], 'metal', at=(0, 0, 0))
    drum = a.parts.pop()[1]
    a.add(drum.rotate(math.pi / 2, 'X').move(x=-.35, y=-.10, z=.52), 'attached winch drum')
    return a


def shed():
    a = deck(2.15, 1.45, .16)
    for x in (-.88, .88):
        for y in (-.55, .55):
            a.box('shed post', x, y, .145, .105, .105, 1.18, 'wood-dark')
            a.beam('roof corner brace', (x, y, 1.00), (x - math.copysign(.24, x), y, 1.32), .035, 'wood', n=6)
    for y in (-.55, .55):
        a.beam('roof tie', (-1.03, y, 1.32), (1.03, y, 1.32), .055, 'wood', n=6)
    a.beam('ridge', (0, -.70, 1.61), (0, .70, 1.61), .043, 'wood-dark', n=6)
    for y in (-.55, .55):
        for s in (-1, 1):
            a.beam('roof rafter', (0, y, 1.61), (s * 1.09, y, 1.29), .041, 'wood', n=6)
    # Faceted cloth rests directly on the rafters, with visible edge rolls.
    for s in (-1, 1):
        a.add(Mesh().shell([[(0, y, 1.62), (s * 1.10, y, 1.30), (s * 1.10, y, 1.335), (0, y, 1.655)] for y in (-.72, .72)], ['cloth']), 'supported canvas roof')
    a.extend(crate(), (-.48, .25, .155))
    a.extend(folded_sail(), (-.48, .25, .56))
    a.extend(bucket(), (.52, .32, .155))
    for x in (-.32, -.16, 0, .16, .32):
        a.beam('back net warp', (x, .55, 1.32), (x, .55, .43), .012, 'rope', n=5)
    for z in (.47, .63, .79, .95, 1.11, 1.27):
        a.beam('back net weft', (-.34, .55, z), (.34, .55, z), .013, 'rope', n=5)
    return a


def loading_bay():
    a = deck(2.40, 1.35, .18)
    a.box('quay retaining face', 0, .55, .13, 2.40, .20, .36, 'stone')
    a.box('quay coping', 0, .55, .475, 2.46, .25, .07, 'light')
    a.extend(crate(.58, .46, .44), (-.64, -.18, .175))
    a.extend(crate(.44, .38, .34), (-.64, -.18, .61))
    a.extend(barrel(), (.08, -.10, .175))
    a.extend(basket(), (.72, -.14, .175))
    a.extend(coil(), (.65, .29, .185))
    return a


BUILDERS = {
    'rope-coil': (coil, 'small'), 'bucket': (bucket, 'small'),
    'fish-basket': (basket, 'small'), 'folded-sail': (folded_sail, 'small'),
    'bollard': (bollard, 'small'), 'life-ring-stand': (life_ring_stand, 'small'),
    'cargo-crate': (crate, 'working'), 'barrel': (barrel, 'working'),
    'barrel-stack': (barrel_stack, 'working'),
    'handcart': (handcart, 'working'), 'lantern-post': (lantern, 'working'),
    'net-rack': (net_rack, 'working'), 'mooring-cluster': (mooring, 'working'),
    'boat-on-cradle': (boat, 'large'), 'dock-crane': (crane, 'large'),
    'net-shed': (shed, 'large'), 'quay-loading-bay': (loading_bay, 'large'),
}


def support_audit(a):
    """Every primitive must touch the ground or a chain of intersecting supported pieces."""
    trees, boxes = [], []
    for _, mesh in a.parts:
        verts = [Vector(v) for v in mesh.vertices]
        trees.append(BVHTree.FromPolygons(verts, mesh.faces, all_triangles=False, epsilon=.0005))
        boxes.append(([min(v[j] for v in verts) for j in range(3)], [max(v[j] for v in verts) for j in range(3)]))

    def inside(tree, p):
        # A non-axis-aligned ray avoids the authored grid and shared triangle edges.
        direction = Vector((.917, .331, .221)).normalized()
        origin, hits = p.copy(), 0
        for _ in range(50):
            hit, _, _, _ = tree.ray_cast(origin, direction)
            if hit is None:
                return hits % 2 == 1
            hits += 1
            origin = hit + direction * .00001
        return False

    def touches(i, j):
        lo, hi = boxes[i]
        other_lo, other_hi = boxes[j]
        if any(hi[k] + .002 < other_lo[k] or other_hi[k] + .002 < lo[k] for k in range(3)):
            return False
        if trees[i].overlap(trees[j]):
            return True
        for first, second in ((i, j), (j, i)):
            vertices = a.parts[first][1].vertices
            for v in vertices[::max(1, len(vertices) // 12)]:
                p = Vector(v)
                nearest = trees[second].find_nearest(p)
                if nearest[0] is not None and (nearest[3] <= .002 or inside(trees[second], p)):
                    return True
        return False

    grounded = {i for i, (lo, _) in enumerate(boxes) if lo[2] <= .002}
    assert grounded, 'No ground support'
    unsupported = set(range(len(boxes))) - grounded
    links = []
    while unsupported:
        added = []
        for i in sorted(unsupported):
            for j in sorted(grounded):
                if touches(i, j):
                    added.append(i)
                    links.append({'part': i, 'supported_by': j})
                    break
        if not added:
            break
        unsupported -= set(added)
        grounded.update(added)
    return {'primitives': len(boxes), 'grounded_or_connected': len(grounded),
            'unsupported': [a.parts[i][0] for i in sorted(unsupported)], 'support_links': links}


def main():
    source = HERE / 'source' / 'saltwind-harbor-study.blend'
    if source.exists() and '--replace-generated' not in sys.argv:
        raise SystemExit('Source exists. Export manual edits, or explicitly pass --replace-generated.')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.name = 'Harbor scale study editable library'
    scene.unit_settings.system = 'METRIC'
    mat = palette_material('Harbor study vertex colors')
    audits = {}
    for i, (name, (builder, group)) in enumerate(BUILDERS.items()):
        assembly = builder()
        audit = support_audit(assembly)
        print('SUPPORT', name, audit['grounded_or_connected'], '/', audit['primitives'], audit['unsupported'], flush=True)
        audits[name] = audit
        collection = bpy.data.collections.new(name)
        scene.collection.children.link(collection)
        root = bpy.data.objects.new(name, None)
        collection.objects.link(root)
        root['asset_id'] = name
        root['recipe'] = name
        root['metadata_json'] = json.dumps({'category': 'prop', 'origin': 'Ground center',
            'collision': [], 'walk_surfaces': [], 'connections': [], 'moving_parts': [], 'sockets': [],
            'study_group': group, 'placement_note': 'Review art; large assemblies belong outside the combat grid.'})
        assembly.mesh().object(name + '__body', PALETTE, mat, collection, root)
        root.location = ((i % 4) * 4.5, (i // 4) * 3.3, 0)
    write_json(HERE / 'support-audit.json', {'tolerance_m': .002, 'method': 'Closed primitive BVH surface intersection, contact or containment graph to ground', 'assets': audits})
    assert all(not a['unsupported'] for a in audits.values()), 'Unconnected detail: inspect support-audit.json'
    source.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source))


if __name__ == '__main__':
    main()
