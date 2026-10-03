"""Abigail's skeleton, and her actions baked from motion.py.

Limbs are solved analytically (two-bone chains toward a target, the elbow
or knee toward a pole), so every frame is a plain bone pose: no
constraints reach the export. Hair, cape, and tail bones follow the body
with a little drag and lag (a spring per bone), so they swing after a cut
and stream behind a run.
"""
import math

import bpy
from mathutils import Matrix, Vector

import figure
from figure import ANKLE, ELBOW, FIST, HIP, KNEE, SHOULDER, WRIST, headward
from motion import GUARD, TRAVEL, clips

TOE = {s: Vector((ANKLE[s].x, -0.035, 0.035)) for s in "LR"}
TOE_TIP = {s: Vector((ANKLE[s].x, -0.118, 0.030)) for s in "LR"}
SECONDARY = {  # bone: (stiffness, drag, gravity)
    "hair.back": (0.55, 0.020, 0.15), "hair.side.L": (0.50, 0.025, 0.10), "hair.side.R": (0.45, 0.025, 0.25),
    "cape.back": (0.40, 0.030, 0.55), "cape.L": (0.40, 0.030, 0.55), "cape.R": (0.40, 0.030, 0.55),
    "tail": (0.35, 0.030, 0.65),
}


def knuckles(side):
    return (WRIST[side] - ELBOW[side]).normalized()


def handle_axis(side):
    """The fist's grip axis at rest: across the fist, square to her forearm."""
    return knuckles(side).cross(Vector((0, -1, 0))).normalized() * (1 if side == "L" else -1)


BONES = [  # name, head, tail, parent, z axis hint (None: Blender's default roll)
    ("root", (0, 0, 0), (0, 0.15, 0), None, None),
    ("pelvis", (0, 0, 0.98), (0, 0, 1.08), "root", (0, -1, 0)),
    ("spine", (0, 0, 1.08), (0, 0, 1.20), "pelvis", (0, -1, 0)),
    ("chest", (0, 0, 1.20), (0, 0.005, 1.33), "spine", (0, -1, 0)),
    ("neck", (0, 0.010, 1.33), tuple(figure.NECK), "chest", (0, -1, 0)),
    ("head", tuple(figure.NECK), tuple(headward((0, 0.012, 1.58))), "neck", (0, -1, 0)),
    ("hair.back", tuple(headward((0, 0.07, 1.47))), tuple(headward((0, 0.09, 1.31))), "head", None),
    ("hair.side.L", tuple(headward((0.08, 0.0, 1.48))), tuple(headward((0.15, 0.02, 1.36))), "head", None),
    ("hair.side.R", tuple(headward((-0.075, -0.04, 1.48))), tuple(headward((-0.09, -0.05, 1.26))), "head", None),
    ("cape.back", (0, 0.09, 1.30), (0, 0.15, 0.96), "chest", None),
    ("cape.L", (0.10, 0.09, 1.30), (0.22, 0.11, 0.90), "chest", None),
    ("cape.R", (-0.10, 0.09, 1.30), (-0.22, 0.11, 0.90), "chest", None),
    ("tail", (0.10, -0.01, 1.08), (0.15, 0.0, 0.50), "pelvis", None),
]
for s in "LR":
    BONES += [
        (f"thigh.{s}", tuple(HIP[s]), tuple(KNEE[s]), "pelvis", (0, -1, 0)),
        (f"shin.{s}", tuple(KNEE[s]), tuple(ANKLE[s]), f"thigh.{s}", (0, -1, 0)),
        (f"foot.{s}", tuple(ANKLE[s]), tuple(TOE[s]), f"shin.{s}", (0, 0, 1)),
        (f"toe.{s}", tuple(TOE[s]), tuple(TOE_TIP[s]), f"foot.{s}", (0, 0, 1)),
        (f"upper_arm.{s}", tuple(SHOULDER[s]), tuple(ELBOW[s]), "chest", (0, -1, 0)),
        (f"forearm.{s}", tuple(ELBOW[s]), tuple(WRIST[s]), f"upper_arm.{s}", (0, -1, 0)),
        (f"hand.{s}", tuple(WRIST[s]), tuple(WRIST[s] + knuckles(s) * 0.08), f"forearm.{s}", "hand"),
    ]
