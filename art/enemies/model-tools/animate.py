"""Rig approved Warden, Stalker and Volatile geometry, then export for the crowd atlas.

Blender --background --python-exit-code 1 --python animate.py -- KIND build-export
Geometry stays in the approved static source; animation is saved separately.
"""
import importlib.util
import json
import math
import hashlib
import sys
from pathlib import Path
import bpy
from mathutils import Vector, Euler
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from common import Creature, transform

spec = importlib.util.spec_from_file_location('approved', ROOT / 'production-tools/animate-approved.py')
approved = importlib.util.module_from_spec(spec)
spec.loader.exec_module(approved)

def center(name):
    obj = bpy.data.objects[name]
    return sum((obj.matrix_world @ v.co for v in obj.data.vertices), Vector()) / len(obj.data.vertices)

def upper(name):
    obj = bpy.data.objects[name]
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    threshold = max(p.z for p in points) - .015
    points = [p for p in points if p.z >= threshold]
    return sum(points, Vector()) / len(points)

def ease(t):
    t = max(0, min(1, t))
    return t*t*(3-2*t)

def attack_drive(kind, action, t):
    # Coil, hold the readable warning, then accelerate into contact. Active
    # carries the swing onward; recovery starts on its last pose, not contact.
    if action.startswith('Windup'):
        charge = ease(t/.58)
        strike = ease((t-.80)/.20)
        return charge*(1-strike), strike, 0
    if action.startswith('Active'):
        return 0, 1, 0 if kind == 'warden' else ease(t)
    settle = 1-ease(t)
    # Warden's bolt has no active duration, so its recovery begins at contact.
    follow = math.sin(math.pi*min(1, t/.35))*.28 if kind == 'warden' else settle
    return 0, settle, follow

def step(t, reach, lift):
    phase = t % 1
    # The planted half moves backward under the travelling body; the swing
    # half lifts and returns the foot forward. A sinusoid would skid at plant.
    if phase < .5:
        return (0, -reach+4*reach*phase, 0)
    return (0, reach-4*reach*(phase-.5), lift*math.sin(math.tau*(phase-.5)))

def plant_legs(out, joints, strides=None, follow_body=False):
    """Keep foot plants independent of the torso lean, without root travel."""
    rotation, location, scale = out['body']
    matrix = Euler(rotation).to_matrix()
    pivot = Vector(joints['body'][0])
    for side in ('L', 'R'):
        name = 'leg.'+side
        hip = Vector(joints[name][0])
        offset = Vector((strides or {}).get(side, (0, 0, 0)))
        desired = hip+offset
        if follow_body:
            carried = pivot+matrix@((hip-pivot)*scale[0])+Vector(location)
            desired.x,desired.y = carried.x+offset.x,carried.y+offset.y
        local = matrix.transposed()@(desired-pivot-Vector(location))/scale[0]-(hip-pivot)
        out[name] = transform(matrix.transposed().to_euler(), local,
            tuple(1/value for value in scale))

