"""Shared construction and delivery helpers for the approved arena prop studies."""
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy

ENV = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('harbor_construction', ENV / 'saltwind-harbor-study/scripts/build.py')
H = importlib.util.module_from_spec(spec)
spec.loader.exec_module(H)
A, M, path = H.Assembly, H.Mesh, H.path
PLAYER_HEIGHT = (24 + (38.4 - 24) / math.cos(math.pi / 6)) / 70


def scaled(a, factor):
    result = A()
    for name, mesh in a.parts:
        copy = M()
        copy.vertices = [tuple(v * factor for v in p) for p in mesh.vertices]
        copy.faces, copy.shades = list(mesh.faces), list(mesh.shades)
        result.add(copy, name)
    return result


def recolor(a, mapping):
    for _, mesh in a.parts:
        mesh.shades = [mapping.get(s, s) for s in mesh.shades]
    return a


def rock(w=.45, d=.34, h=.18, shade='stone', seed=1):
    return A().add(M().rock(0, 0, 0, w, d, h, shade, seed), 'grounded faceted stone')


def jar(h=.43, r=.16, shade='accent', handles=False):
    a = A().lathe('ceramic body', [(r*.64, 0), (r, h*.22), (r*.97, h*.60), (r*.50, h*.82),
        (r*.53, h), (r*.39, h), (r*.36, h*.81), (r*.77, h*.57), (r*.78, h*.23), (r*.43, .035)], shade, cyclic=True)
    a.lathe('ceramic floor', [(r*.66, 0), (r*.66, .045)], shade)
    if handles:
        for s in (-1, 1):
            a.ring('attached handle', r*.45, .022, shade, at=(s*r*.95, 0, h*.63), axis='X')
    return a


def bowl(r=.18, h=.08, shade='light'):
    a = A().lathe('bowl wall', [(r*.65, 0), (r, h), (r*.84, h), (r*.48, .025)], shade, cyclic=True)
    a.lathe('bowl bottom', [(r*.64, 0), (r*.64, .029)], shade)
    return a


def table(w=.9, d=.55, h=.45, stone=False):
    a, shade = A(), 'stone' if stone else 'wood'
    for x in (-w*.37, w*.37):
        for y in (-d*.33, d*.33):
            a.box('table foot', x, y, 0, .09, .09, h, shade)
    a.box('table top', 0, 0, h-.035, w, d, .07, 'light' if stone else 'wood-light')
    for y in (-d*.33, d*.33):
        a.beam('leg cross rail', (-w*.37, y, h*.30), (w*.37, y, h*.30), .027, shade)
    return a


def bench(w=1.10, stone=False):
    a, shade = A(), 'stone' if stone else 'wood'
    for x in (-w*.35, w*.35):
        a.box('bench foot', x, 0, 0, .12, .32, .27, shade)
    for y in (-.11, .11):
        a.box('seat plank', 0, y, .245, w, .21, .055, 'light' if stone else 'wood-light')
    return a


def lamp():
    a = A().lathe('lamp base', [(.16, 0), (.16, .04), (.10, .06)], 'metal', n=8)
    a.box('amber glass', 0, 0, .04, .18, .18, .22, 'warm')
    for x in (-.11, .11):
        for y in (-.11, .11):
            a.box('lamp cage', x, y, .025, .026, .026, .25, 'metal')
    a.lathe('lamp cap', [(.165, .26), (.12, .30), (.025, .33)], 'metal', n=8)
    a.ring('attached carry handle', .065, .014, 'metal', at=(0, 0, .365), axis='X')
    return a


def brazier():
    a = A().lathe('brazier pedestal', [(.23, 0), (.21, .08), (.10, .13), (.095, .33), (.21, .37)], 'metal', n=10)
    a.extend(bowl(.26, .12, 'metal'), (0, 0, .36))
    for i in range(5):
        a.extend(rock(.12, .10, .07, 'dark', i), (.10*math.cos(i*math.tau/5), .10*math.sin(i*math.tau/5), .38))
    return a


def book_stack():
    a = A()
    for i in range(3):
        for z in (i*.075, i*.075+.059):
            a.box('book cover', .015*(i%2), 0, z, .29, .21, .016, 'cloth')
        a.box('page block', .015*(i%2), 0, i*.075+.012, .275, .193, .049, 'sail')
    return a


def roof_frame(w=2.1, d=1.2, h=1.35, tile=False):
    a = H.deck(w, d)
    for x in (-w*.40, w*.40):
        for y in (-d*.36, d*.36):
            a.box('roof post', x, y, .14, .10, .10, h-.14, 'wood-dark')
            a.beam('corner brace', (x, y, h-.28), (x-math.copysign(.23,x), y, h), .035, 'wood')
    for y in (-d*.36, d*.36):
        a.beam('eave tie', (-w*.50, y, h), (w*.50, y, h), .065, 'wood')
        for s in (-1, 1):
            a.beam('sloping rafter', (0, y, h+.28), (s*w*.53, y, h), .047, 'wood-dark')
    a.beam('roof ridge', (0, -d*.57, h+.28), (0, d*.57, h+.28), .05, 'wood')
    for s in (-1, 1):
        a.add(M().shell([[(0,y,h+.29),(s*w*.54,y,h),(s*w*.54,y,h+.035),(0,y,h+.325)]
            for y in (-d*.58,d*.58)], ['metal' if tile else 'cloth']), 'roof resting on rafters')
    return a


def stone_portal(w=1.65, h=1.40, depth=.48):
    a = A().box('portal slab',0,0,0,w+.40,depth+.25,.12,'dark')
    for x in (-w/2,w/2):
        for i in range(5):
            a.box('bonded pier course',x,0,.10+i*(h-.10)/5,.30,depth,(h-.10)/5+.008,'stone' if i%2 else 'light')
    a.box('supported lintel',0,0,h-.045,w+.34,depth+.08,.21,'light')
    a.box('lintel trim',0,-depth/2-.035,h+.055,w+.40,.09,.07,'edge')
    return a


