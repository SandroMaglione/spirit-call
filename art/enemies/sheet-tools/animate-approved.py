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

def center(name):
    obj = bpy.data.objects[name]
    return sum((obj.matrix_world@v.co for v in obj.data.vertices), Vector())/len(obj.data.vertices)

def pose(kind, action, t):
    s, c = math.sin(math.tau*t), math.cos(math.tau*t)
    result = {}
    if action == 'Idle':
        result['body'] = transform((0, .006*s, 0), (0, 0, .004*(1-c)))
        if kind == 'charger':result['flame'] = transform((.025*s, 0, .025*s))
    elif action == 'Run':
        result['body'] = transform((.025, .008*s, 0), (0, 0, .009*(1-c)))
        for side, sign in (('L', 1), ('R', -1)):
            result['leg.'+side] = transform(location=(0, .025*s*sign, .028*max(0, s*sign)))
        if kind == 'charger':
            for side, sign in (('L', 1), ('R', -1)):
                result['arm.'+side] = transform((.09*s*sign, 0, 0))
        if kind == 'guardian':result['arm.L'] = transform((.07*s, 0, 0))
    elif action.startswith(('Windup', 'Active', 'Recovery')):
        ready, strike = shared.drive(action, t)
        if kind == 'charger':
            if action.endswith('Swipe'):
                result['body'] = transform((.03*strike, 0, -.20*ready+.40*strike), (0, 0, .01*ready))
                result['arm.R'] = transform((-.50*ready-.35*strike, 0, -.55*ready+1.05*strike))
                result['arm.L'] = transform((-.12*ready, 0, 0))
            else:
                result['body'] = transform((-.05*ready+.13*strike, 0, .04*ready), (0, 0, .018*ready))
                result['arm.L'] = transform((-2.10*ready+1.40*strike, 0, 0))
                result['arm.R'] = transform((-.20*ready+.10*strike, 0, 0))
                # The physical projectile starts at release; the held prop returns in recovery.
                size = max(.001, 1-strike)
                result['bomb'] = transform((2.10*ready-1.40*strike, 0, 0), scale=(size, size, size))
        elif kind == 'sniper':
            result['body'] = transform((-.025*ready+.07*strike, 0, 0), (0, 0, -.028*ready+.012*strike))
            result['head'] = transform((-.58*ready+.10*strike, 0, 0))
            for side, sign in (('L', -1), ('R', 1)):
                result['arm.'+side] = transform((-.12*ready, 0, .08*ready*sign))
        else:
            thrust = action.endswith('Thrust')
            result['body'] = transform((-.025*ready+.09*strike, 0, -.12*ready+(.16 if thrust else .30)*strike), (0, 0, .012*ready))
            if thrust:
                result['arm.L'] = transform((-.35*ready-.90*strike, 0, -.10*ready))
            else:
                result['arm.L'] = transform((-.85*ready+.25*strike, 0, -.65*ready+1.05*strike))
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
                if name.startswith(tuple(p+'.'+side for p in ('LegArmor', 'ThighJoint', 'Hock', 'Shin', 'Knee', 'Ankle', 'Foot', 'Toe', 'LegConductor'))):return 'leg.'+side
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
