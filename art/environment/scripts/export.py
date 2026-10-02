"""Export saved sources, preserving authored hierarchy and movable-part pivots."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from pipeline import ENV, arguments, bounds, digest, meshes, roots, write_json

args = arguments(__doc__)
root = ENV / args.kit
source = root / 'source' / (args.kit + '.blend')
bpy.ops.wm.open_mainfile(filepath=str(source))
manifest = {'schema_version': 2, 'kit': args.kit, 'units': 'meters', 'up': '+Y', 'forward': '+Z',
            'source': str(source.relative_to(root)), 'source_sha256': digest(source),
            'scope': 'Art delivery metadata. Runtime must opt into traversal, collision and interactions.',
            'assets': []}
(root / 'models').mkdir(exist_ok=True)
for asset in roots(bpy.context.scene):
    bpy.ops.object.select_all(action='DESELECT')
    nodes = [asset] + list(asset.children_recursive)
    for obj in nodes:
        assert not obj.modifiers and all(abs(x - 1) < 1e-6 for x in obj.scale), f'Apply scale/modifiers: {obj.name}'
        assert all(abs(x) < 1e-6 for x in obj.rotation_euler), f'Close/reset rotations: {obj.name}'
        obj.select_set(True)
    asset.location = (0, 0, 0)
    bpy.context.view_layer.objects.active = asset
    bpy.context.view_layer.update()
    path = root / 'models' / (asset['asset_id'] + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_yup=True, export_animations=False, export_cameras=False, export_lights=False,
        export_texcoords=False, export_normals=True, export_materials='EXPORT',
        export_vertex_color='NAME', export_vertex_color_name='Color', export_all_vertex_colors=False)
    metadata = json.loads(asset['metadata_json'])
    for motion in metadata['moving_parts']:
        motion['node'] = asset['asset_id'] + '__' + motion['node']
    triangle_count = 0
    for obj in meshes(asset):
        obj.data.calc_loop_triangles()
        triangle_count += len(obj.data.loop_triangles)
    extent = bounds(asset)
    manifest['assets'].append({'id': asset['asset_id'], 'file': str(path.relative_to(root)),
        'bounds_m': extent, 'dimensions_m': [extent['max'][i] - extent['min'][i] for i in range(3)],
        'triangles': triangle_count, 'mesh_count': len(meshes(asset)), 'bytes': path.stat().st_size,
        'sha256': digest(path), **metadata})
write_json(root / 'manifest.json', manifest)
assert digest(source) == manifest['source_sha256']
print('EXPORTED', args.kit, len(manifest['assets']))