def branch(a, start, end, radius=.035, shade='wood'):
    a.beam('connected branch',start,end,radius,shade,n=7,end=radius*.65)


def tree(h=1.4, autumn=False):
    a = A()
    path(a,'rooted trunk',[(0,0,0),(.02,0,h*.40),(-.06,0,h*.71),(0,.03,h*.84)],.085,'wood-dark',n=7)
    for i in range(6):
        angle=i*math.tau/6
        start=(0,0,h*.42)
        tip=(.40*math.cos(angle),.32*math.sin(angle),h*(.66+.035*(i%3)))
        branch(a,start,tip,.047)
        cap=M().rock(tip[0],tip[1],tip[2]-.12,.55,.46,.35,'cloth' if autumn else 'green',i)
        a.add(cap,'canopy connected to branch')
    a.add(M().rock(0,0,h*.69,.56,.52,h*.30,'warm' if autumn else 'green',3),'crown on trunk')
    for i in range(5):
        angle=i*math.tau/5
        branch(a,(0,0,.16),(.30*math.cos(angle),.27*math.sin(angle),.01),.055)
    return a


def fern():
    a = rock(.24,.23,.05,'earth')
    for i in range(7):
        ang=i*math.tau/7
        tip=(.32*math.cos(ang),.32*math.sin(ang),.25)
        branch(a,(0,0,.03),tip,.014,'green')
        for t in (.28,.50,.72):
            p=tuple(t*v for v in tip)
            for s in (-1,1):
                end=(p[0]+s*.10*math.sin(ang),p[1]-s*.10*math.cos(ang),p[2]+.035)
                a.beam('leaf attached to frond',p,end,.027,'green',n=5,end=.008)
    return a


def mushrooms(h=.48, cluster=False):
    a = A()
    for x,y,f in ([(-.17,0,.62),(.13,.09,1),(0,-.17,.42)] if cluster else [(0,0,1)]):
        hh=h*f
        a.lathe('rooted mushroom stalk',[(.065*f,0),(.053*f,hh*.78)],'sail',at=(x,y,0),n=10)
        a.lathe('mushroom cap',[(.22*f,hh*.72),(.23*f,hh*.80),(.15*f,hh*.98),(.035*f,hh*1.06)],
            ['dark','cloth','warm'],at=(x,y,0),n=12)
    return a


def scrolls():
    a = A()
    for x in (-.10,.10):
        a.beam('scroll core',(x,-.18,.065),(x,.18,.065),.06,'sail',n=10)
        a.ring('scroll tie',.060,.012,'rope',at=(x,0,.065),axis='X',n=10)
    return a


def build(kit_name, builders, notes, comparisons, palette=None):
    root = ENV / (kit_name+'-study')
    source = root / 'source' / (kit_name+'-study.blend')
    if source.exists() and '--replace-generated' not in sys.argv:
        raise SystemExit('Source exists; preserve manual edits or pass --replace-generated explicitly.')
    original = json.loads((ENV/kit_name/'kit.json').read_text()) if (ENV/kit_name/'kit.json').exists() else {'title':'Courtyard','style':'courtyard','palette':palette}
    colors = dict(original['palette'])
    def tint(hexcolor, f):
        return ''.join(f'{max(0,min(255,round(int(hexcolor[i:i+2],16)*f))):02X}' for i in (0,2,4))
    colors.update({'wood-light':tint(colors['wood'],1.22),'wood-dark':tint(colors['wood'],.70),
        'metal-light':colors['light'],'rope':'BCAA82','sail':'CDC8B1','fish':colors['light']})
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    scene=bpy.context.scene
    scene.name=original['title']+' editable prop study'
    scene.unit_settings.system='METRIC'
    material=H.palette_material(kit_name+' study vertex colors')
    reports={}
    entries=[]
    for i,(id,title,group,constructor) in enumerate(builders):
        assembly=constructor()
        report=H.support_audit(assembly)
        print('SUPPORT',id,report['grounded_or_connected'],'/',report['primitives'],report['unsupported'],flush=True)
        reports[id]=report
        collection=bpy.data.collections.new(id)
        scene.collection.children.link(collection)
        asset=bpy.data.objects.new(id,None)
        collection.objects.link(asset)
        asset['asset_id'],asset['recipe']=id,'study-'+id
        asset['metadata_json']=json.dumps({'category':'prop','origin':'Ground center','collision':[],
            'walk_surfaces':[],'connections':[],'moving_parts':[],'sockets':[],'study_group':group,'title':title})
        assembly.mesh().object(id+'__body',colors,material,collection,asset)
        asset.location=((i%4)*3.4,(i//4)*3,0)
        entries.append({'id':id,'title':title,'recipe':'study-'+id,'group':group})
    root.mkdir(parents=True,exist_ok=True)
    H.write_json(root/'support-audit.json',{'tolerance_m':.002,'method':'Closed shell BVH contact graph to ground','assets':reports})
    assert all(not a['unsupported'] for a in reports.values()),'Unsupported part; inspect support-audit.json'
    H.write_json(root/'kit.json',{'title':original['title']+' study','style':original['style'], 'batch':'arena-prop-study',
        'base_kit':kit_name,'palette':colors,'assets':entries,'player_height_m':PLAYER_HEIGHT,
        'scope':'Reviewable art study with supported perimeter assemblies.','changes':notes,'comparisons':comparisons})
    source.parent.mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    (root/'review.html').write_text((ENV/'studies/review.html').read_text())
