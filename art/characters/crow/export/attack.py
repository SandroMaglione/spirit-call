"""One in-place side-slash pose study on the existing rig, without a weapon.

Called by export-glb.py after loading the saved locomotion rig. Does not edit
the saved Blender files or define gameplay damage/cancellation rules.
"""
import bpy
from mathutils import Euler

FRAMES = 17
# frame, body yaw, body lean, attacking wing lift, wing yaw, counter-wing opening
POSES = [
    (1, 0.0, 0.0, 0.0, 0.0, 0.0),
    (5, 0.42, -0.06, -0.85, 0.85, 0.18),
    (8, -0.48, 0.18, -1.30, -0.95, 0.35),
    (11, -0.35, 0.13, -0.70, -0.75, 0.22),
    (17, 0.0, 0.0, 0.0, 0.0, 0.0),
]


def add_attack(rig):
    rig.animation_data.action = bpy.data.actions["Idle"]
    bpy.context.scene.frame_set(1)
    rest = {p.name: (p.location.copy(), p.rotation_quaternion.copy(), p.scale.copy()) for p in rig.pose.bones}
    action = bpy.data.actions.new("Attack")
    action.use_fake_user = True
    rig.animation_data.action = action

    def rotate(name, angles):
        p = rig.pose.bones[name]
        basis = rig.data.bones[name].matrix_local.to_quaternion()
        p.rotation_quaternion = rest[name][1] @ basis.inverted() @ Euler(angles).to_quaternion() @ basis

    for frame in range(1, FRAMES + 1):
        for p in rig.pose.bones:
            p.rotation_mode = "QUATERNION"
            p.location, p.rotation_quaternion, p.scale = rest[p.name]
        left, right = next((a, b) for a, b in zip(POSES, POSES[1:]) if a[0] <= frame <= b[0])
        t = (frame - left[0]) / (right[0] - left[0])
        t = t * t * (3 - 2 * t)
        yaw, lean, lift, sweep, opening = [a + (b - a) * t for a, b in zip(left[1:], right[1:])]
        rotate("body", (lean, 0, yaw))
        rotate("head", (-lean * 0.45, 0, -yaw * 0.65))
        rotate("wing.R", (lift, -0.12 * abs(lift), sweep))
        rotate("wing.L", (0.08 * abs(lift), opening, -yaw * 0.3))
        rotate("tail", (-lean * 0.5, 0, -yaw * 0.2))
        # Keep both foot controls planted while the torso turns through the strike.
        for p in rig.pose.bones:
            p.keyframe_insert("location", frame=frame, group=p.name)
            p.keyframe_insert("rotation_quaternion", frame=frame, group=p.name)
            p.keyframe_insert("scale", frame=frame, group=p.name)
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "LINEAR"
    return action
