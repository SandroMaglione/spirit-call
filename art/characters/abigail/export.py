"""Export Abigail and her swords, and check the result.

blender --background --python-exit-code 1 --python art/characters/abigail/export.py

Writes abigail.glb (body, skeleton, ten clips), her two swords (the
crow's, at her scale), model-info.json, verification.json, and the game's
timing module src/presentation/assets/abigail-timing.ts.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from figure import SWORD_SCALE  # noqa: E402
from motion import COMBO, clips  # noqa: E402
from rig import fcurves  # noqa: E402

FPS = 30
GAME = HERE.parents[2]


def read_glb(path):
    data = path.read_bytes()
    length = int.from_bytes(data[12:16], "little")
    return json.loads(data[20:20 + length])


def select(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def export(path, animated):
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
        export_yup=True, export_cameras=False, export_lights=False, export_extras=False,
        export_materials="EXPORT", export_image_format="AUTO", export_animations=animated,
        export_animation_mode="ACTIONS", export_force_sampling=True, export_anim_slide_to_zero=True,
        export_optimize_animation_size=True, export_frame_range=False, export_frame_step=1,
        export_skins=animated, export_all_influences=False, export_influence_nb=4, export_morph=False,
        export_def_bones=True)


def lowest(mesh):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    data = evaluated.to_mesh()
    z = min((evaluated.matrix_world @ v.co).z for v in data.vertices)
    evaluated.to_mesh_clear()
    return z


def bounds(mesh):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    data = evaluated.to_mesh()
    points = [evaluated.matrix_world @ v.co for v in data.vertices]
    evaluated.to_mesh_clear()
    return [tuple(min(p[k] for p in points) for k in range(3)), tuple(max(p[k] for p in points) for k in range(3))]


report = {"clips": {}, "weapons": {}}

# Her swords: the crow's files, scaled to her hand.
for name, file in [("trainingBlade", "training-blade.glb"), ("crescendo", "crescendo.glb")]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(HERE.parent / "crow/combat" / file))
    root = bpy.data.objects[name]
    root.scale = (SWORD_SCALE,) * 3
    bpy.context.view_layer.update()
    select([root, *root.children_recursive])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    path = HERE / file
    export(path, False)
    document = read_glb(path)
    assert not document.get("skins") and not document.get("animations")
    assert {name + "_blade_base", name + "_blade_tip"} <= {n.get("name") for n in document["nodes"]}
    assert len(document["materials"]) == 1
    report["weapons"][name] = {"bytes": path.stat().st_size, "scale": SWORD_SCALE}

bpy.ops.wm.open_mainfile(filepath=str(HERE / "abigail.blend"))
scene = bpy.context.scene
scene.render.fps = FPS
rig = bpy.data.objects["Abigail rig"]
mesh = bpy.data.objects["Abigail body"]

# At most four weights per vertex, normalized.
groups = {g.index: g.name for g in mesh.vertex_groups}
deform = {b.name for b in rig.data.bones if b.use_deform}
most = 0
for v in mesh.data.vertices:
    weights = [g for g in v.groups if g.weight > 0 and groups[g.group] in deform]
    most = max(most, len(weights))
    assert abs(sum(g.weight for g in weights) - 1) < 1e-3, ("weights", v.index)
assert most <= 4, most
report["max_weights"] = most

rig.animation_data.action = None
for p in rig.pose.bones:
    p.matrix_basis.identity()
rig.data.pose_position = "REST"
bpy.context.view_layer.update()
rest = bounds(mesh)
assert abs(rest[0][2]) < 1e-4, rest
height = rest[1][2]
rig.data.pose_position = "POSE"

for name, (frames, loop, _) in clips.items():
    action = bpy.data.actions[name]
    rig.animation_data.action = action
    low = math.inf
    for frame in range(1, frames + 1):
        scene.frame_set(frame)
        low = min(low, lowest(mesh))
    report["clips"][name] = {"ground_min": round(low, 4)}
    assert low > -0.02, (name, "below the floor", low)
    last = max(k.co.x for c in fcurves(action) for k in c.keyframe_points)
    assert last == frames, (name, last)

rig.animation_data.action = bpy.data.actions["Idle"]
scene.frame_set(1)
select([rig, mesh])
path = HERE / "abigail.glb"
export(path, True)
document = read_glb(path)
assert len(document["skins"]) == 1
assert {a["name"] for a in document["animations"]} == set(clips)
assert not document.get("cameras") and not document.get("extensionsRequired")
assert all("uri" not in i for i in document.get("images", []))
report["bones"] = len(document["skins"][0]["joints"])
report["triangles"] = sum(document["accessors"][p["indices"]]["count"] // 3 for m in document["meshes"] for p in m["primitives"])
report["materials"] = len(document["materials"])
report["bytes"] = path.stat().st_size
report["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
assert report["triangles"] < 5000, report["triangles"]
assert report["materials"] == 1
assert report["bytes"] < 600_000, report["bytes"]
assert "weapon_grip" in {document["nodes"][j]["name"] for j in document["skins"][0]["joints"]}

info = {
    "schema_version": 2, "fps": FPS, "height_meters": height, "up": "+Y", "forward": "+Z", "root_motion": False,
    "grip": "weapon_grip", "sword_scale": SWORD_SCALE,
    "clips": {name: {"frames": [1, n], "samples": n, "last_key_seconds": (n - 1) / FPS,
                     "loop_seconds": n / FPS if loop else None, "duration_seconds": (n if loop else n - 1) / FPS}
              for name, (n, loop, _) in clips.items()},
    "combo": [{"name": name, "start": (start - 1) / FPS, "end": (end - 1) / FPS, "contact": (hit - 1) / FPS,
               "recover": recover} for name, start, end, hit, recover in COMBO],
}
(HERE / "model-info.json").write_text(json.dumps(info, indent=2) + "\n")
(HERE / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
# Runtime metadata comes from this export, never a second hand-edited clock.
timing = {"height": height, "clips": {name: {"lastKeySeconds": c["last_key_seconds"], "loopSeconds": c["loop_seconds"]}
                                     for name, c in info["clips"].items()}}
combo = [{"from": m["start"], "to": m["end"], "contact": m["contact"], **({"next": m["recover"]} if m["recover"] else {})}
         for m in info["combo"]]
(GAME / "src/presentation/assets/abigail-timing.ts").write_text(
    "// Generated by art/characters/abigail/export.py. Edit the scripts and re-export.\n"
    + "export const abigailTiming = " + json.dumps(timing, indent=2) + " as const\n\n"
    + "export const abigailCombo = " + json.dumps(combo, indent=2) + " as const\n")
print("ABIGAIL_EXPORTED", json.dumps(report))
