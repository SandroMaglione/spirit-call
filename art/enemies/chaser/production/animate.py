"""Rig the approved saved model and author its in-place enemy lifecycle.

The static review source stays untouched. The twelve-bone animated source uses
the established enemy action writer and preserves the model's geometry and
per-facet palette. Contact poses connect Windup -> Active -> Recovery.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/"scripts"))
from common import Creature, keep_off_floor, motion, transform

SOURCE=HERE/"chaser-production.blend"
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
parts=[o for o in bpy.context.scene.objects if o.type=="MESH"]

def center(name):
    obj=bpy.data.objects[name]
    return sum((obj.matrix_world@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)

def assigned_bone(name):
    if name in ("HeadShell","ForeheadShield") or name.startswith(("Eye.","EyeSocket.","FaceRim.")):return "head"
    if name=="BackKeel":return "tail"
    for side in ("L","R"):
        if name.startswith((f"Ankle.{side}",f"Foot.{side}",f"Toe.{side}")):return f"foot.{side}"
        if name.startswith((f"Forearm.{side}",f"Elbow.{side}",f"WristPlate.{side}",f"SmallPalm.{side}",f"Finger.{side}",f"FingerTip.{side}",f"BoneClaw.{side}")):return f"forearm.{side}"
        if name.startswith((f"ShoulderJoint.{side}",f"ShoulderPlate.{side}",f"UpperArm.{side}")):return f"arm.{side}"
        if name.startswith((f"HipJoint.{side}",f"ThighPlate.{side}",f"Knee.{side}",f"ShinPlate.{side}",f"Ankle.{side}",f"Foot.{side}",f"Toe.{side}")):return f"leg.{side}"
    return "body"

creature=Creature.__new__(Creature)
creature.kind="chaser"
creature.folder=HERE/"animated"
creature.folder.mkdir(exist_ok=True)
creature.parts=parts
creature.joints={
    "root":((0,0,0),None),
    "body":((0,-.16,.88),"root"),
    "head":((0,-.55,1.13),"body"),
    "arm.L":(center("ShoulderJoint.L"),"body"),
    "arm.R":(center("ShoulderJoint.R"),"body"),
    "forearm.L":(center("Elbow.L"),"arm.L"),
    "forearm.R":(center("Elbow.R"),"arm.R"),
    "leg.L":(center("HipJoint.L"),"root"),
    "leg.R":(center("HipJoint.R"),"root"),
    "foot.L":(center("Ankle.L"),"leg.L"),
    "foot.R":(center("Ankle.R"),"leg.R"),
    "tail":((0,.11,1.11),"body"),
}
bindings={o.name:assigned_bone(o.name) for o in parts}
for obj in parts:
    group=obj.vertex_groups.new(name=bindings[obj.name])
    group.add(list(range(len(obj.data.vertices))),1,"REPLACE")
# Eye cores carry `_GLOW` 1: the game's enemy shader makes such vertices
# shine in their own color (one material, no emission map).
for obj in parts:
    glow=obj.data.attributes.new("_GLOW","FLOAT","POINT")
    for item in glow.data:item.value=1 if obj.name.startswith("Eye.") else 0
material=parts[0].data.materials[0]
shader=material.node_tree.nodes["Principled BSDF"]
for link in list(shader.inputs["Emission Color"].links):material.node_tree.links.remove(link)
for link in list(shader.inputs["Emission Strength"].links):material.node_tree.links.remove(link)
shader.inputs["Emission Strength"].default_value=0

def pose(action,t):
    s,c=math.sin(math.tau*t),math.cos(math.tau*t)
    s2,c2=math.sin(2*math.tau*t),math.cos(2*math.tau*t)
    if action=="Idle":
        # Never still: it breathes into a crouch, its head scans from side
        # to side, and the claw arm flexes. Sized for a 60 px body.
        return {
            "body":transform((.04*(1-c)/2,.02*s,0),(0,0,-.022*(1-c)/2)),
            "head":transform((.05*(1-c2)/2,0,.22*s)),
            "tail":transform((0,0,.14*s)),
            "arm.R":transform((.08*s,0,.05*(1-c)/2)),
            "forearm.R":transform((-.14*(1-c)/2,0,0)),
            "arm.L":transform((-.06*s,0,0)),
        }
    if action=="Run":
        # A brief planted push followed by a fast, high return: the stance
        # foot travels .68 m in 28% of a cycle, matching the 48-unit runtime
        # stride at the Chaser's gameplay scale. Ankles keep the toes level.
        half=(t*2)%1
        flight=max(0,(half-.56)/.44)
        bounce=.10*math.sin(math.pi*flight)**2
        result={
            "body":transform((.27+.025*math.cos(math.tau*half),.025*s,.05*s),(0,-.10,.015+bounce)),
            "head":transform((-.10,0,-.035*s)),
            "arm.R":transform((-.38-.12*s,0,.08*s)),
            "forearm.R":transform((-.15-.07*s,0,-.025*s)),
            "arm.L":transform((.42*s-.12,0,-.10*s)),
            "forearm.L":transform((-.18-.10*s,0,0)),
            "tail":transform((-.08,0,.10*s)),
        }
        for side,offset in (("L",0),("R",.5)):
            phase=(t+offset)%1
            if phase<.28:
                travel=-.34+.68*phase/.28
                lift=0
            else:
                swing=(phase-.28)/.72
                travel=.34*math.cos(math.pi*swing)
                lift=.18*math.sin(math.pi*swing)**1.2
            angle=.43*travel/.34
            hip=Vector(creature.joints[f"leg.{side}"][0])
            ankle=Vector(creature.joints[f"foot.{side}"][0])
            drift=Matrix.Rotation(angle,3,"X")@(ankle-hip)-(ankle-hip)
            result[f"leg.{side}"]=transform((angle,0,0),(0,travel-drift.y,lift-drift.z))
            result[f"foot.{side}"]=transform((-angle,0,0))
        return result
    if action in ("Windup","Active","Recovery"):
        if action=="Windup":
            ready=math.sin(min(1,t/.72)*math.pi/2)
            strike=max(0,(t-.82)/.18)
        elif action=="Active":ready,strike=1,1
        else:ready,strike=(1-t)**2,(1-t)**2
        # The whole body coils away from the claw arm and sinks, the arm
        # drawn far back; the strike unwinds through the trunk and lunges.
        return {
            "body":transform((-.12*ready+.34*strike,0,-.45*ready+.85*strike),(0,.04*ready-.14*strike,-.07*ready+.03*strike)),
            "head":transform((.04*ready,0,.24*ready-.42*strike)),
            "arm.R":transform((-.60*ready+.32*strike,-.10*ready,-.95*ready+1.75*strike)),
            "forearm.R":transform((-.22*ready+.10*strike,0,.30*ready-.45*strike)),
            "arm.L":transform((-.15*ready+.25*strike,0,.22*ready-.20*strike)),
            "tail":transform((0,0,-.14*ready+.22*strike)),
        }
    if action=="Hurt":
        # The code adds its own squash and lean to a hit; the clip throws the parts.
        recoil=math.sin(math.pi*t)*(1-t)*2.6
        return {
            "body":transform((-.26*recoil,.08*recoil,0)),
            "head":transform((-.24*recoil,0,.16*recoil)),
            "arm.R":transform((-.30*recoil,0,-.25*recoil)),
            "arm.L":transform((-.30*recoil,0,.25*recoil)),
            "tail":transform((.2*recoil,0,0)),
        }
    if action in ("Spawn","Death"):
        # In one piece: every part hanging off the root scales about the ground origin.
        if action=="Spawn":
            back=1+2.70158*(t-1)**3+1.70158*(t-1)**2
            size=.25+.75*back;squash=1+.30*math.sin(math.pi*t)*(1-t)
        else:size=max(.02,1-max(0,(t-.55)/.45));squash=1
        result={}
        for name,(at,parent) in creature.joints.items():
            if parent=="root":
                at=Vector(at)
                result[name]=transform(location=((size-1)*at.x,(size-1)*at.y,(size*squash-1)*at.z),scale=(size,size,size*squash))
        if action=="Death":result["body"]=transform((.7*math.sin(t*math.pi/2),0,0),result["body"][1],result["body"][2])
        return result
    return motion("chaser",action,t)

creature.animate(pose)
rig=creature.armature
keep_off_floor(rig,creature.mesh)
rig.animation_data.action=None
rig.data.pose_position="REST"
bpy.context.view_layer.update()
mesh=creature.mesh
mesh.data.calc_loop_triangles()
points=[mesh.matrix_world@v.co for v in mesh.data.vertices]
triangles=len(mesh.data.loop_triangles)
assert triangles<2000
assert len(rig.data.bones)==12
assert len(mesh.data.materials)==1
assert abs(max(v.z for v in points)-1.8)<1e-5
rig.data.pose_position="POSE"
rig.animation_data.action=bpy.data.actions["Idle"]
bpy.context.scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(creature.folder/"chaser.blend"))
report={"source":"../chaser-production.blend","source_sha256":hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "triangles":triangles,"bones":12,"materials":1,"mesh_objects":1,"part_bindings":bindings,
        "run":{"forward_lean_degrees":math.degrees(.27),"foot_travel_meters":.68,"stance_fraction":.28,"runtime_distance":48},
        "clips":creature.clips,"root_motion":False}
(creature.folder/"rig-info.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report))
