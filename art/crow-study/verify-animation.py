"""Check the saved rig, evaluated deformation, foot contact, and loop seams."""
import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT / "crow-animated.blend"))
scene = bpy.context.scene
rig = bpy.data.objects["Crow rig | idle + walk"]
meshes = [o for o in bpy.data.collections["CROW | editable character"].objects if o.type == "MESH"]
assert len(meshes) == 23
assert len(rig.data.bones) == 12
for obj in meshes:
    assert any(m.type == "ARMATURE" and m.object == rig for m in obj.modifiers)
    for v in obj.data.vertices:
        assert abs(sum(g.weight for g in v.groups) - 1) < 1e-5, (obj.name, v.index)


def evaluated(frame):
    scene.frame_set(frame)
    graph = bpy.context.evaluated_depsgraph_get()
    result = {}
    for obj in meshes:
        current = obj.evaluated_get(graph)
        mesh = current.to_mesh()
        result[obj.name] = [current.matrix_world @ v.co for v in mesh.vertices]
        current.to_mesh_clear()
    return result


for clip, frames in [("Idle", 48), ("Walk", 24)]:
    rig.animation_data.action = bpy.data.actions[clip]
    first, last = evaluated(1), evaluated(frames + 1)
    seam = max((a - b).length for name in first for a, b in zip(first[name], last[name]))
    assert seam < 1e-5, (clip, "loop seam", seam)
    motion = 0
    lowest = 100
    foot_positions = {}
    for frame in range(1, frames + 1):
        current = evaluated(frame)
        for name, points in current.items():
            for index, p in enumerate(points):
                assert all(math.isfinite(x) for x in p)
                lowest = min(lowest, p.z)
                motion = max(motion, (p - first[name][index]).length)
            if clip == "Idle" and name.startswith("Foot"):
                assert max((a - b).length for a, b in zip(points, first[name])) < 1e-5
        for label in ("L", "R"):
            foot_positions.setdefault(label, []).append(rig.pose.bones[f"foot.{label}"].head.z)
    assert lowest > -0.015, (clip, "below ground", lowest)
    assert motion > (0.01 if clip == "Idle" else 0.2), (clip, "no meaningful motion", motion)
    if clip == "Walk":
        for label, values in foot_positions.items():
            assert max(values) - min(values) > 0.1, ("foot never lifts", label)
            assert sum(abs(z - 0.075) < 1e-4 for z in values) >= 12, ("no stance", label)
    print(clip, "seam", round(seam, 8), "max motion", round(motion, 4), "ground min", round(lowest, 4))
print("CROW_ANIMATION_VERIFIED: weights, deformation, closed loops, idle contact, alternating walk lift")