def pose(kind, action, t, joints):
    s, c = math.sin(math.tau*t), math.cos(math.tau*t)
    out = {}
    if action in ('Idle', 'Run'):
        moving = action == 'Run'
        lift = (.015 if moving else .004)*(1-c)
        out['body'] = transform(location=(0, 0, lift))
        if kind == 'warden':
            if moving:
                out['body'] = transform((.26+.035*c, .025*s, .035*s), (0,0,.045+.018*(1-c)))
            out['head'] = transform((-.16+.025*s if moving else .018*s, 0, -.025*s if moving else 0))
            out['arm.L'] = transform((-.17+.04*s,0,-.03)) if moving else transform()
            out['staff'] = transform((-.09,0,0)) if moving else transform()
            out['arm.R'] = transform((-.12+.20*s if moving else .012*s, 0, -.08 if moving else 0))
            for side, sign in (('L', -1), ('R', 1)):
                for label in ('Upper', 'Lower'):
                    lag = math.sin(math.tau*t-(.65 if label=='Lower' else .25))
                    out['ribbon.'+label+'.'+side] = transform((-.34+.12*lag if moving else .04*s,
                        sign*.06*lag if moving else sign*.025*s, sign*(.16+.10*lag) if moving else sign*.07*s))
        else:
            if moving:
                stalker = kind == 'stalker'
                out['body'] = transform((.34+.045*c if stalker else .22+.035*c,
                    .035*s if stalker else .07*s, .055*s if stalker else .04*s),
                    (0,0,.015+.026*(1-math.cos(2*math.tau*t)) if stalker else .008+.014*(1-math.cos(2*math.tau*t))))
                plant_legs(out,joints,{side:step(t+offset,.085 if stalker else .035,.075 if stalker else .030)
                    for side,offset in (('L',0),('R',.5))},follow_body=not stalker)
            if kind == 'stalker':
                out['head'] = transform((-.34,0,-.045*s)) if moving else transform()
                for side,sign in (('L',-1),('R',1)):
                    out['arm.'+side] = transform((-.70+.16*s*sign if moving else .012*s*sign,
                        sign*.08 if moving else 0,sign*.10 if moving else 0))
                if not moving:
                    # A prowling breath: hood scans and blades drift against
                    # the shoulders. Cancel torso motion at the planted feet.
                    breath = (1-c)/2
                    out['body'] = transform((.06*breath, .035*s, 0), (-.015*s, 0, .025*breath))
                    out['head'] = transform((-.04*breath, 0, .16*s))
                    for side,sign in (('L',-1),('R',1)):
                        out['arm.'+side] = transform((.14*math.sin(math.tau*t-.4)*sign,
                            sign*.05*breath, sign*.09*breath))
                    plant_legs(out,joints)
            if kind == 'volatile':
                lag = math.sin(math.tau*t-.6)
                out['flame'] = transform((-.48+.14*lag if moving else .035*s,
                    .09*lag if moving else .025*s,0), scale=(1+.08*lag if moving else 1+.035*s,1,1+.12*lag if moving else 1+.045*s))
    elif action == 'Buff':
        raised = math.sin(math.pi*t/2)
        out['body'] = transform(location=(0,0,.025*raised))
        out['head'] = transform((-.08*raised,0,0))
        out['arm.L'] = transform((-1.1*raised,0,0),(0,0,.11*raised))
        out['staff'] = transform((1.1*raised,0,0))
        out['arm.R'] = transform((-.55*raised,0,-.15*raised))
        for side,sign in (('L',-1),('R',1)):
            for label in ('Upper','Lower'):
                out['ribbon.'+label+'.'+side] = transform((.07*raised,0,sign*.1*raised))
    elif action.startswith(('Windup', 'Active', 'Recovery')):
        ready, strike, follow = attack_drive(kind,action,t)
        if kind == 'warden':
            out['body'] = transform((-.23*ready+.38*strike+.10*follow, 0, -.16*ready+.12*strike), (0,0,.065*ready+.10*strike))
            out['head'] = transform((.18*ready-.25*strike,0,.12*ready-.09*strike))
            out['arm.L'] = transform((-.75*ready+.38*strike+.16*follow,0,-.24*ready+.13*strike))
            out['staff'] = transform((.24*ready-.16*strike,0,0))
            out['arm.R'] = transform((-.70*ready+.65*strike, -.12*ready, -.30*ready+.18*strike))
            for side, sign in (('L', -1), ('R', 1)):
                for label in ('Upper', 'Lower'):
                    out['ribbon.'+label+'.'+side] = transform((.25*ready-.50*strike-.22*follow,
                        sign*.08*strike, sign*(.22*ready+.15*strike+.16*follow)))
        elif kind == 'stalker':
            blink = action.endswith('Blink')
            out['body'] = transform((-.16*ready+.42*strike+.10*follow,0,
                (-.12 if blink else -.48)*ready+(.10 if blink else .38)*strike+(.05 if blink else .28)*follow),
                (0,0,-.018*ready+(.19 if blink else .075)*strike+.035*follow))
            out['head'] = transform((.10*ready-.27*strike-.05*follow,0,
                (.08 if blink else .30)*ready-(.08 if blink else .25)*strike-.12*follow))
            for side, sign in (('L', -1), ('R', 1)):
                if blink:
                    out['arm.'+side] = transform((-.85*ready-.70*strike-.08*follow,
                        sign*(.15*ready+.12*strike),sign*(.40*ready-.32*strike-.15*follow)))
                elif side == 'R':
                    # One blade leads the cross-body cut; the other guards.
                    out['arm.R'] = transform((-1.60*ready-1.00*strike+.30*follow,
                        -.30*ready+.65*strike+.15*follow,.80*ready-.65*strike-.15*follow))
                else:
                    out['arm.L'] = transform((-.60*ready-.70*strike,
                        .12*ready-.15*strike-.05*follow,-.20*ready+.18*strike+.02*follow))
            plant_legs(out,joints,{side:(0,sign*.035*ready, .10*strike if blink else 0)
                for side,sign in (('L',1),('R',-1))})
        else:
            size = 1-.07*ready+.035*strike
            out['body'] = transform((-.28*ready+.43*strike+.07*follow,0,0),
                (0,0,-.015*ready+.02*strike+.008*follow),(size,size,size))
            plant_legs(out,joints,follow_body=True)
            out['flame'] = transform((.20*ready-.72*strike-.20*follow,0,0),
                scale=(1+.12*ready-.08*strike,1,1+.22*ready+.10*strike))
    elif action == 'Hurt':
        recoil = math.sin(math.pi*t)*(1-t)
        out['body'] = transform((-.12*recoil, .045*recoil, 0), (0, 0, .035*recoil))
    elif action == 'Spawn':
        size = .7+.3*math.sin(math.pi*t/2)
        out['body'] = transform(scale=(size, size, size))
    elif action == 'Death':
        # The runtime removes enemies at death and draws its existing burst.
        # Keep an unused completion clip for source/export completeness.
        size = max(.02, 1-max(0, (t-.55)/.45))
        out['body'] = transform((.35*t, 0, .20*t), scale=(size, size, size))
    return out

