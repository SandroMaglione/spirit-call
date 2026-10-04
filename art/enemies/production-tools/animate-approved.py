"""Rig the approved static sources without rebuilding their geometry.

Usage: Blender --background --python animate-approved.py -- shooter [build|export|build-export].
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
from common import Creature, keep_off_floor, transform

def stage(kind):return ROOT/kind/'production/animated'
def center(name):
    obj=bpy.data.objects[name]
    return sum((obj.matrix_world@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)

def drive(action,t):
    if action.startswith('Windup'):
        return math.sin(min(1,t/.72)*math.pi/2),max(0,(t-.82)/.18)
    if action.startswith('Active'):return 1,1
    return (1-t)**2,(1-t)**2

# The rest position of each bone, set by build(): poses that grow or shrink
# the whole figure move its parts toward the ground origin with them.
JOINTS={}

def whole(size,squash=1):
    """Every part hanging off the root, scaled about the ground origin (so the figure stays in one piece)."""
    return {name:transform(location=tuple((size-1)*n for n in at[:2])+((size*squash-1)*at[2],),scale=(size,size,size*squash))
            for name,(at,parent) in JOINTS.items() if parent=='root'}

def swollen(result,bone,size,rotation=(0,0,0),location=(0,0,0)):
    """A bone scaled about its joint and lifted so what hangs under it stays off the floor."""
    lift=(size[2]-1)*JOINTS[bone][0][2]
    result[bone]=transform(rotation,(location[0],location[1],location[2]+lift),size)

def pose(kind,action,t):
    # Motion is sized for the game's camera: these bodies are 20-60 px tall
    # on screen, so a loop under a few centimeters or degrees is not seen.
    s,c=math.sin(math.tau*t),math.cos(math.tau*t)
    s2,c2=math.sin(2*math.tau*t),math.cos(2*math.tau*t)
    result={}
    if action=='Idle':
        if kind=='shooter':
            # It breathes like bellows: the body swells, the fins fan, the tail wags.
            breath=.035*(1-c)
            swollen(result,'body',(1+breath,1+breath,1-breath*.6),(0,.03*s,0))
            result['jaw']=transform(scale=(1+.05*(1-c2)/2,1,1+.05*(1-c2)/2))
            result['tail']=transform((0,0,.38*s))
            for side,sign in (('L',1),('R',-1)):result['arm.'+side]=transform((0,sign*.20*(1-c)/2,.10*s))
        elif kind=='brute':
            # A slow heave: shoulders rise, fists hang and sway, the head looks about.
            result['body']=transform((.035*(1-c)/2,.025*s,0),(0,0,.022*(1-c)/2))
            result['head']=transform((.03*(1-c)/2,0,.16*s))
            for side,sign in (('L',1),('R',-1)):result['arm.'+side]=transform((.07*s*sign,sign*.06*(1-c)/2,0))
        else:
            # It never sits still: the shell twitches, the jaw chatters, a leg taps.
            result['body']=transform((.04*(1-c2)/2,0,.10*s),(0,0,.012*(1-c2)/2))
            result['jaw']=transform((.20*(1-c2)/2,0,0))
            result['leg.L']=transform(location=(0,0,.035*max(0,s)))
            result['leg.R']=transform(location=(0,0,.035*max(0,-s)))
    elif action=='Run':
        if kind=='shooter':
            # A waddle: it rocks from foot to foot, fins flapping.
            swollen(result,'body',(1,1,1),(.10,.16*s,.06*s),(0,0,.045*abs(s)))
            result['tail']=transform((0,0,-.45*s))
            for side,sign in (('L',1),('R',-1)):
                result['leg.'+side]=transform(location=(0,.10*s*sign,.09*max(0,c*sign)))
                result['arm.'+side]=transform((0,sign*.30*(1+s2)/2,.22*s*sign))
        elif kind=='brute':
            # It lumbers: the trunk rolls over each planted foot and the fists swing against the legs.
            result['body']=transform((.14,.10*s,.07*s),(0,0,.04*abs(c)))
            result['head']=transform((-.06,-.06*s,-.05*s))
            for side,sign in (('L',1),('R',-1)):
                result['leg.'+side]=transform((-.30*s*sign,0,0),(0,.13*s*sign,.11*max(0,c*sign)))
                result['arm.'+side]=transform((.50*s*sign,0,0))
        else:
            # A scuttle: the legs go twice for each rock of the shell, jaw snapping.
            result['body']=transform((.12,.14*s,.08*s),(0,0,.03*abs(s2)))
            result['jaw']=transform((.22*(1-c2)/2,0,0))
            for side,sign in (('L',1),('R',-1)):
                result['leg.'+side]=transform(location=(0,.07*s2*sign,.06*max(0,c2*sign)))
                result['back.'+side]=transform(location=(0,-.07*s2*sign,.06*max(0,-c2*sign)))
    elif action.startswith(('Windup','Active','Recovery')):
        ready,strike=drive(action,t)
        if kind=='shooter':
            spray=action.endswith('Spray')
            # It draws a breath (the whole body swells and tips back, fins
            # flaring), then spits: the body snaps forward and thin, the bell
            # flaring. The spray's breath is bigger, and shakes as it holds.
            swell=(.34 if spray else .20)*ready-(.10 if spray else .08)*strike
            puff=(.20 if spray else .12)*ready-(.26 if spray else .18)*strike
            shake=(.05 if spray else 0)*ready*(1-strike)*math.sin(t*math.tau*9)
            swollen(result,'body',(1+puff,1-.5*puff,1+puff),(-.28*ready+.50*strike,shake,0),(0,.05*ready-.12*strike,0))
            # The low bell rim expands upward, keeping its bottom above the floor.
            result['jaw']=transform(location=(0,-.03*ready+.02*strike,.05*ready-.012*strike),scale=(1+swell,1,1+swell))
            result['tail']=transform((.35*ready-.5*strike,0,0))
            for side,sign in (('L',-1),('R',1)):
                result['arm.'+side]=transform((0,sign*(.55*ready-.75*strike),0))
        elif kind=='brute':
            stomp=action.endswith('Stomp')
            if stomp:
                # The knee comes up high, the trunk tips away over the other
                # leg, fists flung wide; then everything drops at once.
                result['body']=transform((-.10*ready+.26*strike,-.16*ready*(1-strike),0),(0,0,.05*ready-.11*strike),(1,1,1+.05*ready-.12*strike))
                result['leg.L']=transform((-.55*ready*(1-strike),0,0),(0,-.10*ready*(1-strike),.34*ready*(1-strike)))
                for side,sign in (('L',1),('R',-1)):result['arm.'+side]=transform((-.55*ready+.75*strike,sign*(.60*ready-.60*strike),0))
            else:
                # Both fists go overhead as the trunk rears back and stretches; the slam throws the whole body down after them.
                result['body']=transform((-.26*ready+.62*strike,0,0),(0,.05*ready-.14*strike,.07*ready-.10*strike),(1,1,1+.07*ready-.13*strike))
                for side in ('L','R'):result['arm.'+side]=transform((-2.60*ready+2.45*strike,0,0))
            result['head']=transform((.10*ready-.26*strike,0,0))
        else:
            # It rears up to show the whole mouth, front legs off the ground, jaw wide; then lunges and snaps shut.
            result['body']=transform((-.62*ready+1.0*strike,0,0),(0,.05*ready-.20*strike,.10*ready-.06*strike),
                (1+.10*ready-.06*strike,1-.10*ready+.22*strike,1+.10*ready-.14*strike))
            result['jaw']=transform((.75*ready-.75*strike,0,0))
            for side in ('L','R'):
                result['leg.'+side]=transform(location=(0,.03*ready-.12*strike,.13*ready*(1-strike)))
                result['back.'+side]=transform(location=(0,-.05*strike,0))
    elif action=='Hurt':
        # The code adds its own squash and lean to a hit (view.hit.recoil); the clip throws the parts.
        recoil=math.sin(math.pi*t)*(1-t)*2.6
        if kind=='brute':
            result['body']=transform((-.22*recoil,.06*recoil,0))
            result['head']=transform((-.25*recoil,0,.12*recoil))
            for side,sign in (('L',1),('R',-1)):result['arm.'+side]=transform((-.35*recoil,sign*.25*recoil,0))
        elif kind=='shooter':
            swollen(result,'body',(1+.10*recoil,1+.10*recoil,1-.16*recoil),(-.38*recoil,.10*recoil,0))
            result['jaw']=transform(scale=(1-.15*recoil,1,1-.15*recoil))
            for side,sign in (('L',-1),('R',1)):result['arm.'+side]=transform((0,sign*.5*recoil,0))
        else:
            result['body']=transform((-.50*recoil,.12*recoil,0),(0,.04*recoil,.07*recoil))
            result['jaw']=transform((.45*recoil,0,0))
            for bone in ('leg.L','leg.R','back.L','back.R'):result[bone]=transform(location=(0,0,.05*recoil))
    elif action=='Spawn':
        # It pops up out of the ground in one piece, overshooting its size, tall then settling.
        back=1+2.70158*(t-1)**3+1.70158*(t-1)**2
        result.update(whole(.25+.75*back,1+.30*math.sin(math.pi*t)*(1-t)))
    elif action=='Death':
        size=max(.02,1-max(0,(t-.55)/.45))
        result.update(whole(size))
        rotation,location,scale=result['body']
        result['body']=transform((.45*t,0,.25*t),location,scale)
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
    # Each axis sorted on its own: joining reorders vertices, and comparing
    # rounded tuples breaks on coordinates that sit on a rounding boundary.
    def spread(points):return [sorted(p[axis] for p in points) for axis in range(3)]
    original_points=spread([obj.matrix_world@v.co for obj in parts for v in obj.data.vertices])
    for obj in parts:
        groups={}
        for vertex in obj.data.vertices:groups.setdefault(bone_for(obj,vertex),[]).append(vertex.index)
        assignments[obj.name]={bone:len(indices) for bone,indices in groups.items()}
        for bone,indices in groups.items():obj.vertex_groups.new(name=bone).add(indices,1,'REPLACE')
    creature=Creature.__new__(Creature);creature.kind=kind;creature.folder=stage(kind)
    creature.folder.mkdir(exist_ok=True);creature.parts=parts;creature.joints=joints
    JOINTS.clear();JOINTS.update({name:(tuple(at),parent) for name,(at,parent) in joints.items()})
    # Eye cores carry `_GLOW` 1: the game's enemy shader makes such
    # vertices shine in their own color (one material, no emission map).
    for obj in parts:
        glow=obj.data.attributes.new('_GLOW','FLOAT','POINT')
        for item in glow.data:item.value=1 if obj.name.startswith('Eye.') else 0
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
    keep_off_floor(rig,creature.mesh)
    rig['clips']=json.dumps(creature.clips);rig.animation_data.action=None;rig.data.pose_position='REST'
    bpy.context.view_layer.update();mesh=creature.mesh;mesh.data.calc_loop_triangles()
    joined=spread([mesh.matrix_world@v.co for v in mesh.data.vertices])
    assert all(len(a)==len(b) and max(abs(x-y) for x,y in zip(a,b))<1e-5 for a,b in zip(joined,original_points))
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
        export_all_influences=False,export_influence_nb=4,export_attributes=True)
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
