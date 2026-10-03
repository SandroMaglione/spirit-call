"""Generate editable Blender assets. Existing sources require explicit replacement."""
import json
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from architecture import architecture, STRUCTURES
from geometry import palette_material
from pipeline import ENV, arguments, camera, read_kit, studio
from props import prop

args = arguments(__doc__)
root = ENV / args.kit
source = root / 'source' / (args.kit + '.blend')
if source.exists() and not args.replace_generated:
    raise SystemExit('Source exists. Export manual edits directly, or pass --replace-generated to deliberately rebuild.')
kit = read_kit(args.kit)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = kit['title'] + ' | editable library'
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
material = palette_material(kit['title'] + ' | vertex colors')
for i, entry in enumerate(kit['assets']):
    recipe = entry['recipe']
    if kit.get('batch') == 'beta-arenas':
        from beta_architecture import beta_architecture
        from beta_props import beta_prop
        from beta_specs import EXTRA_STRUCTURES
        parts, metadata = beta_architecture(recipe, kit['style']) if recipe in STRUCTURES + EXTRA_STRUCTURES else beta_prop(recipe, kit['style'])
    else:
        parts, metadata = architecture(recipe, kit['style']) if recipe in STRUCTURES else prop(recipe, kit['style'], **entry.get('options', {}))
    collection = bpy.data.collections.new(entry['id'])
    scene.collection.children.link(collection)
    asset = bpy.data.objects.new(entry['id'], None)
    collection.objects.link(asset)
    asset.empty_display_type = 'PLAIN_AXES'
    asset.empty_display_size = .15
    asset['asset_id'] = entry['id']
    asset['recipe'] = recipe
    asset['metadata_json'] = json.dumps(metadata)
    for name, mesh, offset in parts:
        mesh.object(entry['id'] + '__' + name, kit['palette'], material, collection, asset, offset)
    bottom = min(v[2] + offset[2] for _, mesh, offset in parts for v in mesh.vertices)
    asset.location = ((i % 6 - 2.5) * 5.5, (math.ceil(len(kit['assets']) / 6) / 2 - i // 6) * 4.8, -.32 - bottom)
span = max(34, math.ceil(len(kit['assets']) / 6) * 5)
studio(scene, span)
camera(scene, (0, -span * .65, span), (0, 1, 0), span + 3, (2200, 2200))
scene['source_policy'] = 'Manual edits are authoritative. Export does not run the generator or save this source.'
scene['axes'] = 'Blender Z up / -Y front. GLB +Y up / +Z front. Meters.'
scene.render.filepath = '//../previews/contact-sheet.png'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.type = 'MATERIAL'
            area.spaces.active.region_3d.view_distance = span
            area.spaces.active.region_3d.view_rotation = scene.camera.rotation_euler.to_quaternion()
source.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source))
print('SOURCE_READY', source, len(kit['assets']))
