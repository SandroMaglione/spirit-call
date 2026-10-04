"""Animate approved Firebomber, Sniper and Guardian geometry without rebuilding it.

Blender --background --python animate-approved.py -- charger build-export
"""
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('approved_export', ROOT/'production-tools/animate-approved.py')
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
from common import Creature, transform

LEG_RIG = {}

def ease(t):
    t = min(1, max(0, t))
    return t*t*(3-2*t)

def attack_drive(action, t):
    # Load early, hold the silhouette, then accelerate through release.
    if action.startswith('Windup'):
        return ease(t/.60), max(0, (t-.76)/.24)**2, 0
    if action.startswith('Active'):
        return 1, 1+.16*math.sin(math.pi*t), 0
    settle = 1-ease(t)
    return settle, settle+.28*math.sin(math.pi*min(1, t/.38)), math.sin(math.pi*min(1, t/.32))

def sniper_legs(result, strides=(0, 0), lifts=(0, 0)):
    """Rigid two-link legs fold from the measured hips to flat, planted feet."""
    rotation, location, _ = result.get('body', transform())
    body = Euler(rotation).to_matrix()
    for i, side in enumerate(('L', 'R')):
        hip, hock, ankle, pivot = LEG_RIG[side]
        at = pivot+body@(hip-pivot)+Vector(location)
        foot = ankle+Vector((0, strides[i], lifts[i]))
        upper, lower = hock-hip, ankle-hock
        axis = foot-at
        distance = axis.length
        axis.normalize()
        length = min(distance, upper.length+lower.length-1e-5)
        along = (upper.length**2-lower.length**2+length**2)/(2*length)
        bend = hock-hip-(ankle-hip)*((hock-hip).dot(ankle-hip)/(ankle-hip).length_squared)
        bend -= axis*bend.dot(axis)
        bend.normalize()
        joint = at+axis*along+bend*math.sqrt(max(0, upper.length**2-along**2))
        a = upper.rotation_difference(joint-at)
        b = lower.rotation_difference(foot-joint)
        result['leg.'+side] = transform(a.to_euler(), at-hip)
        result['shin.'+side] = transform((a.conjugated()@b).to_euler())
        result['foot.'+side] = transform(b.conjugated().to_euler())

def center(name):
    obj = bpy.data.objects[name]
    return sum((obj.matrix_world@v.co for v in obj.data.vertices), Vector())/len(obj.data.vertices)

