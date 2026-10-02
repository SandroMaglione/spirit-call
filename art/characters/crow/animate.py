"""Rig the saved study and author two looping actions without changing crow.blend.

blender --background --python-exit-code 1 --python art/characters/crow/animate.py
"""
import math
from pathlib import Path

import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT / "crow.blend"))
scene = bpy.context.scene
collection = bpy.data.collections["CROW | editable character"]
root = bpy.data.objects["Crow | model root"]
meshes = [o for o in collection.objects if o.type == "MESH"]
# Eye objects carry scale and rotation; bake those into vertices before skinning.
bpy.ops.object.select_all(action="DESELECT")
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.select_all(action="DESELECT")

rig = bpy.data.objects.new("Crow rig | idle + run", bpy.data.armatures.new("Crow skeleton"))
collection.objects.link(rig)
rig.parent = root
rig.show_in_front = True
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")


def bone(name, head, tail, parent=None):
    result = rig.data.edit_bones.new(name)
    result.head, result.tail = head, tail
    if parent:
        result.parent = rig.data.edit_bones[parent]
    return result


bone("root", (0, 0, 0), (0, 0, 0.25))
bone("body", (0, 0, 0.48), (0, 0, 1.28), "root")
bone("head", (0, 0, 1.30), (0, 0, 2.20), "body")
bone("tail", (0, 0.27, 0.65), (0, 0.46, 0.35), "body")
for side, label in [(-1, "L"), (1, "R")]:
    x = side * 0.225
    bone(f"wing.{label}", (side * 0.29, -0.03, 1.42), (side * 0.65, -0.03, 0.43), "body")
    bone(f"thigh.{label}", (x, 0.045, 0.48), (x, 0.08, 0.25), "body")
    bone(f"shin.{label}", (x, 0.08, 0.25), (x, 0.035, 0.075), f"thigh.{label}")
    bone(f"foot.{label}", (x, 0.035, 0.075), (x, -0.20, 0.075), "root")
bpy.ops.object.mode_set(mode="OBJECT")

for label in ("L", "R"):
    ik = rig.pose.bones[f"shin.{label}"].constraints.new("IK")
    ik.name = "Keep the ankle on its foot control"
    ik.target, ik.subtarget, ik.chain_count = rig, f"foot.{label}", 2
    ik.use_stretch = True

for obj in meshes:
    groups = {b.name: obj.vertex_groups.new(name=b.name) for b in rig.data.bones}
    for vertex in obj.data.vertices:
        name = obj.name
        if name.startswith("Body"):
            # Blend the continuous neck so the head nod does not create a seam.
            head = max(0, min(1, (vertex.co.z - 1.15) / 0.50))
            weights = {"body": 1 - head, "head": head}
        elif name.startswith("Wing"):
            weights = {f"wing.{name.split()[1]}": 1}
        elif name.startswith("Leg"):
            label = name.split()[1]
            thigh = max(0, min(1, (vertex.co.z - 0.20) / 0.10))
            weights = {f"thigh.{label}": thigh, f"shin.{label}": 1 - thigh}
        elif name.startswith("Foot"):
            weights = {f"foot.{name.split()[1]}": 1}
        elif name.startswith("Tail"):
            weights = {"tail": 1}
        else:
            weights = {"head": 1}
        for name, weight in weights.items():
            if weight > 0:
                groups[name].add([vertex.index], weight, "REPLACE")
    modifier = obj.modifiers.new("Crow skin", "ARMATURE")
    modifier.object = rig


def pose(name, translation=(0, 0, 0), angles=(0, 0, 0), scale=(1, 1, 1)):
    p = rig.pose.bones[name]
    basis = rig.data.bones[name].matrix_local.to_3x3()
    p.location = basis.inverted() @ Vector(translation)
    p.rotation_mode = "QUATERNION"
    p.rotation_quaternion = basis.to_quaternion().inverted() @ Euler(angles).to_quaternion() @ basis.to_quaternion()
    p.scale = scale


def keyframe(frame):
    for p in rig.pose.bones:
        p.keyframe_insert("location", frame=frame, group=p.name)
        p.keyframe_insert("rotation_quaternion", frame=frame, group=p.name)
        p.keyframe_insert("scale", frame=frame, group=p.name)


rig.animation_data_create()
for clip, frames in [("Idle", 48), ("Run", 12)]:
    action = bpy.data.actions.new(clip)
    action.use_fake_user = True
    action["loop_frames"] = frames
    rig.animation_data.action = action
    for frame in range(frames + 1):
        phase = frame / frames * math.tau
        for name in rig.pose.bones.keys():
            pose(name)
        if clip == "Idle":
            breath = math.sin(phase)
            # Exaggerate breathing and the wing silhouette: the phone shows
            # only about twenty pixels of character height.
            pose("body", (0.018 * math.sin(phase), 0, 0.055 * breath),
                 angles=(0.025 * breath, 0.018 * math.sin(phase), 0),
                 scale=(1 + 0.035 * breath, 1 + 0.035 * breath, 1))
            pose("head", angles=(0.075 * math.sin(phase - 0.5), 0, 0.07 * math.sin(phase)))
            for side, label in [(-1, "L"), (1, "R")]:
                pose(f"wing.{label}", angles=(0.035 * breath, -side * (0.055 + 0.08 * breath), 0))
            pose("tail", angles=(0.055 * math.sin(phase - 0.8), 0, 0))
        else:
            # A short stance and a high, fast recovery leave two airborne
            # intervals per cycle. Lean from the hips; counter-rotate the
            # head so the beak still leads rather than pointing at the floor.
            bounce = math.cos(2 * phase + 0.8)
            pose("body", (0.025 * math.sin(phase), -0.07, 0.015 + 0.060 * bounce),
                 angles=(0.54 + 0.045 * bounce, 0.040 * math.sin(phase), 0.045 * math.sin(phase)))
            pose("head", angles=(-0.20 + 0.045 * math.cos(2 * phase - 0.3), 0, -0.025 * math.sin(phase)))
            pose("tail", angles=(-0.15 + 0.12 * math.cos(2 * phase - 0.6), 0, 0.065 * math.sin(phase)))
            for side, label in [(-1, "L"), (1, "R")]:
                cycle = (frame / frames + (0 if side < 0 else 0.5)) % 1
                if cycle < 0.36:
                    forward = -0.34 + 0.68 * cycle / 0.36
                    lift = 0
                else:
                    swing = (cycle - 0.36) / 0.64
                    ease = swing * swing * (3 - 2 * swing)
                    forward = 0.34 - 0.68 * ease
                    lift = 0.27 * math.sin(math.pi * swing) ** 2
                pose(f"foot.{label}", (0, forward, lift))
                pose(f"wing.{label}", angles=(0.30 + side * 0.18 * math.sin(phase), -side * 0.13, side * 0.07 * math.cos(phase)))
        keyframe(frame + 1)
    # Dense authored keys interpolate linearly, avoiding foot overshoot below ground.
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "LINEAR"

scene.render.fps = 24
rig.animation_data.action = bpy.data.actions["Run"]
scene.frame_start, scene.frame_end = 1, 12
scene.frame_set(1)
root["scope"] = "Character study with Idle and Run actions. No weapon. Root motion supplied by game."
rig["instructions"] = "Action Editor: select Idle (1-48) or Run (1-12). Final duplicate key closes each loop."
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "crow-animated.blend"))
print("CROW_ANIMATION", len(rig.data.bones), "bones; Idle 48 frames, Run 12 frames at 24 fps")
