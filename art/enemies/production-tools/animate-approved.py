"""Rig the approved static sources without rebuilding their geometry.

Usage: Blender --background --python animate-approved.py -- shooter [export|verify|render].
The existing enemy action writer provides rigid skinning and loop conventions.
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from common import Creature, transform

def stage(kind):return ROOT/kind/'production/animated'
def center(name):
    obj=bpy.data.objects[name]
    return sum((obj.matrix_world@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)

def drive(action,t):
    if action.startswith('Windup'):
        return math.sin(min(1,t/.72)*math.pi/2),max(0,(t-.82)/.18)
    if action.startswith('Active'):return 1,1
    return (1-t)**2,(1-t)**2

def pose(kind,action,t):
    s,c=math.sin(math.tau*t),math.cos(math.tau*t)
    result={}
    if action=='Idle':
        result['body']=transform((0,.008*s,0),(0,0,.005*(1-c)))
        if kind=='brute':result['head']=transform((.01*s,0,0))
        if kind=='shooter':result['tail']=transform((0,0,.035*s))
    elif action=='Run':
        result['body']=transform((.025 if kind=='brute' else .065,.012*s,0),(0,0,.014*(1-c)))
        for side,sign in (('L',1),('R',-1)):
            result['leg.'+side]=transform(location=(0,.04*s*sign,.04*max(0,s*sign)))
            if kind=='swarmer':result['back.'+side]=transform(location=(0,-.04*s*sign,.04*max(0,-s*sign)))
            if kind=='brute':result['arm.'+side]=transform((.10*s*sign,0,0))
            if kind=='shooter':result['arm.'+side]=transform((0,.06*s*sign,0))
    elif action.startswith(('Windup','Active','Recovery')):
        ready,strike=drive(action,t)
        if kind=='shooter':
            spray=action.endswith('Spray')
            swell=(.25 if spray else .11)*ready-(.06 if spray else .04)*strike
            result['body']=transform((-.025*ready+.08*strike,0,0),(0,0,.008*ready))
            # The low bell rim expands upward, keeping its bottom above the floor.
            result['jaw']=transform(location=(0,-.02*ready+.012*strike,.045*ready-.010*strike),scale=(1+swell,1,1+swell))
            for side,sign in (('L',-1),('R',1)):
                result['arm.'+side]=transform((0,sign*.18*ready,0))
        elif kind=='brute':
            stomp=action.endswith('Stomp')
            if stomp:
                result['body']=transform((.025*ready+.04*strike,0,-.025*ready),(0,0,.025*ready-.015*strike))
                result['leg.L']=transform(location=(0,0,.11*ready*(1-strike)))
                for side in ('L','R'):result['arm.'+side]=transform((-.40*ready+.28*strike,0,0))
            else:
                result['body']=transform((-.08*ready+.20*strike,0,0),(0,0,.035*ready-.025*strike))
                for side in ('L','R'):result['arm.'+side]=transform((-2.45*ready+2.60*strike,0,0))
            result['head']=transform((.04*ready-.10*strike,0,0))
        else:
            result['body']=transform((-.10*ready+.24*strike,0,0),(0,0,.045*strike),
                (1+.08*ready-.04*strike,1,1-.14*ready+.14*strike))
            result['jaw']=transform((.18*ready-.12*strike,0,0))
    elif action=='Hurt':
        recoil=math.sin(math.pi*t)*(1-t)
        result['body']=transform((-.12*recoil,.04*recoil,0),(0,0,.018*recoil))
    elif action=='Spawn':
        size=.6+.4*math.sin(math.pi*t/2)
        result['body']=transform(location=(0,0,.025*math.sin(math.pi*t)),scale=(size,size,size))
        for bone in ('leg.L','leg.R','back.L','back.R'):result[bone]=transform(scale=(size,size,size))
    elif action=='Death':
        size=max(.02,1-max(0,(t-.55)/.45))
        result['body']=transform((.45*t,0,.25*t),(0,0,-.05*t),(size,size,size))
        for bone in ('leg.L','leg.R','back.L','back.R'):result[bone]=transform(scale=(size,size,size))
    return result

def build(kind):
    here=ROOT/kind/'production';config=json.loads((here/'spirit.json').read_text())
    source=here/config['blend'];bpy.ops.wm.open_mainfile(filepath=str(source))
    parts=[o for o in bpy.context.scene.objects if o.type=='MESH']
    body={'shooter':'ShooterBody','brute':'StoneTorso','swarmer':'RedShell'}[kind]
    pivot=center(body);pivot.x=0
    joints={'root':((0,0,0),None),'body':(pivot,'root')}
    if kind=='brute':joints['head']=(center('BrowStone'),'body')
    else:joints['jaw']=(center('MouthRecess'),'body')
    if kind=='shooter':joints['tail']=(center('TailFin'),'body')
    for side in ('L','R'):
        foot=('FrontLeg.' if kind=='swarmer' else 'Foot.')+side
        joints['leg.'+side]=(center(foot),'root')
        if kind=='swarmer':joints['back.'+side]=(center('BackLeg.'+side),'root')
        else:
            part=('UpperArm.' if kind=='brute' else 'SideFin.')+side
            at=center(part)
            if kind=='brute':at.z=max((bpy.data.objects[part].matrix_world@v.co).z for v in bpy.data.objects[part].data.vertices)
            joints['arm.'+side]=(at,'body')
    assignments={}
    mouth_z=center('MouthRecess').z if kind=='swarmer' else None
    def bone_for(obj,vertex):
        name=obj.name
        if kind=='brute':
            if name in ('BrowStone','PaleBrowCap','RecessedFace') or name.startswith(('Eye.','EyeSocket.')):return 'head'
            for side in ('L','R'):
                if name in [p+'.'+side for p in ('UpperArm','Forearm','Fist')]:return 'arm.'+side
                if name in [p+'.'+side for p in ('Thigh','Foot')]:return 'leg.'+side
        elif kind=='shooter':
            if name in ('BellMouth','MouthRecess'):return 'jaw'
            if name=='TailFin':return 'tail'
            for side in ('L','R'):
                if name=='Foot.'+side:return 'leg.'+side
                if name=='SideFin.'+side:return 'arm.'+side
        else:
            if name.startswith('LowerTooth.'):return 'jaw'
            if name=='JawShell' and (obj.matrix_world@vertex.co).z<mouth_z:return 'jaw'
            for side in ('L','R'):
                if name in ('FrontLeg.'+side,'FrontJoint.'+side):return 'leg.'+side
                if name in ('BackLeg.'+side,'BackJoint.'+side):return 'back.'+side
        return 'body'
    original_points=sorted(tuple(round(n,6) for n in obj.matrix_world@v.co) for obj in parts for v in obj.data.vertices)
    for obj in parts:
        groups={}
        for vertex in obj.data.vertices:groups.setdefault(bone_for(obj,vertex),[]).append(vertex.index)
        assignments[obj.name]={bone:len(indices) for bone,indices in groups.items()}
        for bone,indices in groups.items():obj.vertex_groups.new(name=bone).add(indices,1,'REPLACE')
    creature=Creature.__new__(Creature);creature.kind=kind;creature.folder=stage(kind)
    creature.folder.mkdir(exist_ok=True);creature.parts=parts;creature.joints=joints
    creature.animate(lambda action,t:pose(kind,action,t))
    rig=creature.armature
    # Add attack variants with the established writer's channel conventions.
    suffix={'shooter':'Spray','brute':'Stomp'}.get(kind)
    if suffix:
        for base,seconds in (('Windup',1),('Active',.4),('Recovery',.7)):
            name=base+suffix;action=bpy.data.actions[base].copy();action.name=name;action.use_fake_user=True
            rig.animation_data.action=action
            for frame in range(round(seconds*30)+1):
                transforms=pose(kind,name,frame/round(seconds*30))
                from mathutils import Euler
                for bone in rig.pose.bones:
                    rotation,location,scale=transforms.get(bone.name,transform())
                    basis=bone.bone.matrix_local.to_3x3()
                    bone.rotation_euler=(basis.transposed()@Euler(rotation).to_matrix()@basis).to_euler()
                    bone.location=basis.transposed()@Vector(location);bone.scale=(scale[0],scale[2],scale[1])
                    for attr in ('rotation_euler','location','scale'):bone.keyframe_insert(data_path=attr,frame=frame+1,group=bone.name)
            creature.clips[name]={'lastKeySeconds':seconds,'loopSeconds':None}
    rig['clips']=json.dumps(creature.clips);rig.animation_data.action=None;rig.data.pose_position='REST'
    bpy.context.view_layer.update();mesh=creature.mesh;mesh.data.calc_loop_triangles()
    assert sorted(tuple(round(n,6) for n in mesh.matrix_world@v.co) for v in mesh.data.vertices)==original_points
    audit=json.loads((here/'audit.json').read_text())
    assert len(mesh.data.loop_triangles)==audit['triangles']<2000
    assert len(rig.data.bones)<=12 and len(mesh.data.materials)==1
    rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(creature.folder/(kind+'.blend')))
    report={'source':'../'+source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'triangles':audit['triangles'],'bones':len(rig.data.bones),'materials':1,'mesh_objects':1,
        'part_bindings':assignments,'clips':creature.clips,'root_motion':False,'rest_vertices_preserved':True}
    (creature.folder/'rig-info.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))

def export(kind):
    folder=stage(kind);bpy.ops.wm.open_mainfile(filepath=str(folder/(kind+'.blend')))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
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
        export_frame_range=False,export_optimize_animation_size=False,export_skins=True,
        export_all_influences=False,export_influence_nb=4)
    info={'height':height,'height_basis':'ground origin to highest approved rest-pose vertex',
        'triangles':len(mesh.data.loop_triangles),'bones':len(rig.data.bones),'bytes':path.stat().st_size,'clips':clips}
    (folder/'model-info.json').write_text(json.dumps(info,indent=2)+'\n')
    module=ROOT.parents[1]/'src/presentation/assets/enemies'/(kind+'.ts')
    module.write_text('// Generated by art/enemies/production-tools/animate-approved.py.\n'
        +'import url from "../../../../'+path.relative_to(ROOT.parents[1]).as_posix()+'?url"\n'
        +'import type { ModelSpec } from "../../models.ts"\n\n'
        +'export const '+kind+'Model = { url,'+json.dumps({'height':height,'clips':clips},indent=2)[1:]+' satisfies ModelSpec\n')
    print('EXPORTED',kind,json.dumps(info))

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];kind=args[0]
    assert kind in ('shooter','brute','swarmer')
    command=args[1] if len(args)>1 else 'build'
    if command=='build-export':build(kind);export(kind)
    else:{'build':build,'export':export}[command](kind)
