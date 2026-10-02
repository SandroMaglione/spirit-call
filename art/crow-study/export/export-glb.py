"""Export and round-trip-check the saved rig. Run with Blender 4.5 LTS.

blender --background --python-exit-code 1 --python art/crow-study/export/export-glb.py
"""
import json
import struct
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUTPUT = ROOT / "crow-animated.glb"
FPS = 24
CLIPS = {"Idle": 48, "Run": 12}


def curves(action):
    return [curve for layer in action.layers for strip in layer.strips
            for bag in strip.channelbags for curve in bag.fcurves]


def bounds(meshes):
    graph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in meshes:
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        points.extend(evaluated.matrix_world @ v.co for v in mesh.vertices)
        evaluated.to_mesh_clear()
    return [[min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)]]


def weights(meshes, rig):
    maximum = 0
    for obj in meshes:
        assert any(m.type == "ARMATURE" and m.object == rig for m in obj.modifiers)
        for vertex in obj.data.vertices:
            groups = [g for g in vertex.groups if g.weight > 1e-7]
            assert groups and len(groups) <= 4
            assert abs(sum(g.weight for g in groups) - 1) < 1e-5
            assert all(obj.vertex_groups[g.group].name in rig.data.bones for g in groups)
            maximum = max(maximum, len(groups))
    return maximum


def capture(rig, meshes, clip, count):
    rig.animation_data.action = bpy.data.actions[clip]
    samples = []
    root_matrix = None
    for frame in range(1, count + 1):
        bpy.context.scene.frame_set(frame)
        current = rig.pose.bones["root"].matrix.copy()
        if root_matrix is None:
            root_matrix = current
        assert max(abs(current[i][j] - root_matrix[i][j]) for i in range(4) for j in range(4)) < 1e-5
        samples.append(bounds(meshes))
    return samples


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data)
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    size, kind = struct.unpack_from("<II", data, 12)
    assert kind == 0x4E4F534A
    document = json.loads(data[20:20 + size])
    binary_size, binary_kind = struct.unpack_from("<II", data, 20 + size)
    assert binary_kind == 0x004E4942
    return document, data[28 + size:28 + size + binary_size]


def accessor(document, binary, index):
    a = document["accessors"][index]
    v = document["bufferViews"][a["bufferView"]]
    sizes = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
    formats = {5126: "f", 5123: "H", 5121: "B"}
    fmt = "<" + formats[a["componentType"]] * sizes[a["type"]]
    stride = v.get("byteStride", struct.calcsize(fmt))
    offset = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    return [struct.unpack_from(fmt, binary, offset + n * stride) for n in range(a["count"])]