def build(kind):
    here = ROOT/kind/'production'
    config = json.loads((here/'spirit.json').read_text())
    source = here/config['blend']
    bpy.ops.wm.open_mainfile(filepath=str(source))
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pivot = center({'warden':'Robe', 'stalker':'Thorax', 'volatile':'Cracked rock body'}[kind])
    pivot.x = 0
    joints = {'root':((0,0,0),None), 'body':(pivot,'root')}
    if kind in ('warden','stalker'):
        head = center('Hood' if kind == 'warden' else 'Pointed head')
        head.z -= .10
        joints['head'] = (head,'body')
        for side in ('L','R'):
            joints['arm.'+side] = (upper(('Sleeve.' if kind == 'warden' else 'Upper arm.')+side),'body')
    if kind == 'warden':
        joints['staff'] = (center('Hand.L'),'arm.L')
        for side in ('L','R'):
            for label in ('Upper','Lower'):
                obj = bpy.data.objects['Ribbon.'+label+'.'+side]
                at = min((obj.matrix_world@v.co for v in obj.data.vertices),key=lambda p: abs(p.x))
                joints['ribbon.'+label+'.'+side] = (at,'body')
    else:
        for side in ('L','R'):
            joints['leg.'+side] = (upper(('Thigh.' if kind == 'stalker' else 'Foot.')+side),'body')
        if kind == 'volatile': joints['flame'] = (center('Flame root'),'body')

    def bone_for(obj, v):
        name = obj.name
        if kind in ('warden','stalker'):
            if name.startswith(('Hood', 'Pointed head', 'FaceRecess', 'Eye.', 'EyeSocket.')): return 'head'
        if kind == 'warden':
            if name.startswith('Staff'): return 'staff'
            if name.startswith('Ribbon.'): return 'ribbon.'+name.split('.',1)[1]
            for side in ('L','R'):
                if name in [p+'.'+side for p in ('Sleeve','Hand','Cuff')]: return 'arm.'+side
        elif kind == 'stalker':
            for side in ('L','R'):
                if name in [p+'.'+side for p in ('Upper arm','Arm blade')]: return 'arm.'+side
                if name in [p+'.'+side for p in ('Thigh','Shin','Foot')]: return 'leg.'+side
                if name.startswith('Limb connection.'+side):
                    i = int(name.rsplit('.',1)[1])
                    # Bridge rings follow each armor endpoint, so limbs stay joined in motion.
                    first, second = [('body','body'), ('body','arm.'+side), ('arm.'+side,'arm.'+side),
                        ('body','leg.'+side), ('leg.'+side,'leg.'+side), ('leg.'+side,'leg.'+side)][i]
                    return first if v.index < 5 else second
        else:
            if name.startswith('Flame'): return 'flame'
            for side in ('L','R'):
                if name == 'Foot.'+side: return 'leg.'+side
                if name == 'Foot root.'+side: return 'body' if v.index < 5 else 'leg.'+side
        return 'body'

    original = [obj.matrix_world@v.co for obj in parts for v in obj.data.vertices]
    bindings = {}
    for obj in parts:
        groups = {}
        for v in obj.data.vertices: groups.setdefault(bone_for(obj,v), []).append(v.index)
        bindings[obj.name] = {bone:len(indices) for bone,indices in groups.items()}
        for bone,indices in groups.items(): obj.vertex_groups.new(name=bone).add(indices,1,'REPLACE')
    creature = Creature.__new__(Creature)
    creature.kind, creature.folder = kind, here/'animated'
    creature.folder.mkdir(exist_ok=True)
    creature.parts, creature.joints = parts, joints
    creature.animate(lambda action,t: pose(kind,action,t,joints))
    rig = creature.armature
    extra = [('WindupBlink',1),('ActiveBlink',.4),('RecoveryBlink',.7)] if kind == 'stalker' else [('Buff',.8)] if kind == 'warden' else []
    if extra:
        for name,seconds in extra:
            action = bpy.data.actions.new(name)
            action.name, action.use_fake_user = name, True
            rig.animation_data.action = action
            for frame in range(round(seconds*30)+1):
                transforms = pose(kind,name,frame/round(seconds*30),joints)
                for bone in rig.pose.bones:
                    rotation,location,scale = transforms.get(bone.name,transform())
                    basis = bone.bone.matrix_local.to_3x3()
                    bone.rotation_euler = (basis.transposed()@Euler(rotation).to_matrix()@basis).to_euler()
                    bone.location = basis.transposed()@Vector(location)
                    bone.scale = (scale[0],scale[2],scale[1])
                    for attr in ('rotation_euler','location','scale'): bone.keyframe_insert(data_path=attr,frame=frame+1,group=bone.name)
            creature.clips[name] = {'lastKeySeconds':seconds,'loopSeconds':None}
    rig['clips'] = json.dumps(creature.clips)
    rig.animation_data.action = None
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    mesh = creature.mesh
    mesh.data.calc_loop_triangles()
    assert len(mesh.data.vertices) == len(original)
    tree = KDTree(len(original))
    for i,point in enumerate(original): tree.insert(point,i)
    tree.balance()
    rest_error = max(tree.find(mesh.matrix_world@v.co)[2] for v in mesh.data.vertices)
    assert rest_error < 1e-6, rest_error
    audit = json.loads((here/'audit.json').read_text())
    assert len(mesh.data.loop_triangles) == audit['triangles'] < 2000
    assert len(rig.data.bones) <= 12 and len(mesh.data.materials) == 1
    rig.data.pose_position = 'POSE'
    rig.animation_data.action = bpy.data.actions['Idle']
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(creature.folder/(kind+'.blend')))
    report = {'source':'../'+source.name, 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'triangles':audit['triangles'], 'bones':len(rig.data.bones), 'materials':1, 'mesh_objects':1,
        'part_bindings':bindings, 'clips':creature.clips, 'root_motion':False, 'rest_vertices_preserved':True,
        'rest_vertex_error_m':rest_error}
    (creature.folder/'rig-info.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--')+1:]
    kind = args[0]
    assert kind in ('warden','stalker','volatile')
    command = args[1] if len(args)>1 else 'build-export'
    if command in ('build','build-export'): build(kind)
    if command in ('export','build-export'):
        approved.export(kind)
        module = ROOT.parents[1]/'src/presentation/assets/enemies'/(kind+'.ts')
        module.write_text(module.read_text().replace('production-tools/animate-approved.py','model-tools/animate.py'))
