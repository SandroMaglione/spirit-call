"""Add editable hand targets and elbow poles to the authored motion.

Only the twenty deform bones leave Blender. The GLB exporter samples the
constraints, so moving a control in the saved file survives export.
"""
import math

import bpy
from mathutils import Vector


def make_editable(rig, clips):
    scene = bpy.context.scene
    samples = {}
    # Keep the original solved poses as the starting point for each IK solve.
    # Store targets before enabling constraints to avoid a feedback cycle.
    for name,(count,loop,_) in clips.items():
        rig.animation_data.action = bpy.data.actions[name]
        samples[name] = []
        for frame in range(1,count+2 if loop else count+1):
            scene.frame_set(frame)
            pose = {}
            for label in ['L','R']:
                shoulder = rig.pose.bones[f'wing.{label}'].head.copy()
                elbow = rig.pose.bones[f'forewing.{label}'].head.copy()
                wrist = rig.pose.bones[f'wrist.{label}'].matrix.copy()
                axis = (wrist.translation-shoulder).normalized()
                bend = elbow-shoulder-axis*(elbow-shoulder).dot(axis)
                pole = elbow+bend.normalized()*.45
                pose[label] = (wrist,pole,elbow)
            samples[name].append(pose)
    rig.animation_data.action = None
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for label in ['L','R']:
        for kind in ['hand','elbow']:
            b = rig.data.edit_bones.new(f'ctrl_{kind}.{label}')
            if kind=='hand':
                source = rig.data.edit_bones[f'wrist.{label}']
                b.head,b.tail,b.roll = source.head,source.tail,source.roll
            else:
                b.head = (1 if label=='R' else -1,.35,1.1)
                b.tail = b.head+Vector((0,0,.16))
            b.parent = rig.data.edit_bones['root']
            b.use_deform = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for name,frames in samples.items():
        rig.animation_data.action = bpy.data.actions[name]
        for frame,pose in enumerate(frames,1):
            scene.frame_set(frame)
            for label,(wrist,pole,_) in pose.items():
                hand = rig.pose.bones[f'ctrl_hand.{label}']
                hand.rotation_mode = 'QUATERNION'
                hand.matrix = wrist
                elbow = rig.pose.bones[f'ctrl_elbow.{label}']
                m = elbow.bone.matrix_local.copy()
                m.translation = pole
                elbow.matrix = m
                for p in [hand,elbow]:
                    p.keyframe_insert('location',frame=frame,group=p.name)
                    if p==hand:
                        p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)

    rig.animation_data.action = bpy.data.actions['Idle']
    scene.frame_set(1)
    for label in ['L','R']:
        ik = rig.pose.bones[f'forewing.{label}'].constraints.new('IK')
        ik.name = 'Hand target and feather elbow'
        ik.target,ik.subtarget = rig,f'ctrl_hand.{label}'
        ik.pole_target,ik.pole_subtarget = rig,f'ctrl_elbow.{label}'
        ik.chain_count,ik.use_stretch = 2,False
        wanted = samples['Idle'][0][label][2]
        def error(angle):
            ik.pole_angle = angle
            bpy.context.view_layer.update()
            return (rig.pose.bones[f'forewing.{label}'].head-wanted).length_squared
        angle = min([math.tau*i/64-math.pi for i in range(64)],key=error)
        step = math.tau/64
        for _ in range(16):
            angle = min([angle-step,angle,angle+step],key=error)
            step *= .5
        ik.pole_angle = angle
        constraint = rig.pose.bones[f'wrist.{label}'].constraints.new('COPY_TRANSFORMS')
        constraint.name = 'Palm and blade orientation'
        constraint.target,constraint.subtarget = rig,f'ctrl_hand.{label}'
        constraint.owner_space = constraint.target_space = 'POSE'

    controls = rig.data.collections.new('Pose controls')
    deform = rig.data.collections.new('Deformation bones')
    for b in rig.data.bones:
        for col in list(b.collections):
            col.unassign(b)
        editable = b.name.startswith('ctrl_') or b.name in ['root','pelvis','body','head','tail','foot.L','foot.R']
        (controls if editable else deform).assign(b)
        b.color.palette = 'THEME04' if b.name.startswith('ctrl_hand') else 'THEME03' if b.name.startswith('ctrl_elbow') else 'THEME02'
    deform.is_visible = False
    rig.show_in_front = True
    rig['instructions'] = ('Action Editor: Idle, Run, AttackCombo, Power, Dash and recovery actions. '
                           'Move ctrl_hand.L/R; rotate it to turn the palm and blade. '
                           'Move ctrl_elbow.L/R to direct the bend. Feet, pelvis, body, head and tail are pose controls. '
                           'Save then run export.py to preserve edits. build.py regenerates this file.')
    # Targets interpolate without Bezier overshoot between baked samples.
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
    scene.frame_set(1)