BONES.append(("weapon_grip", None, None, "hand.R", "grip"))


def make_armature(collection):
    data = bpy.data.armatures.new("Abigail rig")
    rig = bpy.data.objects.new("Abigail rig", data)
    collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent, roll in BONES:
        bone = data.edit_bones.new(name)
        if name == "weapon_grip":
            center = WRIST["R"] + knuckles("R") * FIST
            bone.head, bone.tail = center, center + handle_axis("R") * 0.15
            # Its x is the fist's knuckles: the blade's edge leads with them.
            bone.align_roll(knuckles("R").cross(handle_axis("R")))
        else:
            bone.head, bone.tail = head, tail
            if roll == "hand":
                side = name[-1]
                bone.align_roll(handle_axis(side).cross(knuckles(side)))
            elif roll is not None:
                bone.align_roll(Vector(roll))
        if parent is not None:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


class Poser:
    """Poses the rig from a motion.py pose, in armature space."""

    def __init__(self, rig):
        self.rig = rig
        self.rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
        self.springs = {}

    def update(self):
        bpy.context.view_layer.update()

    def local(self, name, angles=(0, 0, 0), translation=(0, 0, 0)):
        """Rotates `name` about its head by Euler `angles` given in armature axes (relative to its parent's pose)."""
        p = self.rig.pose.bones[name]
        basis = self.rest[name].to_3x3()
        p.location = basis.inverted() @ Vector(translation)
        p.rotation_mode = "QUATERNION"
        euler = Matrix.Rotation(angles[2], 3, "Z") @ Matrix.Rotation(angles[1], 3, "Y") @ Matrix.Rotation(angles[0], 3, "X")
        p.rotation_quaternion = basis.to_quaternion().inverted() @ euler.to_quaternion() @ basis.to_quaternion()

    def world(self, name):
        return self.rig.pose.bones[name].matrix

    def aim(self, name, head, direction, twist=None):
        """Points `name` along `direction` from `head` with the least turn from its rest (plus `twist` about it)."""
        rest = self.rest[name]
        rest_dir = rest.to_3x3() @ Vector((0, 1, 0))
        turn = rest_dir.rotation_difference(Vector(direction).normalized())
        rotation = turn.to_matrix() @ rest.to_3x3()
        if twist:
            rotation = Matrix.Rotation(twist, 3, Vector(direction).normalized()) @ rotation
        m = rotation.to_4x4()
        m.translation = head
        self.rig.pose.bones[name].matrix = m
        self.update()

    def place(self, name, head, turn):
        """Sets `name` at `head`, turned by `turn` (armature axes) from its rest."""
        m = (turn @ self.rest[name].to_3x3()).to_4x4()
        m.translation = head
        self.rig.pose.bones[name].matrix = m
        self.update()

    def frame(self, name, head, y, x):
        """Sets `name`'s full frame: its y along `y`, its x toward `x`."""
        y = Vector(y).normalized()
        x = (Vector(x) - y * Vector(x).dot(y)).normalized()
        z = x.cross(y)
        m = Matrix((x, y, z)).transposed().to_4x4()
        m.translation = head
        self.rig.pose.bones[name].matrix = m
        self.update()

    def chain(self, upper, lower, start, target, pole):
        """Two bones from `start` reaching `target`, bending toward `pole`."""
        a, b = self.rig.data.bones[upper].length, self.rig.data.bones[lower].length
        offset = target - start
        distance = max(min(offset.length, a + b - 0.002), abs(a - b) + 0.002)
        axis = offset.normalized()
        bend = Vector(pole) - axis * Vector(pole).dot(axis)
        if bend.length < 1e-4:
            bend = Vector((0, -1, 0)) - axis * axis.y * -1
        bend.normalize()
        along = (a * a - b * b + distance * distance) / (2 * distance)
        joint = start + axis * along + bend * math.sqrt(max(0.0, a * a - along * along))
        end = start + axis * distance
        self.aim(upper, start, joint - start)
        self.aim(lower, joint, end - joint)
        return end

    def head_of(self, name):
        """Where `name`'s head is, given its parent's current pose."""
        bone = self.rig.data.bones[name]
        parent = bone.parent
        if parent is None:
            return bone.head_local.copy()
        return (self.world(parent.name) @ self.rest[parent.name].inverted() @ bone.head_local.to_4d()).to_3d()

    def deformed(self, bone, point):
        """Where a rest-pose `point` moved by `bone` is now."""
        return (self.world(bone) @ self.rest[bone].inverted() @ Vector(point).to_4d()).to_3d()

    def pose(self, s):
        for p in self.rig.pose.bones:
            p.matrix_basis.identity()
        spin, twist, lean, bank = s["spin"], s["twist"], s["lean"], s["bank"]
        turn = Matrix.Rotation(spin, 3, "Z")
        # Lean pitches her forward (toward -Y): a negative turn about X.
        self.local("pelvis", (-lean * 0.35, bank * 0.5, spin + twist * 0.35), turn @ Vector(s["hip"]))
        self.local("spine", (-lean * 0.35, bank * 0.3, twist * 0.35))
        self.local("chest", (-lean * 0.30, bank * 0.2, twist * 0.30))
        self.local("neck", (lean * 0.30, 0, -twist * 0.30))
        self.local("head", (lean * 0.45, -bank * 0.4, -twist * 0.50 + s["look"]))
        self.update()
        # Legs: from the hips to the feet's targets, knees forward.
        for side in "LR":
            pivot = spin + s["pivot" + side]
            ankle = turn @ (ANKLE[side] + Vector(s["foot" + side]))
            forward = Matrix.Rotation(pivot, 3, "Z") @ Vector((0, -1, 0))
            roll = s["roll" + side]
            # A lifted heel raises the ankle around the ball of the foot.
            ankle.z += math.sin(roll) * 0.10
            hip = self.head_of(f"thigh.{side}")
            out = Matrix.Rotation(pivot, 3, "Z") @ Vector((0.25 if side == "L" else -0.25, 0, 0))
            for _ in range(2):
                end = self.chain(f"thigh.{side}", f"shin.{side}", hip, ankle, forward + out)
                # Feet turn by their yaw and heel lift only (a least turn would
                # tip them onto an edge when they face backward in a spin).
                yaw = Matrix.Rotation(pivot, 3, "Z")
                self.place(f"foot.{side}", end, yaw @ Matrix.Rotation(-roll, 3, "X"))
                self.place(f"toe.{side}", self.head_of(f"toe.{side}"), yaw)
                # Lift the foot if any point of its sole went under the floor
                # (weighted between foot and toe as the shoe is, figure.boot).
                lowest = math.inf
                for y in (0.095, 0.03, -0.02, -0.045, -0.065, -0.09, -0.11):
                    for dx in (-0.04, 0.0, 0.04):
                        t = max(0.0, min(1.0, (-y - 0.035) / 0.05))
                        point = Vector((ANKLE[side].x + dx, y, 0.0))
                        z = self.deformed(f"foot.{side}", point).z * (1 - t) + self.deformed(f"toe.{side}", point).z * t
                        lowest = min(lowest, z)
                if lowest >= 0:
                    break
                ankle.z -= lowest
        # Arms: the sword hand to its grip point, the blade along yaw and pitch.
        yaw, pitch = s["yaw"], s["pitch"]
        blade = turn @ Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
        grip = turn @ Vector(s["grip"])
        shoulder = self.head_of("upper_arm.R")
        reach = grip - shoulder
        # The fist's knuckles point square to the handle, continuing her reach.
        knuckle = reach - blade * reach.dot(blade)
        if knuckle.length < 1e-3:
            knuckle = blade.cross(Vector((0, 0, 1)))
        knuckle.normalize()
        wrist = grip - knuckle * FIST
        elbow_pole = turn @ Vector((-0.8, 0.5, -0.6))
        end = self.chain("upper_arm.R", "forearm.R", shoulder, wrist, elbow_pole)
        self.frame("hand.R", end, knuckle, blade)
        self.frame("weapon_grip", self.head_of("weapon_grip"), blade, knuckle)
        shoulder = self.head_of("upper_arm.L")
        hand = turn @ Vector(s["left"])
        reach = (hand - shoulder).normalized()
        wrist = hand - reach * FIST
        end = self.chain("upper_arm.L", "forearm.L", shoulder, wrist, turn @ Vector((0.8, 0.5, -0.6)))
        self.aim("hand.L", end, hand - end)

    def secondary(self, travel, dt, reset=False):
        """Hair, cape, and tail lag behind the body: a damped spring per bone toward hanging, pushed by drag."""
        for name, (stiffness, drag, gravity) in SECONDARY.items():
            parent = self.rig.data.bones[name].parent.name
            head = self.head_of(name)
            parent_turn = (self.world(parent) @ self.rest[parent].inverted()).to_3x3()
            rest_dir = (self.rest[name].to_3x3() @ Vector((0, 1, 0)))
            carried = (parent_turn @ rest_dir).normalized()
            goal = carried.lerp(Vector((0, 0, -1)), gravity).normalized()
            state = self.springs.get(name)
            if reset or state is None:
                state = {"dir": goal.copy(), "vel": Vector(), "head": head.copy()}
            # Moving through the air pushes the end backward.
            velocity = (head - state["head"]) / dt + travel
            push = -velocity * drag
            target = (goal + push).normalized()
            # Critically damped toward the target.
            state["vel"] = state["vel"] * (1 - stiffness) + (target - state["dir"]) * stiffness
            state["dir"] = (state["dir"] + state["vel"]).normalized()
            state["head"] = head.copy()
            self.springs[name] = state
            self.aim(name, head, state["dir"])


