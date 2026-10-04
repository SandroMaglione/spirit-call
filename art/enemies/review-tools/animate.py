"""Animate the approved Gale Caster and Juggernaut sources without rebuilding them.

Blender --background --python animate.py -- gale-caster [build-export|export]
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector
from mathutils.kdtree import KDTree

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from common import Creature, transform


def center(name):
    obj=bpy.data.objects[name]
    return sum((obj.matrix_world@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)


def pose(kind,action,t):
    s,c=math.sin(math.tau*t),math.cos(math.tau*t)
    data={}
    if action in ('Idle','Run'):
        moving=action=='Run'
        if kind=='gale-caster':
            data['body']=transform((.07 if moving else 0,.008*s,0),(0,0,.018*(1-c)))
            data['head']=transform((-.03 if moving else 0,0,.012*s))
            data['arm.L']=transform((.025*s,0,0))
            data['arm.R']=transform((-.035*s,0,0))
            for level in ('Upper','Lower'):
                for side,sign in (('L',-1),('R',1)):
                    data[f'scarf{level}.{side}']=transform((.035*s,sign*.035*s,sign*.055*s))
        else:
            data['body']=transform((.025 if moving else 0,.009*s,0),(0,0,.006*(1-c)))
            if moving:
                for side,sign in (('L',1),('R',-1)):
                    data['leg.'+side]=transform(location=(0,.045*s*sign,.028*max(0,s*sign)))
                    data['arm.'+side]=transform((.10*s*sign,0,0))
    elif action.startswith(('Windup','Active','Recovery')):
        if action.startswith('Windup'):
            ready=math.sin(min(1,t/.72)*math.pi/2);strike=max(0,(t-.82)/.18)
        elif action.startswith('Active'):ready=strike=1
        else:ready=strike=(1-t)**2
        if kind=='gale-caster':
            data['body']=transform((-.035*ready+.12*strike,0,-.06*ready+.10*strike),(0,0,.045*ready))
            # The hand, sleeve and complete staff share a bone, preserving
            # the approved grip throughout the cast.
            data['arm.L']=transform((-.25*ready+1.05*strike,0,.12*ready-.16*strike))
            data['arm.R']=transform((.12*strike,0,-.35*ready+.15*strike))
            data['head']=transform((.035*ready-.09*strike,0,0))
            for level in ('Upper','Lower'):
                for side,sign in (('L',-1),('R',1)):
                    data[f'scarf{level}.{side}']=transform((.05*ready,sign*.08*strike,sign*.12*ready))
        elif action.endswith('Quake'):
            data['body']=transform((-.045*ready+.12*strike,0,0),(0,0,.045*ready))
            data['head']=transform((.04*ready-.08*strike,0,0))
            for side in ('L','R'):
                data['arm.'+side]=transform((-2.15*ready+2.30*strike,0,0))
        else:
            data['body']=transform((.025*strike,0,-.18*ready+.34*strike),(0,0,.015*ready))
            data['head']=transform((0,0,.08*ready-.15*strike))
            data['arm.R']=transform((-.10*ready,0,-.75*ready+1.45*strike))
            data['arm.L']=transform((-.08*ready,0,.12*ready-.18*strike))
    elif action=='Hurt':
        recoil=math.sin(math.pi*t)*(1-t)
        data['body']=transform((-.10*recoil,.035*recoil,0),(0,0,.02*recoil))
    elif action=='Spawn':
        size=.6+.4*math.sin(math.pi*t/2)
        data['body']=transform(location=(0,0,.025*math.sin(math.pi*t)),scale=(size,size,size))
        if kind=='juggernaut':
            for side in ('L','R'):data['leg.'+side]=transform(scale=(size,size,size))
    elif action=='Death':
        size=max(.02,1-max(0,(t-.55)/.45))
        data['body']=transform((.4*t,0,.2*t),(0,0,.02*t),scale=(size,size,size))
        if kind=='juggernaut':
            for side in ('L','R'):data['leg.'+side]=transform(scale=(size,size,size))
    return data


def build(kind):
    here=ROOT/kind/'production';folder=here/'animated';folder.mkdir(exist_ok=True)
    source=here/json.loads((here/'spirit.json').read_text())['blend']
    bpy.ops.wm.open_mainfile(filepath=str(source))
    parts=[o for o in bpy.context.scene.objects if o.type=='MESH']
    pivot=center('SplitRobe' if kind=='gale-caster' else 'StoneTorso');pivot.x=0
    joints={'root':((0,0,0),None),'body':(pivot,'root'),
            'head':(center('PointedHood' if kind=='gale-caster' else 'Helmet'),'body')}
    for side in ('L','R'):
        obj=bpy.data.objects[('Sleeve.' if kind=='gale-caster' else 'UpperArm.')+side]
        at=center(obj.name);at.z=max((obj.matrix_world@v.co).z for v in obj.data.vertices)
        joints['arm.'+side]=(at,'body')
        if kind=='juggernaut':joints['leg.'+side]=(center('Thigh.'+side),'root')
        else:
            for level in ('Upper','Lower'):
                scarf=bpy.data.objects[f'Scarf{level}.{side}']
                root=min((scarf.matrix_world@v.co for v in scarf.data.vertices),key=lambda p:abs(p.x))
                joints[f'scarf{level}.{side}']=(root,'body')

    def bone_for(name):
        if name.startswith(('PointedHood','Helmet','FaceVoid','FaceRecess','HoodLip','ShadowCheek','Eye','Brow','ForeheadCrest','NoseGuard')):return 'head'
        for side in ('L','R'):
            if kind=='gale-caster':
                if name in ('Sleeve.'+side,'Hand.'+side,'Forearm.'+side,'Cuff.'+side):return 'arm.'+side
                if side=='L' and name.startswith('Staff'):return 'arm.L'
                for level in ('Upper','Lower'):
                    if name==f'Scarf{level}.{side}':return f'scarf{level}.{side}'
            else:
                if name in [p+'.'+side for p in ('UpperArm','Gauntlet','Fist')] or name.startswith('Knuckle.'+side):return 'arm.'+side
                if name in [p+'.'+side for p in ('Thigh','Ankle','Foot','HipJoint')]:return 'leg.'+side
        return 'body'

    original=[o.matrix_world@v.co for o in parts for v in o.data.vertices]
    original_colors=sorted(tuple(value.color) for o in parts for value in o.data.color_attributes['Color'].data)
    bindings={}
    for obj in parts:
        bone=bone_for(obj.name);bindings[obj.name]=bone
        obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))),1,'REPLACE')
    creature=Creature.__new__(Creature);creature.kind=kind;creature.folder=folder
    creature.parts=parts;creature.joints=joints
    creature.animate(lambda action,t:pose(kind,action,t))
    rig=creature.armature
    if kind=='juggernaut':
        for base,seconds in (('Windup',1),('Active',.4),('Recovery',.7)):
            name=base+'Quake';action=bpy.data.actions[base].copy();action.name=name;action.use_fake_user=True
            rig.animation_data.action=action
            for frame in range(round(seconds*30)+1):
                transforms=pose(kind,name,frame/(seconds*30))
                for bone in rig.pose.bones:
                    rotation,location,scale=transforms.get(bone.name,transform())
                    basis=bone.bone.matrix_local.to_3x3()
                    bone.rotation_euler=(basis.transposed()@Euler(rotation).to_matrix()@basis).to_euler()
                    bone.location=basis.transposed()@Vector(location);bone.scale=(scale[0],scale[2],scale[1])
                    for attr in ('rotation_euler','location','scale'):bone.keyframe_insert(data_path=attr,frame=frame+1,group=bone.name)
            creature.clips[name]={'lastKeySeconds':seconds,'loopSeconds':None}
    rig['clips']=json.dumps(creature.clips);rig.animation_data.action=None;rig.data.pose_position='REST'
    bpy.context.view_layer.update();mesh=creature.mesh;mesh.data.calc_loop_triangles()
    assert len(mesh.data.vertices)==len(original)
    tree=KDTree(len(original))
    for i,p in enumerate(original):tree.insert(p,i)
    tree.balance()
    # Joining rounds world coordinates into float32 mesh coordinates.
    # Check actual distances rather than decimal rounding boundaries.
    rest_error=max(tree.find(mesh.matrix_world@v.co)[2] for v in mesh.data.vertices)
    assert rest_error<.000001,rest_error
    assert sorted(tuple(value.color) for value in mesh.data.color_attributes['Color'].data)==original_colors
    audit=json.loads((here/'audit.json').read_text())
    assert len(mesh.data.loop_triangles)==audit['triangles']<2000
    assert len(rig.data.bones)<=12 and len(mesh.data.materials)==1
    rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/(kind+'.blend')))
    report={'source':'../'+source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'part_bindings':bindings,'bones':len(joints),'root_motion':False,'rest_vertices_preserved':True,
        'maximum_join_position_error_m':rest_error,'facet_colors_preserved':True}
    (folder/'rig-info.json').write_text(json.dumps(report,indent=2)+'\n')


def export(kind):
    folder=ROOT/kind/'production/animated'
    bpy.ops.wm.open_mainfile(filepath=str(folder/(kind+'.blend')))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.data.objects if o.type=='MESH')
    clips=json.loads(rig['clips']);rig.animation_data.action=None;rig.data.pose_position='REST';bpy.context.view_layer.update()
    points=[mesh.matrix_world@v.co for v in mesh.data.vertices];mesh.data.calc_loop_triangles()
    assert abs(min(v.z for v in points))<1e-5
    assert len(mesh.data.loop_triangles)<2000 and len(mesh.data.materials)==1 and len(rig.data.bones)<=12
    assert all(len(v.groups)==1 and abs(v.groups[0].weight-1)<1e-6 for v in mesh.data.vertices)
    height=max(v.z for v in points);rig.data.pose_position='POSE'
    for name,spec in clips.items():
        action=bpy.data.actions[name];last=round(spec['lastKeySeconds']*30)+1
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in list(curve.keyframe_points):
                            if key.co.x>last:curve.keyframe_points.remove(key)
        action.use_frame_range=True;action.frame_start=1;action.frame_end=last
    rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=rig
    path=folder/(kind+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
        export_cameras=False,export_lights=False,export_extras=False,export_animations=True,
        export_animation_mode='ACTIONS',export_force_sampling=True,export_anim_slide_to_zero=True,
        export_frame_range=False,export_optimize_animation_size=False,export_skins=True,export_all_influences=False,export_influence_nb=4)
    info={'height':height,'height_basis':'ground origin to highest approved rest-pose vertex',
        'triangles':len(mesh.data.loop_triangles),'bones':len(rig.data.bones),'bytes':path.stat().st_size,'clips':clips}
    (folder/'model-info.json').write_text(json.dumps(info,indent=2)+'\n')
    content_id='galeCaster' if kind=='gale-caster' else kind
    module=ROOT.parents[1]/'src/presentation/assets/enemies'/(kind+'.ts')
    module.write_text('// Generated by art/enemies/review-tools/animate.py.\n'
        +'import url from "../../../../'+path.relative_to(ROOT.parents[1]).as_posix()+'?url"\n'
        +'import type { ModelSpec } from "../../models.ts"\n\n'
        +'export const '+content_id+'Model = { url,'+json.dumps({'height':height,'clips':clips},indent=2)[1:]+' satisfies ModelSpec\n')
    print('EXPORTED',kind,json.dumps(info))


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];kind=args[0]
    assert kind in ('gale-caster','juggernaut')
    if len(args)==1 or args[1]=='build-export':build(kind);export(kind)
    else:export(kind)
