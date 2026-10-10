"""Animate the approved Hearth meshes in place, then export their object clips.

The stone bowl stays rigid. Flame motion comes from its basin pivot; stones
lag and open around the body. The original static source/export are untouched.
"""
import hashlib
import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
FPS = 30
TAU = math.tau
REST = dict(rise=0., pitch=0., roll=0., yaw=0., flare=0., bend=0.,
            squint=0., spread=0., trail=0.)
GROUPS = {
    'HearthBody': ['HearthBody','BowlRim','EmberBasin','Jaw.L','Jaw.R',
                  'BowlCrack.-1','BowlCrack.1','RimCrack.-1','RimCrack.1',
                  'RearCrack.-1','RearCrack.1','FaceEmberSeam'],
    'FlameCore': ['FlameCore','FlameTongue.L','FlameTongue.Rear'],
    'Support.L': ['Support.L','SupportEmber.0'],
    'Support.R': ['Support.R','SupportEmber.1'],
    'Support.Front': ['Support.Front','SupportEmber.2'],
}


def ease(t):
    return t*t*(3-2*t)


def at(keys, frame):
    for (a, left), (b, right) in zip(keys, keys[1:]):
        if frame <= b:
            t = ease(max(0, (frame-a)/(b-a)))
            return {k: left.get(k, 0)*(1-t)+right.get(k, 0)*t for k in REST}
    return REST | keys[-1][1]


def strike(size, side, contact, end):
    return [(0, {}), (contact-2, dict(pitch=.065*size, roll=-.035*side,
            yaw=-.05*side, flare=-.13, squint=.2, spread=-.3)),
        (contact, dict(pitch=-.13*size, roll=.055*side, yaw=.08*side,
            flare=.3*size, bend=.09*size, squint=.55, spread=.55*size, rise=.016*size)),
        (contact+3, dict(pitch=-.035, flare=.12, bend=-.035,
            spread=.2, rise=.008, squint=.15)), (end, {})]


KEYS = {
    'AttackA': strike(1., 1, 4, 11),
    'AttackB': strike(1., -1, 4, 11),
    'AttackC': strike(1.3, 1, 6, 16),
    'Power': strike(1.7, -1, 6, 16),
    'Dash': [(0, {}), (2, dict(pitch=.23, bend=-.32, flare=-.16,
        squint=.7, trail=1., spread=-.2, rise=.024)),
        (7, dict(pitch=.2, bend=-.27, flare=-.12, squint=.7, trail=.8, rise=.024)),
        (9, dict(pitch=-.055, flare=.16, rise=.013, spread=.25)), (11, {})],
    'Hurt': [(0, {}), (1, dict(pitch=-.16, roll=.065, flare=-.32,
        squint=1., spread=.8, bend=.11)),
        (4, dict(pitch=.04, roll=-.02, flare=.13, rise=.012, spread=.2)), (9, {})],
    'Cast': [(0, {}), (2, dict(rise=.045, pitch=.035, flare=.48,
        spread=1.1, squint=-.15)),
        (6, dict(rise=.022, pitch=-.025, flare=.22, spread=.65)), (11, {})],
    'Ultimate': [(0, {}), (2, dict(rise=.025, flare=-.24,
        spread=-.5, pitch=.035, squint=.4)),
        (8, dict(rise=.12, flare=.65, spread=2., squint=-.22)),
        (11, dict(rise=.045, flare=.2, spread=.8, pitch=-.05)), (17, {})],
}
CONTACT = dict(AttackA=4, AttackB=4, AttackC=6, Power=6)
DESCRIPTIONS = {
    'Idle': 'Slow hover, flame flicker, loose stone drift and one warm blink.',
    'Run': 'Forward hover lean, flame streaming back and stones trailing.',
    'AttackA': 'Left recoil and small flame pulse.',
    'AttackB': 'Mirrored right recoil and small flame pulse.',
    'AttackC': 'Stronger finishing recoil and flare.',
    'Power': 'Charged recoil with a broad flame flare.',
    'Dash': 'Compact forward lean, trailing flame and stones, then a soft brake.',
    'Hurt': 'Rigid bowl recoil, narrowed eyes and a flame dip, then recovery.',
    'Cast': 'Warm healing pulse, opening stones and taller flame.',
    'Ultimate': 'Gather inward, rise into a beacon flare, then settle.',
}


