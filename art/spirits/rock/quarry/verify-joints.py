"""Check actual triangle intersections in the editable animation, including subframes."""
import json
from pathlib import Path
import bpy
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE/"quarry-animated.blend"))
meta = json.loads((HERE/"animation.json").read_text())
feet = tuple(meta["jointAnchors"])
body = ("BodyCore","MossCap","Head","RearStone")
objects = [o for o in bpy.data.objects if o.animation_data]
report = {}
def tree(name):
    obj = bpy.data.objects[name]
    return BVHTree.FromPolygons([obj.matrix_world@v.co for v in obj.data.vertices],
        [p.vertices for p in obj.data.polygons],all_triangles=False)

for clip,timing in meta["clips"].items():
    for obj in objects:
        for track in obj.animation_data.nla_tracks:
            track.mute = track.name != clip
    duration = timing["loopSeconds"] or timing["lastKeySeconds"]
    collisions = []
    # The omitted loop key has the same pose as frame zero; verify the
    # closing interpolation separately in the exported GLB sampler.
    fps = meta["sampleRateHz"]
    end = round(timing["lastKeySeconds"]*fps)
    for sample in range(round(end*2)+1):
        frame = sample/2
        bpy.context.scene.frame_set(int(frame),subframe=frame%1)
        bpy.context.view_layer.update()
        bodies = {name:tree(name) for name in body}
        for name in feet:
            foot = tree(name)
            for target,bvh in bodies.items():
                pairs = foot.overlap(bvh)
                if pairs:
                    collisions.append({"frame":frame,"leg":name,"body":target,"triangles":len(pairs)})
    report[clip] = {"sample_rate_hz":fps*2,"intersections":collisions}
(HERE/"joint-audit.json").write_text(json.dumps(report,indent=2)+"\n")
failures = {name:data["intersections"][:3] for name,data in report.items() if data["intersections"]}
print(json.dumps({"passed":not failures,"failures":failures},indent=2))
assert not failures, "Leg stone intersects main body"
