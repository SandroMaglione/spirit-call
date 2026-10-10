"""Windwall's object clips, built on the shared spirit combat poses."""
import math
import sys
from pathlib import Path
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'tools'))
import moves

FPS=30
MOTION='Windwall.Motion'
STYLE={'lunge':.035,'back':.018,'twist':.18,'roll':.09,
       'hop':.012,'spin':False,'cast':-.08}
PARTS=('Cape.Upper.L','Cape.Upper.R','Cape.Lower.L','Cape.Lower.R',
       'Crest.Tall','Crest.Side','Gem')

def wave(t,phase=0,cycles=1):
    return math.sin(math.tau*t*cycles+phase)

def loop_pose(t,base,running):
    bob=.008*(1-wave(t)) if not running else .017*(1-wave(t))/2
    shut=0 if running else max(0,1-abs(t-.68)*60/3)
    poses={MOTION:{'location':(0,0,bob),
            'rotation_euler':(.10+.015*wave(t) if running else .018*wave(t),
                              .012*wave(t,.8),0),
            'scale':(1,1,1)},
           'Eye.L':{'scale':(1,1,1-.92*shut)},
           'Eye.R':{'scale':(1,1,1-.92*shut)}}
    for i,name in enumerate(PARTS):
        side=-1 if name.endswith('.L') else 1
        if name.startswith('Cape.'):
            lower='Lower' in name
            phase=(.7 if lower else 0)+(math.pi if side<0 else 0)
            poses[name]={'rotation_euler':(
                (.11 if running else .018)+.025*wave(t,phase),
                -side*(.035 if running else .022)*wave(t,phase+.5),0)}
        elif name.startswith('Crest.'):
            poses[name]={'rotation_euler':(-.10 if running else 0,
                .035*wave(t,i*.6,2),.025*wave(t,i*.6))}
        else:
            x,y,z=base[name]['location']
            poses[name]={'location':(x,y-.002*wave(t,.8),z+.004*wave(t,-.6)),
                         'rotation_euler':(0,.035*wave(t,.4),.18*wave(t,.7))}
    return poses

def combat_pose(clip,keys,frame,base):
    pose=moves.at(keys,frame)
    poses={name:moves.values(pose,name,base,MOTION,('Eye.L','Eye.R'),())
           for name in (MOTION,'Eye.L','Eye.R')}
    # The broad cape opens around its attachment points, without pulling
    # its roots away from the hood. Lower leaves lag the upper blades.
    lag=moves.at(keys,max(0,frame-1)) if frame<keys[-1][0] else moves.REST
    for name in PARTS:
        side=-1 if name.endswith('.L') else 1
        if name.startswith('Cape.'):
            p=lag if 'Lower' in name else pose
            poses[name]={'rotation_euler':(.11*p['trail']-.04*p['spread'],
                -side*.065*p['spread'],side*.025*p['trail'])}
        elif name.startswith('Crest.'):
            poses[name]={'rotation_euler':(-.20*pose['trail'],
                .04*pose['spread']*(1 if name.endswith('Tall') else -1),0)}
        else:
            x,y,z=base[name]['location']
            poses[name]={'location':(x,y-.003*pose['spread'],z+.007*pose['spread']),
                         'rotation_euler':(0,0,.12*pose['spread'])}
    return poses

def add_clips():
    root=bpy.data.objects['Windwall']
    motion=bpy.data.objects.new(MOTION,None)
    bpy.context.collection.objects.link(motion);motion.parent=root
    for obj in list(root.children):
        if obj!=motion:obj.parent=motion
    # Blinking stays on the hood even when the whole spirit leans.
    bpy.context.view_layer.update()
    for name in ('Eye.L','Eye.R','Crest.Tall','Crest.Side'):
        obj=bpy.data.objects[name];world=obj.matrix_world.copy()
        obj.parent=bpy.data.objects['Hood'];obj.matrix_world=world
    bpy.context.view_layer.update()
    objects={name:bpy.data.objects[name] for name in (MOTION,'Eye.L','Eye.R',*PARTS)}
    base={name:{prop:tuple(getattr(obj,prop)) for prop in ('location','rotation_euler','scale')}
          for name,obj in objects.items()}
    combat=moves.clips(STYLE);timing={};envelopes={}
    for clip in ('Idle','Run',*combat):
        frames=60 if clip=='Idle' else 16 if clip=='Run' else combat[clip][-1][0]+1
        actions={}
        for name,obj in objects.items():
            obj.animation_data_create()
            action=bpy.data.actions.new(f'{clip}.{name}')
            obj.animation_data.action=action;actions[name]=action
        low_z=math.inf;gap=math.inf
        for frame in range(frames):
            poses=loop_pose(frame/frames,base,clip=='Run') if clip in ('Idle','Run') else combat_pose(clip,combat[clip],frame,base)
            for name,obj in objects.items():
                for prop,value in (base[name]|poses[name]).items():setattr(obj,prop,value)
            bpy.context.view_layer.update()
            meshes=[o for o in bpy.data.objects if o.type=='MESH']
            minimum=min((o.matrix_world@v.co).z for o in meshes for v in o.data.vertices)
            # Presentation tilts and squash must never dip through the floor.
            motion.location.z+=max(0,.02-minimum)
            bpy.context.view_layer.update()
            minimum=min((o.matrix_world@v.co).z for o in meshes for v in o.data.vertices)
            low_z=min(low_z,minimum)
            inverse=motion.matrix_world.inverted()
            body=bpy.data.objects['Body'];gem=bpy.data.objects['Gem']
            clear=min((inverse@body.matrix_world@v.co).y for v in body.data.vertices)-max((inverse@gem.matrix_world@v.co).y for v in gem.data.vertices)
            gap=min(gap,clear)
            assert clear>.009, f'{clip}/{frame}: crystal touches chest'
            for name,obj in objects.items():
                for prop in ('location','rotation_euler','scale'):obj.keyframe_insert(prop,frame=frame)
        for name,obj in objects.items():
            action=actions[name]
            for fcurve in action.fcurves:
                for key in fcurve.keyframe_points:key.interpolation='LINEAR'
            track=obj.animation_data.nla_tracks.new();track.name=clip
            track.strips.new(clip,0,action);track.mute=True
            obj.animation_data.action=None
            for prop,value in base[name].items():setattr(obj,prop,value)
        timing[clip]={'lastKeySeconds':(frames-1)/FPS,
                      'loopSeconds':frames/FPS if clip in ('Idle','Run') else None}
        if clip in moves.CONTACT:timing[clip]['contactSeconds']=moves.CONTACT[clip]/FPS
        envelopes[clip]={'min_height_m':low_z,'min_crystal_gap_m':gap}
    bpy.context.scene.render.fps=FPS
    bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    return timing,envelopes
