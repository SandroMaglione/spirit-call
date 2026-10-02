"""Render individual models and three assembled examples; no custom game viewer."""
import hashlib
import json
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from mathutils import Vector
from pipeline import ENV, arguments, bounds, camera, clone, configure_device, digest, meshes, plain_material, read_kit, render, roots, studio, write_json

args = arguments(__doc__)
selected = set(args.asset.split(',')) if args.asset else set()
configure_device(args.device)
root = ENV / args.kit
source = root / 'source' / (args.kit + '.blend')
bpy.ops.wm.open_mainfile(filepath=str(source))
library = bpy.context.scene
assets = {o['asset_id']: o for o in roots(library)}
kit = read_kit(args.kit)
preview = root / 'previews'
preview.mkdir(exist_ok=True)
manifest = json.loads((root / 'manifest.json').read_text())
assert manifest['source_sha256'] == digest(source), 'Export source edits first'


def new_scene(name, span=12):
    scene = bpy.data.scenes.new(name)
    bpy.context.window.scene = scene
    floor = studio(scene, span)
    return scene, floor


def remove_scene(scene):
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(scene)


def label(scene, text, at, size=.18):
    data = bpy.data.curves.new(text, 'FONT')
    data.body, data.size, data.align_x = text, size, 'CENTER'
    obj = bpy.data.objects.new(text, data)
    scene.collection.objects.link(obj)
    obj.location = at
    data.materials.append(plain_material('Caption', (.65, .69, .65)))


def open_parts(root_obj, asset_id):
    spec = next(a for a in manifest['assets'] if a['id'] == asset_id)
    for motion in spec['moving_parts']:
        obj = next(o for o in root_obj.children_recursive if o.name.startswith(motion['node']))
        if motion['kind'] == 'hinge':
            obj.rotation_euler.z = math.radians(motion['open_degrees'])
        else:
            x, y, z = motion['open_position_m']
            obj.location = (x, -z, y)