def rig_and_animate(body, collection, fps):
    rig = make_armature(collection)
    body.parent = rig
    modifier = body.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig
    poser = Poser(rig)
    scene = bpy.context.scene
    rig.animation_data_create()
    dt = 1 / fps
    # Hair and cape at rest under the guard, so one-shots start from it.
    poser.pose(GUARD)
    for _ in range(40):
        poser.secondary(Vector(), dt)
    guard_springs = {k: {kk: vv.copy() for kk, vv in v.items()} for k, v in poser.springs.items()}
    for name, (frames, loop, evaluate) in clips.items():
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        travel = Vector((0, TRAVEL.get(name, 0.0), 0))
        poser.springs = {k: {kk: vv.copy() for kk, vv in v.items()} for k, v in guard_springs.items()}
        # Loops play twice first, so their hair and cape are already swinging when keyed.
        passes = 3 if loop else 1
        previous = {}
        for p in range(passes):
            for frame in range(1, frames + 1):
                pose = evaluate(frame)
                poser.pose(pose)
                poser.secondary(Matrix.Rotation(pose["spin"], 3, "Z") @ travel, dt)
                if p < passes - 1:
                    continue
                for bone in rig.pose.bones:
                    q = bone.rotation_quaternion
                    last = previous.get(bone.name)
                    if last is not None and last.dot(q) < 0:
                        bone.rotation_quaternion = -q
                    previous[bone.name] = bone.rotation_quaternion.copy()
                    bone.keyframe_insert("location", frame=frame, group=bone.name)
                    bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)
                    bone.keyframe_insert("scale", frame=frame, group=bone.name)
        for curve in fcurves(action):
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"
        action.use_frame_range = True
        action.frame_start, action.frame_end = 1, frames
    rig.animation_data.action = bpy.data.actions["Idle"]
    scene.frame_start, scene.frame_end = 1, 60
    scene.frame_set(1)
    return rig


def fcurves(action):
    """An action's curves (Blender 4.4+ keeps them in layered channel bags)."""
    if getattr(action, "layers", None):
        return [c for layer in action.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]
    return list(action.fcurves)