def pivot(obj, point):
    # Rebase geometry without changing any world-space vertex in the rest pose.
    world = obj.matrix_world.copy()
    target = Matrix.Translation(point)
    obj.data.transform(target.inverted() @ world)
    obj.matrix_world = target


def prepare():
    bpy.ops.wm.open_mainfile(filepath=str(HERE/'hearth-spirit.blend'))
    for name, names in GROUPS.items():
        bpy.ops.object.select_all(action='DESELECT')
        for n in names:
            bpy.data.objects[n].select_set(True)
        bpy.context.view_layer.objects.active = bpy.data.objects[name]
        bpy.ops.object.join()
    body = bpy.data.objects['HearthBody']
    pivot(body, Vector((0, 0, .34)))
    pivot(bpy.data.objects['FlameCore'], Vector((0, 0, .495)))
    bpy.context.view_layer.update()
    for obj in list(bpy.context.scene.objects):
        if obj != body:
            world = obj.matrix_world.copy()
            obj.parent = body
            obj.matrix_parent_inverse = Matrix.Identity(4)
            obj.matrix_basis = body.matrix_world.inverted() @ world
    bpy.context.view_layer.update()
    objects = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}
    base = {name: o.location.copy() for name, o in objects.items()}
    for obj in objects.values():
        obj['static_stage'] = False
        obj['animation_role'] = ('rigid bowl' if obj == body else
            'basin anchored flame' if obj.name == 'FlameCore' else
            'face attached eye' if obj.name.startswith('Eye') else 'floating stone')
    return objects, base


def pose(objects, base, p, phase=0., drift=0.):
    for name, o in objects.items():
        o.location = base[name]
        o.rotation_euler = (0, 0, 0)
        o.scale = (1, 1, 1)
        if name == 'HearthBody':
            o.location.z += p['rise']
            o.rotation_euler = (p['pitch'], p['roll'], p['yaw'])
        elif name == 'FlameCore':
            o.scale = (1-.09*p['flare'], 1-.06*p['flare'], 1+p['flare'])
            o.rotation_euler = (p['bend'], .025*drift*math.sin(phase*2),
                                .025*drift*math.sin(phase))
        elif name.startswith('Eye'):
            o.scale.z = max(.08, 1-.92*p['squint'])
        else:
            side = -1 if name.endswith('.L') else 1 if name.endswith('.R') else 0
            radial = Vector((base[name].x, base[name].y, 0)).normalized()
            o.location += radial * (.038*p['spread'])
            o.location.y += .037*p['trail']
            o.location.z += .008*p['spread']+.006*drift*math.sin(phase+side*.8)
            # The satellites counter a fraction of the bowl's tilt, adding weight.
            o.rotation_euler = (-.3*p['pitch'], -.35*p['roll']+.02*side*p['spread'],
                                -.25*p['yaw']+.018*drift*math.sin(phase+side))


def loop_pose(name, frame):
    length = 90 if name == 'Idle' else 24
    t = frame/length
    phase = TAU*t
    if name == 'Idle':
        blink = max(0, 1-abs(frame-62)/3)
        return REST | dict(rise=.007*(1-math.cos(phase)),
            pitch=.012*math.sin(phase), roll=.012*math.sin(phase),
            flare=.035*math.sin(phase*3)+.02*math.sin(phase*7),
            bend=.035*math.sin(phase*2), squint=blink), phase, .65
    return REST | dict(rise=.012*(1-math.cos(phase)),
        pitch=.12+.015*math.sin(phase), roll=.018*math.sin(phase),
        flare=.025*math.sin(phase*3), bend=-.15+.035*math.sin(phase*2),
        trail=.8, spread=-.15), phase, 1.