def pose(kind, action, t):
    s, c = math.sin(math.tau*t), math.cos(math.tau*t)
    result = {}
    if action == 'Idle':
        breath = (1-c)/2
        if kind == 'charger':
            # The pack heaves, the bomb hand hangs and the flame trails the
            # shoulders. Tiny torso translations disappear at phone scale.
            result['body'] = transform((.05*breath, .055*s, 0), (0, 0, .025*breath))
            result['head'] = transform((-.04*breath, 0, .12*s))
            for side, sign in (('L', -1), ('R', 1)):
                result['arm.'+side] = transform((.16*s*sign, 0, sign*.08*breath))
            result['bomb'] = transform((-.10*s, 0, 0))
            result['flame'] = transform((.18*math.sin(math.tau*t-.5), 0, .12*s),
                scale=(1+.08*s, 1, 1+.10*s))
        elif kind == 'sniper':
            # Scan over planted articulated legs, with a quiet barrel lift
            # and counter-swaying claws; this stays well below the shot coil.
            result['body'] = transform((.035*breath, .045*s, 0), (0, 0, .025*breath))
            result['head'] = transform((-.035*breath+.045*s, 0, .14*s))
            for side, sign in (('L', -1), ('R', 1)):
                result['arm.'+side] = transform((.12*s*sign, 0, sign*.06*breath))
            sniper_legs(result)
        else:
            # A heavy breath and a watchful helmet, with the mace settling
            # in the free hand. The shield keeps the simulation's facing.
            result['body'] = transform((.035*breath, .04*s, 0), (0, 0, .025*breath))
            result['head'] = transform((-.025*breath, 0, .16*s))
            result['arm.L'] = transform((.16*s, 0, -.08*breath))
            result['shield'] = transform(location=(0, 0, .015*breath))
    elif action == 'Run':
        if kind == 'charger':
            # Short legs drive the heavy backpack; the hood leads and the flame trails.
            result['body'] = transform((.32+.035*c, .045*s, -.035*s), (0, -.035, .022*(1-math.cos(2*math.tau*t))))
            result['head'] = transform((-.10, 0, 0))
            for side, sign in (('L', 1), ('R', -1)):
                result['leg.'+side] = transform(location=(0, .070*s*sign, .050*max(0, s*sign)))
                result['arm.'+side] = transform((.20+.30*s*sign, 0, .04*s*sign))
            result['bomb'] = transform((-.20-.30*s, 0, 0))
            result['flame'] = transform((-.20+.08*s, 0, .06*s))
        elif kind == 'sniper':
            # A low stalking gait, long reaching steps and a steady barrel.
            result['body'] = transform((.34+.025*c, .018*s, 0), (0, -.065, -.035+.015*(1-math.cos(2*math.tau*t))))
            result['head'] = transform((-.30-.025*c, 0, 0))
            for side, sign in (('L', 1), ('R', -1)):
                result['arm.'+side] = transform((-.22+.16*s*sign, 0, .12*sign))
            sniper_legs(result, (.10*s, -.10*s), (.065*max(0, s), .065*max(0, -s)))
        else:
            # Broad steps and a low forward brace carry the shield's weight.
            result['body'] = transform((.26+.025*c, .045*s, -.035*s), (0, -.025, .015*(1-math.cos(2*math.tau*t))))
            result['head'] = transform((-.08, 0, 0))
            result['arm.L'] = transform((.15+.25*s, 0, -.08))
            result['shield'] = transform((.09, 0, 0), (0, -.025, .050+.008*(1-c)))
            for side, sign in (('L', 1), ('R', -1)):
                result['leg.'+side] = transform(location=(0, .070*s*sign, .045*max(0, s*sign)))
    elif action.startswith(('Windup', 'Active', 'Recovery')):
        ready, strike, recoil = attack_drive(action, t)
        if kind == 'charger':
            if action.endswith('Swipe'):
                result['body'] = transform((-.12*ready+.57*strike, 0, -.48*ready+.95*strike), (0, -.065*strike, .025*ready+.025*strike))
                result['arm.R'] = transform((-.65*ready-.50*strike, 0, -.95*ready+1.70*strike))
                result['arm.L'] = transform((-.35*ready+.12*strike, 0, .20*ready-.35*strike))
                result['head'] = transform((-.10*strike, 0, .12*ready-.18*strike))
            else:
                result['body'] = transform((-.28*ready+.78*strike, 0, -.22*ready+.40*strike), (0, -.075*strike, .040*ready+.025*strike))
                result['arm.L'] = transform((-2.20*ready+1.00*strike, 0, -.12*ready+.20*strike), (-.080*(ready-strike), 0, .150*(ready-strike)))
                result['arm.R'] = transform((-.45*ready+.85*strike, 0, .12*ready))
                result['head'] = transform((.12*ready-.20*strike, 0, .10*ready-.12*strike))
                # The physical projectile starts at release; the held prop returns in recovery.
                size = ease((t-.65)/.35) if action.startswith('Recovery') else 1-min(1, strike)
                size = max(.001, size)
                result['bomb'] = transform((2.20*ready-1.00*strike, 0, 0), scale=(size, size, size))
            result['flame'] = transform((.18*ready-.42*strike, 0, 0))
        elif kind == 'sniper':
            # Compress and lock the barrel, drive forward, then kick back on release.
            result['body'] = transform((-.16*ready+.52*strike-.32*recoil, 0, 0), (0, -.085*strike+.055*recoil, -.055*ready+.025*strike))
            result['head'] = transform((-.52*ready-.52*strike+.18*recoil, 0, 0), (0, -.025*strike+.050*recoil, 0))
            for side, sign in (('L', -1), ('R', 1)):
                result['arm.'+side] = transform((-.40*ready+.20*strike+.18*recoil, 0, .20*ready*sign))
            sniper_legs(result)
        else:
            thrust = action.endswith('Thrust')
            result['body'] = transform((-.22*ready+.67*strike, 0, -.42*ready+(.70 if thrust else 1.05)*strike), (0, -.085*strike, .030*ready))
            result['head'] = transform((.08*ready-.18*strike, 0, .14*ready-.24*strike))
            if thrust:
                result['arm.L'] = transform((-.75*ready-1.05*strike, 0, -.40*ready+.85*strike), (0, -.055*strike, 0))
            else:
                result['arm.L'] = transform((-.95*ready+.10*strike, 0, -.95*ready+1.80*strike), (0, -.10*strike, 0))
    elif action == 'Hurt':
        recoil = math.sin(math.pi*t)*(1-t)
        result['body'] = transform((-.12*recoil, .035*recoil, 0), (0, 0, .012*recoil))
    elif action == 'Spawn':
        size = .7+.3*math.sin(math.pi*t/2)
        result['body'] = transform(scale=(size, size, size))
        for name in ('leg.L', 'leg.R', 'shield'):result[name] = transform(scale=(size, size, size))
    elif action == 'Death':
        size = max(.02, 1-max(0, (t-.55)/.45))
        result['body'] = transform((.35*t, 0, .20*t), (0, 0, -.03*t), (size, size, size))
        for name in ('leg.L', 'leg.R', 'shield'):result[name] = transform(scale=(size, size, size))
    return result