if not args.compositions_only:
    if not args.asset:
        sheet, ground = new_scene('Contact sheet', 32)
        cols = 5 if len(assets) <= 30 else 6
        rows = math.ceil(len(assets) / cols)
        for i, (name, obj) in enumerate(assets.items()):
            x, y = (i % cols - (cols - 1) / 2) * 5.4, ((rows - 1) / 2 - i // cols) * 4.5
            low = bounds(obj)['min'][1]
            clone(obj, sheet, name, (x, y, -low - .32))
            label(sheet, name, (x, y - 1.8, -.31), .21)
        label(sheet, kit['title'].upper(), (0, rows * 2.25 + .8, -.31), .6)
        span = max(cols * 5.4, rows * 4.5) + 3
        camera(sheet, (0, -span * .7, span), (0, .4, 0), span, (2400, 2400))
        render(sheet, preview / 'contact-sheet.png')
        camera(sheet, (0, -.001, 40), (0, 0, 0), span, (2400, 2400))
        render(sheet, preview / 'top.png')
        remove_scene(sheet)
    for name, obj in assets.items():
        if args.overview_only:
            continue
        if selected and name not in selected:
            continue
        single, ground = new_scene(name, 5)
        extent = bounds(obj)
        low, high = extent['min'], extent['max']
        copy = clone(obj, single, name, (0, 0, -low[1] - .32))
        target = ((low[0] + high[0]) / 2, -(low[2] + high[2]) / 2, (high[1] - low[1]) / 2 - .32)
        size = max(high[i] - low[i] for i in range(3))
        camera(single, (target[0] + 4, target[1] - 6, target[2] + 4), target, max(size * 1.6, 1), (720, 720))
        render(single, preview / (name + '.png'))
        spec = next(a for a in manifest['assets'] if a['id'] == name)
        if spec['moving_parts']:
            open_parts(copy, name)
            render(single, preview / (name + '-open.png'))
        remove_scene(single)
if args.asset:
    assert selected <= assets.keys(), f'Unknown assets: {selected - assets.keys()}'
    raise SystemExit(0)

# Courtyard extension scenes can reuse the original library without modifying it.
if args.kit == 'courtyard-extension':
    old_source = ENV / 'courtyard/source/courtyard.blend'
    with bpy.data.libraries.load(str(old_source), link=False) as (available, requested):
        requested.objects = [n for n in available.objects if n in ('paving-plain', 'paving-cracked', 'pillar-large', 'pillar-small', 'wall-straight', 'wall-low', 'urn-jade')]
    for obj in requested.objects:
        wrapper = bpy.data.objects.new('original-' + obj.name, None)
        library.collection.objects.link(wrapper)
        library.collection.objects.link(obj)
        obj.parent = wrapper
        obj.location = (0, 0, 0)
        assets[obj.name] = wrapper


def asset_for(recipe):
    found = next((e['id'] for e in kit['assets'] if e['recipe'] == recipe), None)
    if found:
        return found
    return {'floor-plain': 'paving-plain', 'floor-cracked': 'paving-cracked',
            'pillar-large': 'pillar-large', 'pillar-small': 'pillar-small',
            'wall-straight': 'wall-straight', 'wall-low': 'wall-low'}.get(recipe)


layouts = []
example_scenes = []
prop_ids = [a['id'] for a in manifest['assets'] if a['category'] == 'prop' and not a['id'].startswith('channel-')]
for variant, title in enumerate(['terrace', 'crossing', 'enclosure']):
    scene, floor = new_scene(kit['title'] + ' | ' + title, 14)
    placements = []
    def place(recipe, x, y, z=0, angle=0, opened=False, exact=False):
        name = recipe if exact else asset_for(recipe)
        if not name or name not in assets:
            return None
        obj = clone(assets[name], scene, name + ' instance', (x, y, z), angle)
        if opened:
            open_parts(obj, name)
        placements.append({'asset': name, 'kit': 'courtyard' if name not in {e['id'] for e in kit['assets']} else args.kit,
                           'position_m': [x, z, -y], 'yaw_degrees': math.degrees(angle), 'open': opened})
        return obj
    if variant == 0:
        for x in (-4, -2, 0, 2, 4):
            for y in (-3, -1, 1, 3):
                recipe = 'floor-grate' if x == 2 and y == -1 else 'floor-cracked' if x == -2 and y == -1 else 'floor-plain'
                place(recipe, x, y)
            place('platform', x, 3)
        place('stair-full', 0, .8)
        for x in (-1.1, 1.1):
            place('stair-rail', x, .8)
        place('doorway', 0, 3.75, 1.2, opened=True)
        for x in (-3.7, 3.7):
            place('railing-straight', x, 2.1, 1.2)
            place('pillar-large', x, 3.2, 1.2)
        for y in (-3, -1, 1):
            place('wall-straight', -4.8, y, angle=math.pi / 2)
        for i, name in enumerate(prop_ids[:5]):
            place(name, *[(-3.4, .1), (3.5, .2), (-3, -2.8), (3.2, -2.8), (2.5, 3.0)][i], z=1.2 if i == 4 else 0, exact=True)
    elif variant == 1:
        has_bridge = bool(asset_for('bridge'))
        for x in ((-5, -3, 3, 5) if has_bridge else (-4, -2, 2, 4)):
            for y in (-3, -1, 1, 3):
                place('floor-plain', x, y)
        # Two landings joined by a deck over a recessed, non-traversable gap.
        if has_bridge:
            place('bridge', 0, 0, angle=math.pi / 2)
        else:
            place('landing', 0, 0)
        for x in (-4, 4):
            for y in (-2.7, 2.7):
                place('pillar-small', x, y)
        for x in (-3, 3):
            place('wall-low', x, -3.8)
            place('wall-straight', x, 3.8)
        place('gate-wide', 2.4 if has_bridge else 1.4, 0, angle=math.pi / 2, opened=True)
        for i, name in enumerate(prop_ids[3:9]):
            place(name, -4 if i % 2 == 0 else 4, -1.8 + (i // 2) * 1.6, exact=True)
        if args.kit == 'flooded-cistern':
            # Channels occupy the drainage gap, below the deck, never a solid tile.
            for name, y, angle in [('channel-straight', -3, math.pi / 2),
                                    ('channel-junction', -1, 0),
                                    ('channel-straight', 1, math.pi / 2),
                                    ('channel-corner', 3, math.pi)]:
                place(name, 0, y, z=-.04, angle=angle, exact=True)
    else:
        for x in (-4, -2, 0, 2, 4):
            for y in (-3, -1, 1, 3):
                place('floor-inset' if x == 0 and y == 1 else 'floor-worn', x, y)
        for x in (-4, -2, 2, 4):
            place('wall-tall', x, 3.8)
        for y in (-3, -1, 1):
            place('wall-straight', -4.8, y, angle=math.pi / 2)
        place('doorway', 0, 3.8)
        for x in (-2, 2):
            place('pillar-large', x, .8)
        for i, name in enumerate(prop_ids[-5:]):
            place(name, *[(-3.3, 2.5), (3.3, 2.5), (-3.5, -2), (3.5, -1.5), (0, 1.8)][i], exact=True)
    camera(scene, (12, -18, 17), (0, .1, .5), 15.2, (1600, 1200))
    example_scenes.append(scene)
    layouts.append({'name': title, 'scene': scene.name, 'placements': placements})

# Save editable assemblies before the optional external character reference is read.
bpy.context.window.scene = example_scenes[0]
examples = root / 'source' / 'examples.blend'
for scene in example_scenes:
    scene.cycles.device = 'CPU'
bpy.ops.wm.save_as_mainfile(filepath=str(examples))
for scene in example_scenes:
    scene.cycles.device = 'GPU' if args.device == 'METAL' else 'CPU'
write_json(root / 'layouts.json', {'coordinate_system': 'glTF meters; +Y up; yaw around +Y', 'scope': 'Art assembly examples, not authored gameplay levels', 'layouts': layouts})

crow_data = {'included': False}
if args.crow:
    reference_scene = bpy.data.scenes.new('External crow reference')
    bpy.context.window.scene = reference_scene
    bpy.ops.import_scene.gltf(filepath=str(args.crow.resolve()))
    source_objects = [o for o in reference_scene.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in source_objects for v in o.data.vertices]
    zmin, zmax = min(v.z for v in pts), max(v.z for v in pts)
    scale = .95 / (zmax - zmin)
    for obj in source_objects:
        data = obj.data.copy()
        matrix = obj.matrix_world.copy()
        for v in data.vertices:
            p = matrix @ v.co
            v.co = (p.x * scale, p.y * scale, (p.z - zmin) * scale)
        for index, scene in enumerate(example_scenes):
            copy = bpy.data.objects.new('Crow | scale reference only', data)
            scene.collection.objects.link(copy)
            copy.location = (0, 0, 0) if index == 1 else (-.4, -1.8, 0)
    crow_data = {'included': True, 'source_name': args.crow.name, 'sha256': digest(args.crow), 'height_m': .95,
                 'note': 'External read-only reference. Not included in exports or saved example scenes.'}

for scene, layout in zip(example_scenes, layouts):
    render(scene, preview / (layout['name'] + '.png'))
scene = example_scenes[0]
camera(scene, (0, -.001, 20), (0, 0, 0), 13, (1400, 1400))
render(scene, preview / 'terrace-top.png')
camera(scene, (4.5, -7.794, 5.8), (0, 0, .6), 13, (390, 844))
render(scene, preview / 'phone-scale.png')
write_json(preview / 'render-info.json', {'source_sha256': digest(source), 'examples_sha256': digest(examples),
    'render_device': args.device,
    'crow': crow_data, 'phone_resolution': [390, 844], 'phone_elevation_degrees': 30,
    'scope': 'Blender art review. Not a gameplay screenshot, device test or performance measurement.'})
print('PREVIEWS_READY', args.kit)