def build_clips(objects, base):
    timing = {}
    for clip in ['Idle', 'Run', *KEYS]:
        loop = clip in ('Idle', 'Run')
        count = (90 if clip == 'Idle' else 24) if loop else KEYS[clip][-1][0]+1
        actions = {}
        for name, obj in objects.items():
            obj.animation_data_create()
            action = bpy.data.actions.new(f'{clip}/{name}')
            obj.animation_data.action = action
            actions[name] = action
        for frame in range(count):
            p, phase, drift = loop_pose(clip, frame) if loop else (at(KEYS[clip], frame), 0, 0)
            pose(objects, base, p, phase, drift)
            for obj in objects.values():
                for channel in ('location', 'rotation_euler', 'scale'):
                    obj.keyframe_insert(channel, frame=frame)
        for name, obj in objects.items():
            action = actions[name]
            for curve in action.fcurves:
                for point in curve.keyframe_points:
                    point.interpolation = 'LINEAR'
            obj.animation_data.action = None
            track = obj.animation_data.nla_tracks.new()
            track.name = clip
            track.mute = True
            strip = track.strips.new(clip, 0, action)
            strip.extrapolation = 'NOTHING'
            strip.blend_type = 'REPLACE'
        timing[clip] = dict(lastKeySeconds=(count-1)/FPS,
                           loopSeconds=count/FPS if loop else None)
    pose(objects, base, REST)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = 89
    scene.frame_set(0)
    scene['stage'] = 'animated'
    scene['root_motion'] = 'none; horizontal body translation is constant'
    return timing


def export(timing):
    bpy.ops.object.select_all(action='SELECT')
    path = HERE/'hearth-animated.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB',
        use_selection=True, export_cameras=False, export_lights=False,
        export_texcoords=False, export_normals=True, export_yup=True,
        export_extras=True, export_attributes=True, export_all_vertex_colors=True,
        export_animations=True, export_animation_mode='NLA_TRACKS',
        export_force_sampling=True, export_frame_range=False)
    raw = path.read_bytes()
    length, kind = struct.unpack_from('<II', raw, 12)
    gltf = json.loads(raw[20:20+length])
    tail = raw[20+length:]
    for mat in gltf['materials']:
        if mat['name'] in ('Hearth flame and molten seams','Hearth warm eyes'):
            mat.setdefault('extensions', {})['KHR_materials_unlit'] = {}
            mat.pop('emissiveFactor', None)
            mat['extensions'].pop('KHR_materials_emissive_strength', None)
    gltf['extensionsUsed'] = sorted(set(gltf.get('extensionsUsed', [])) | {'KHR_materials_unlit'})
    gltf['extras'] = dict(character='Hearth', stage='animated', rootMotion=False,
        staticReferenceSha256=hashlib.sha256((HERE/'hearth-spirit.glb').read_bytes()).hexdigest())
    encoded = json.dumps(gltf, separators=(',', ':')).encode()
    encoded += b' '*((-len(encoded)) % 4)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 20+len(encoded)+len(tail))+
                     struct.pack('<II', len(encoded), kind)+encoded+tail)
    info = json.loads((HERE/'export.json').read_text())
    info.update(stage='animated', clips=timing, fps=FPS, root_motion=False,
        contact_frames=CONTACT, descriptions=DESCRIPTIONS,
        static_reference_sha256=gltf['extras']['staticReferenceSha256'],
        bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    (HERE/'animation.json').write_text(json.dumps(info, indent=2)+'\n')
    print(json.dumps(dict(clips=timing, bytes=info['bytes'], sha256=info['sha256']), indent=2))


if __name__ == '__main__':
    objects, base = prepare()
    timing = build_clips(objects, base)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'hearth-animated.blend'))
    export(timing)
