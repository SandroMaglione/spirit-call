"""Export the combat study and compare fresh-imported poses with the source."""
import hashlib
import importlib.util
import json
from pathlib import Path

import bpy
from mathutils import Matrix

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
spec=importlib.util.spec_from_file_location("old_export",ROOT/"export/export-glb.py")
old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
info=json.loads((HERE/"model-info.json").read_text())
bpy.ops.wm.open_mainfile(filepath=str(ROOT/"crow-combat.blend"))
scene=bpy.context.scene;scene.render.fps=info["fps"]
collection=bpy.data.collections["CROW | editable character"]
rig=next(o for o in collection.objects if o.type=="ARMATURE")
meshes=[o for o in collection.objects if o.type=="MESH"]
root=bpy.data.objects["Crow | model root"]
for obj in meshes:
    world=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=world
report={"armatures":1,"bones":len(rig.data.bones),"clips":{},"weapons":{}}


def select(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]


def export(path,animated):
    bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,
        export_yup=True,export_cameras=False,export_lights=False,export_extras=False,
        export_materials="EXPORT",export_image_format="AUTO",export_animations=animated,
        export_animation_mode="ACTIONS",export_force_sampling=True,export_anim_slide_to_zero=True,
        export_optimize_animation_size=True,export_frame_range=False,export_frame_step=1,
        export_skins=animated,export_all_influences=False,export_influence_nb=4,export_morph=False)


for name,weapon in info["weapons"].items():
    col=bpy.data.collections[name]
    obj=bpy.data.objects[name]
    obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    select(list(col.objects))
    path=HERE/weapon["file"];export(path,False)
    document,binary=old.read_glb(path)
    assert not document.get("skins") and not document.get("animations")
    assert path.stat().st_size<100_000
    assert {name+"_blade_base",name+"_blade_tip"}.issubset({n.get("name") for n in document["nodes"]})
    report["weapons"][name]={"bytes":path.stat().st_size,"triangles":sum(len(o.data.loop_triangles) for o in col.objects if o.type=="MESH")}

rig.animation_data.action=None;rig.data.pose_position="REST";bpy.context.view_layer.update()
rest=old.bounds(meshes);info["height_meters"]=rest[1][2]-rest[0][2]
assert abs(rest[0][2])<1e-5
rig.data.pose_position="POSE"
select(meshes);bpy.ops.object.join();mesh=bpy.context.object
mesh.name="Crow combat mesh";mesh.parent=rig;meshes=[mesh]
for mat in mesh.data.materials:
    mat.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value=0
report["max_weights"]=old.weights(meshes,rig)
assert report["max_weights"]<=4
expected={}
for name,clip in info["clips"].items():
    count=clip["samples"]
    expected[name]=old.capture(rig,meshes,name,count)
    lowest=min(b[0][2] for b in expected[name])
    report["clips"][name]={"ground_min":lowest}
    assert lowest>-.001,(name,"ground penetration",lowest)
    if clip["loop_seconds"]:
        scene.frame_set(count+1);last=old.bounds(meshes)
        seam=max(abs(a-b) for p,q in zip(expected[name][0],last) for a,b in zip(p,q))
        assert seam<1e-5,(name,seam)
        report["clips"][name]["source_loop_seam"]=seam
    action=bpy.data.actions[name]
    for curve in old.curves(action):
        for key in list(curve.keyframe_points):
            if key.co.x>count:curve.keyframe_points.remove(key)
    action.use_frame_range=True;action.frame_start=1;action.frame_end=count

rig.animation_data.action=bpy.data.actions["Idle"];scene.frame_set(1)
select([rig,root,mesh]);path=HERE/"crow-combat.glb";export(path,True)
document,binary=old.read_glb(path)
assert len(document["skins"])==1
assert {a["name"] for a in document["animations"]}==set(info["clips"])
assert not document.get("cameras") and not document.get("extensionsRequired")
assert all("Studio" not in n.get("name","") for n in document["nodes"])
assert all("uri" not in i for i in document.get("images",[]))
for animation in document["animations"]:
    clip=info["clips"][animation["name"]]
    last=max(old.accessor(document,binary,s["input"])[-1][0] for s in animation["samplers"])
    assert abs(last-clip["last_key_seconds"])<1e-6
report["bytes"]=path.stat().st_size
assert report["bytes"]<500_000,report["bytes"]
report["sha256"]=hashlib.sha256(path.read_bytes()).hexdigest()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps=info["fps"]
bpy.ops.import_scene.gltf(filepath=str(path),disable_bone_shape=True)
rigs=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
assert len(rigs)==1
rig=rigs[0];meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
assert old.weights(meshes,rig)<=4
assert "weapon_grip" in rig.data.bones
for name,clip in info["clips"].items():
    rig.animation_data.action=bpy.data.actions[name]
    error=0
    for frame in range(clip["samples"]):
        bpy.context.scene.frame_set(frame)
        current=old.bounds(meshes)
        error=max(error,max(abs(a-b) for p,q in zip(expected[name][frame],current) for a,b in zip(p,q)))
    assert error<3e-4,(name,error)
    report["clips"][name]["round_trip_bounds_error"]=error
rig.data.pose_position="REST";bpy.context.view_layer.update()
assert max(abs(a-b) for p,q in zip(rest,old.bounds(meshes)) for a,b in zip(p,q))<3e-4
(HERE/"model-info.json").write_text(json.dumps(info,indent=2)+"\n")
(HERE/"verification.json").write_text(json.dumps(report,indent=2)+"\n")
print("COMBAT_VERIFIED",json.dumps(report))