def build(kind):
    here = ROOT/kind/'production'
    config = json.loads((here/'spirit.json').read_text())
    source = here/config['blend']
    bpy.ops.wm.open_mainfile(filepath=str(source))
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pivot = center({'charger':'ClothBody', 'sniper':'Torso', 'guardian':'Breastplate'}[kind]);pivot.x = 0
    joints = {'root':((0, 0, 0), None), 'body':(pivot, 'root')}
    head = {'charger':'RecessedFace', 'sniper':'HeadAndPrecisionBarrel', 'guardian':'Helmet'}[kind]
    joints['head'] = ((0, -.265, .95) if kind == 'sniper' else center(head), 'body')
    for side in ('L', 'R'):
        foot = ('Boot.' if kind == 'guardian' else 'Foot.')+side
        joints['leg.'+side] = (center(foot), 'root')
        if kind == 'sniper':
            def landmark(name):
                front, profile = config['landmarks']['front'][name+side], config['landmarks']['right'][name]
                unit = config['meters_per_pixel']
                return Vector(((front[0]-config['center']['front'])*unit,
                    (profile[0]-config['center']['right'])*unit,
                    (config['ground']['front']-front[1])*unit))
            hip, hock, ankle = (landmark(name) for name in ('hip', 'hock', 'ankle'))
            joints['leg.'+side] = (hip, 'root')
            joints['shin.'+side] = (hock, 'leg.'+side)
            joints['foot.'+side] = (ankle, 'shin.'+side)
            LEG_RIG[side] = hip, hock, ankle, pivot
        if kind == 'guardian' and side == 'R':continue
        arm = ('Forearm.' if kind == 'guardian' else 'UpperArm.')+side
        at = center(arm)
        at.z = max((bpy.data.objects[arm].matrix_world@v.co).z for v in bpy.data.objects[arm].data.vertices)
        joints['arm.'+side] = (at, 'body')
    if kind == 'charger':
        joints['bomb'] = (center('HandBomb'), 'arm.L')
        joints['flame'] = (center('FuseCollar'), 'body')
    if kind == 'guardian':
        # The crowd shader rotates this bone around the actor's origin for shield facing.
        joints['shield'] = ((0, 0, 0), 'root')
    def bone_for(obj):
        name = obj.name
        if kind == 'charger':
            if name in ('OpenHood', 'RecessedFace') or name.startswith(('Eye.', 'EyeSocket.')):return 'head'
            if name == 'HandBomb' or name.startswith(('BombFuse', 'BombFlame', 'BombEmber')):return 'bomb'
            if name in ('BackpackFlame', 'FlameCore'):return 'flame'
            if name.startswith(('Ankle', 'Toe')):return 'leg.'+('L' if center(name).x < 0 else 'R')
            for side in ('L', 'R'):
                if name == 'Foot.'+side:return 'leg.'+side
                if name in [p+'.'+side for p in ('UpperArm', 'Cuff', 'Hand')]:return 'arm.'+side
        elif kind == 'sniper':
            if name.startswith(('HeadAnd', 'Crest.', 'CentralCrest', 'Eye', 'AngryBrow', 'BarrelConductor', 'Muzzle')):return 'head'
            for side in ('L', 'R'):
                if name.startswith(tuple(p+'.'+side for p in ('LegArmor', 'ThighJoint', 'Hock', 'Knee', 'LegConductor'))):return 'leg.'+side
                if name == 'Shin.'+side:return 'shin.'+side
                if name.startswith(tuple(p+'.'+side for p in ('Ankle', 'Foot', 'Toe'))):return 'foot.'+side
                if name in [p+'.'+side for p in ('UpperArm', 'Forearm', 'Claw')]:return 'arm.'+side
        else:
            if name.startswith('Shield') or name in ('Forearm.R', 'Gauntlet.R', 'ElbowBand.R'):return 'shield'
            if name in ('Helmet', 'GoldenCrest') or name.startswith(('Visor.', 'Eye.', 'EyeSocket.')):return 'head'
            if name.startswith('Mace') or name in ('Forearm.L', 'Gauntlet.L', 'ElbowBand.L'):return 'arm.L'
            for side in ('L', 'R'):
                if name in ('LegArmor.'+side, 'Boot.'+side):return 'leg.'+side
        return 'body'
    original = sorted(tuple(round(n, 6) for n in obj.matrix_world@v.co) for obj in parts for v in obj.data.vertices)
    assignments = {}
    for obj in parts:
        bone = bone_for(obj);assignments[obj.name] = {bone:len(obj.data.vertices)}
        obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    creature = Creature.__new__(Creature)
    creature.kind = kind;creature.folder = shared.stage(kind);creature.folder.mkdir(exist_ok=True)
    creature.parts = parts;creature.joints = joints
    creature.animate(lambda action, t:pose(kind, action, t))
    rig = creature.armature
    suffix = {'charger':'Swipe', 'guardian':'Thrust'}.get(kind)
    if suffix:
        for base, seconds in (('Windup', 1), ('Active', .4), ('Recovery', .7)):
            name = base+suffix;action = bpy.data.actions[base].copy();action.name = name;action.use_fake_user = True
            rig.animation_data.action = action
            for frame in range(round(seconds*30)+1):
                transforms = pose(kind, name, frame/round(seconds*30))
                for bone in rig.pose.bones:
                    rotation, location, scale = transforms.get(bone.name, transform())
                    basis = bone.bone.matrix_local.to_3x3()
                    bone.rotation_euler = (basis.transposed()@Euler(rotation).to_matrix()@basis).to_euler()
                    bone.location = basis.transposed()@Vector(location);bone.scale = (scale[0], scale[2], scale[1])
                    for attr in ('rotation_euler', 'location', 'scale'):bone.keyframe_insert(data_path=attr, frame=frame+1, group=bone.name)
            creature.clips[name] = {'lastKeySeconds':seconds, 'loopSeconds':None}
    rig['clips'] = json.dumps(creature.clips);rig.animation_data.action = None;rig.data.pose_position = 'REST'
    bpy.context.view_layer.update();mesh = creature.mesh;mesh.data.calc_loop_triangles()
    assert sorted(tuple(round(n, 6) for n in mesh.matrix_world@v.co) for v in mesh.data.vertices) == original
    audit = json.loads((here/'audit.json').read_text())
    assert len(mesh.data.loop_triangles) == audit['triangles'] < 2000
    assert len(rig.data.bones) <= 12 and len(mesh.data.materials) == 1
    rig.data.pose_position = 'POSE';rig.animation_data.action = bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(creature.folder/(kind+'.blend')))
    report = {'source':'../'+source.name, 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'triangles':audit['triangles'], 'bones':len(rig.data.bones), 'materials':1, 'mesh_objects':1,
        'part_bindings':assignments, 'clips':creature.clips, 'root_motion':False, 'rest_vertices_preserved':True}
    (creature.folder/'rig-info.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report))

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--')+1:];kind = args[0]
    assert kind in ('charger', 'sniper', 'guardian')
    command = args[1] if len(args)>1 else 'build-export'
    if command in ('build', 'build-export'):build(kind)
    if command in ('export', 'build-export'):
        shared.export(kind)
        module = ROOT.parents[1]/'src/presentation/assets/enemies'/(kind+'.ts')
        module.write_text(module.read_text().replace('production-tools/animate-approved.py', 'sheet-tools/animate-approved.py'))