def main():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / "crow-animated.blend"))
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    collection = bpy.data.collections["CROW | editable character"]
    meshes = [o for o in collection.objects if o.type == "MESH"]
    rig = next(o for o in collection.objects if o.type == "ARMATURE")
    root = bpy.data.objects["Crow | model root"]
    assert tuple(root.location) == (0, 0, 0) and tuple(root.scale) == (1, 1, 1)
    assert weights(meshes, rig) <= 4

    # Preserve the saved study. Only this export scene is consolidated and grounded.
    rig.animation_data.action = None
    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    ground = bounds(meshes)[0][2]
    for obj in meshes:
        for vertex in obj.data.vertices:
            vertex.co.z -= ground
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in rig.data.edit_bones:
        bone.head.z -= ground
        bone.tail.z -= ground
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    rest = bounds(meshes)
    assert abs(rest[0][2]) < 1e-6
    # Blender's forward -Y converts to glTF +Z; Z-up converts to Y-up.
    beak = next(o for o in meshes if o.name.startswith("Beak"))
    assert sum(v.co.y for v in beak.data.vertices) / len(beak.data.vertices) < -0.3
    height = rest[1][2]
    rig.data.pose_position = "POSE"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    mesh = bpy.context.object
    mesh.name = "Crow mesh"
    mesh.parent = rig
    meshes = [mesh]
    # Material primitives remain separate; all parts now share one skinned mesh.
    for material in mesh.data.materials:
        assert material.use_nodes
        shaders = [n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"]
        assert len(shaders) == 1
        shaders[0].inputs["Emission Strength"].default_value = 0
    max_weights = weights(meshes, rig)
    expected = {}
    seams = {}
    for name, count in CLIPS.items():
        action = bpy.data.actions[name]
        expected[name] = capture(rig, meshes, name, count)
        scene.frame_set(count + 1)
        seam = bounds(meshes)
        seams[name] = max(abs(a - b) for p, q in zip(expected[name][0], seam) for a, b in zip(p, q))
        assert seams[name] < 1e-5
        for curve in curves(action):
            for key in list(curve.keyframe_points):
                if key.co.x > count:
                    curve.keyframe_points.remove(key)
        action.use_frame_range = True
        action.frame_start, action.frame_end = 1, count

    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, rig, mesh]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    rig.animation_data.action = bpy.data.actions["Idle"]
    scene.frame_set(1)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT), export_format="GLB", use_selection=True,
        export_yup=True, export_cameras=False, export_lights=False,
        export_materials="EXPORT", export_image_format="AUTO",
        export_animations=True, export_animation_mode="ACTIONS",
        export_force_sampling=True, export_frame_range=False,
        export_anim_slide_to_zero=True,
        export_optimize_animation_size=False, export_frame_step=1,
        export_skins=True, export_all_influences=False, export_influence_nb=4,
        export_morph=False, export_extras=False)
    document, binary = read_glb(OUTPUT)
    assert OUTPUT.stat().st_size < 500_000, OUTPUT.stat().st_size
    assert len(document["skins"]) == 1
    assert not document.get("cameras") and not document.get("extensionsRequired")
    assert all("camera" not in n and "Studio" not in n.get("name", "") for n in document["nodes"])
    assert all("uri" not in i and "bufferView" in i for i in document["images"])
    assert all("pbrMetallicRoughness" in m for m in document["materials"])
    assert {a["name"] for a in document["animations"]} == set(CLIPS)
    for animation in document["animations"]:
        count = CLIPS[animation["name"]]
        for sampler in animation["samplers"]:
            times = [v[0] for v in accessor(document, binary, sampler["input"])]
            assert len(times) == count, (animation["name"], len(times), count)
            assert max(abs(t - i / FPS) for i, t in enumerate(times)) < 1e-6
    for m in document["meshes"]:
        for p in m["primitives"]:
            assert "WEIGHTS_1" not in p["attributes"]
            for values in accessor(document, binary, p["attributes"]["WEIGHTS_0"]):
                assert abs(sum(values) - 1) < 1e-5

    # Fresh import proves the file, rather than just the pre-export scene.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=str(OUTPUT), disable_bone_shape=True)
    rigs = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    assert len(rigs) == 1
    rig = rigs[0]
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    assert all(o.type in {"MESH", "ARMATURE", "EMPTY"} for o in bpy.context.scene.objects)
    imported_max_weights = weights(meshes, rig)
    assert set(CLIPS).issubset(bpy.data.actions.keys()), list(bpy.data.actions.keys())
    errors = {}
    for name, count in CLIPS.items():
        # The glTF importer starts time zero at Blender frame 0.
        rig.animation_data.action = bpy.data.actions[name]
        actual = []
        root_matrix = None
        for frame in range(count):
            bpy.context.scene.frame_set(frame)
            current = rig.pose.bones["root"].matrix.copy()
            if root_matrix is None:
                root_matrix = current
            assert max(abs(current[i][j] - root_matrix[i][j]) for i in range(4) for j in range(4)) < 1e-5
            actual.append(bounds(meshes))
        error = max(abs(a - b) for e, r in zip(expected[name], actual)
                    for p, q in zip(e, r) for a, b in zip(p, q))
        assert error < 2e-4, (name, "round-trip bounds", error)
        errors[name] = error
    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    imported_rest = bounds(meshes)
    assert max(abs(a - b) for p, q in zip(rest, imported_rest) for a, b in zip(p, q)) < 2e-4
    info_path = ROOT / "model-info.json"
    info = json.loads(info_path.read_text())
    info["animated_export"] = {
        "file": "crow-animated.glb", "height_meters": height,
        "up": "+Y", "forward": "+Z", "origin": "ground between feet",
        "rest_bounds_meters": {"min": [rest[0][0], rest[0][2], -rest[1][1]],
                               "max": [rest[1][0], rest[1][2], -rest[0][1]]},
        "armatures": 1, "bones": len(rig.data.bones), "max_weights": max_weights,
        "root_motion": False, "fps": FPS,
        "clips": {name: {"frames": [1, count], "samples": count,
                         "last_key_seconds": (count - 1) / FPS,
                         "loop_seconds": count / FPS} for name, count in CLIPS.items()}}
    info_path.write_text(json.dumps(info, indent=2) + "\n")
    report = {"bytes": OUTPUT.stat().st_size, "height_meters": height,
              "armatures": 1, "bones": len(rig.data.bones),
              "max_weights_after_import": imported_max_weights,
              "source_loop_seam_error_meters": seams,
              "round_trip_max_bounds_error_meters": errors}
    (HERE / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print("CROW_GLB_VERIFIED", json.dumps(report))


if __name__ == "__main__":
    main()
