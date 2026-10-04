"""Verify the animated export against the saved source and attack contacts."""
import importlib.util
import json
import sys
from pathlib import Path

import bpy

HERE=Path(__file__).resolve().parent
FOLDER=HERE/"animated"
sys.path.insert(0,str(HERE.parents[1]/"scripts"))
spec=importlib.util.spec_from_file_location("enemy_export_verification",HERE.parents[1]/"scripts/verify.py")
verification=importlib.util.module_from_spec(spec)
spec.loader.exec_module(verification)
verification.verify("chaser",FOLDER)
bpy.ops.wm.open_mainfile(filepath=str(FOLDER/"chaser.blend"))
rig=next(o for o in bpy.context.scene.objects if o.type=="ARMATURE")
mesh=next(o for o in bpy.context.scene.objects if o.type=="MESH")
clips=json.loads(rig["clips"])
def matrices(action,frame):
    rig.animation_data.action=bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    return {b.name:b.matrix.copy() for b in rig.pose.bones}
windup=matrices("Windup",31)
active=matrices("Active",1)
recovery=matrices("Recovery",1)
rest=matrices("Idle",1)
end=matrices("Recovery",22)
errors={"windup_to_active":max(abs(windup[n][i][j]-active[n][i][j]) for n in windup for i in range(4) for j in range(4)),
        "active_to_recovery":max(abs(active[n][i][j]-recovery[n][i][j]) for n in active for i in range(4) for j in range(4)),
        "recovery_to_idle":max(abs(rest[n][i][j]-end[n][i][j]) for n in rest for i in range(4) for j in range(4))}
assert max(errors.values())<1e-6,errors
# Check the actual weighted feet, including interpolated poses. Counter-
# rotation should keep toes level, with a planted stance and a clear return.
rig.animation_data.action=bpy.data.actions["Run"]
groups={side:mesh.vertex_groups[f"foot.{side}"].index for side in ("L","R")}
feet={side:[v.index for v in mesh.data.vertices if any(g.group==group for g in v.groups)] for side,group in groups.items()}
ground_errors=[]
level_errors=[]
lift={side:0 for side in feet}
for sample in range(73):
    t=sample/72
    frame=1+t*18
    bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame))
    evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    for side,offset in (("L",0),("R",.5)):
        points=[evaluated.matrix_world@evaluated.data.vertices[i].co for i in feet[side]]
        low=min(p.z for p in points)
        lift[side]=max(lift[side],low)
        # Exclude the immediate key interpolation at lift-off/touchdown.
        if .04<((t+offset)%1)<.24:ground_errors.append(abs(low))
        deformation=rig.pose.bones[f"foot.{side}"].matrix@rig.data.bones[f"foot.{side}"].matrix_local.inverted()
        level_errors.append(deformation.to_quaternion().angle)
assert max(ground_errors)<.003,ground_errors
assert max(level_errors)<.001,level_errors
assert min(lift.values())>.16,lift
report=json.loads((FOLDER/"verification.json").read_text())
report["contactPoseErrors"]=errors
report["runFeet"]={"stanceGroundError":max(ground_errors),"levelRotationError":max(level_errors),"returnLift":lift}
(FOLDER/"verification.json").write_text(json.dumps(report,indent=2)+"\n")
print("CONTACTS",json.dumps(errors))
