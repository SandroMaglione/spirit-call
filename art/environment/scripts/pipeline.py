"""Shared source/export helpers. No game or third-party Python dependency."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ENV = Path(__file__).resolve().parents[1]
RENDER_DEVICE = 'CPU'


def arguments(description):
    p = argparse.ArgumentParser(description=description)
    p.add_argument('--kit', required=True, choices=sorted(path.parent.name for path in ENV.glob('*/kit.json')))
    p.add_argument('--replace-generated', action='store_true')
    p.add_argument('--asset')
    p.add_argument('--compositions-only', action='store_true')
    p.add_argument('--overview-only', action='store_true')
    p.add_argument('--crow', type=Path)
    p.add_argument('--device', choices=['CPU', 'METAL'], default='CPU')
    return p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_kit(name):
    return json.loads((ENV / name / 'kit.json').read_text())


def meshes(root):
    return [o for o in root.children_recursive if o.type == 'MESH']


def roots(scene):
    return sorted([o for o in scene.objects if 'asset_id' in o], key=lambda o: o['asset_id'])


def points(root):
    inverse = root.matrix_world.inverted()
    return [inverse @ obj.matrix_world @ v.co for obj in meshes(root) for v in obj.data.vertices]


def bounds(root):
    coords = [(v.x, v.z, -v.y) for v in points(root)]
    return {'min': [min(v[i] for v in coords) for i in range(3)],
            'max': [max(v[i] for v in coords) for i in range(3)]}


def plain_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .9
    return mat


def studio(scene, span=12):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.device = RENDER_DEVICE
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new(scene.name + ' | world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.55, .62, .70, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .4
    studio = bpy.data.collections.new(scene.name + ' | STUDIO')
    scene.collection.children.link(studio)
    from geometry import Mesh
    # This closed slab works in the viewport as well as the renderer.
    mat = plain_material('Backdrop', (.16, .18, .175))
    plane = Mesh().box(0, 0, -.42, 100, 100, .1).object('STUDIO floor', {'stone': '787E78'}, mat, studio)
    for name, loc, power, tint in [
        ('Key', (-span * .3, -span * .4, span * .9), span * span * 24, (1, .92, .8)),
        ('Fill', (span * .4, span * .1, span * .6), span * span * 11, (.76, .86, 1))]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size, data.color = power, 'DISK', span * .6, tint
        obj = bpy.data.objects.new(name, data)
        studio.objects.link(obj)
        obj.location = loc
        obj.rotation_euler = (Vector((0, 0, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('Inspection camera', bpy.data.cameras.new('Inspection camera'))
    studio.objects.link(camera)
    camera.data.type = 'ORTHO'
    scene.camera = camera
    return plane


def configure_device(device):
    global RENDER_DEVICE
    if device == 'METAL':
        preferences = bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type = 'METAL'
        preferences.get_devices()
        assert any(d.type == 'METAL' for d in preferences.devices), 'No Metal render device'
        for device in preferences.devices:
            device.use = device.type == 'METAL'
        RENDER_DEVICE = 'GPU'


def camera(scene, eye, target, scale, size):
    scene.camera.location = eye
    scene.camera.rotation_euler = (Vector(target) - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera.data.ortho_scale = scale
    scene.render.resolution_x, scene.render.resolution_y = size


def clone(root, scene, name, location=(0, 0, 0), angle=0):
    objects = [root] + list(root.children_recursive)
    mapping = {}
    for old in objects:
        new = old.copy()
        scene.collection.objects.link(new)
        new.hide_render = False
        new.hide_viewport = False
        if 'asset_id' in new:
            del new['asset_id']
        mapping[old] = new
    for old, new in mapping.items():
        new.parent = mapping.get(old.parent)
    copy = mapping[root]
    copy.name = name
    copy.location = location
    copy.rotation_euler.z = angle
    return copy


def render(scene, path):
    bpy.context.window.scene = scene
    scene.render.filepath = str(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')
