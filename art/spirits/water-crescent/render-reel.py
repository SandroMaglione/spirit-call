"""Render all ten exported-source clips into a temporary frame sequence."""
import json
import math
import tempfile
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
# Reuse the approved review camera, lights, and animation source.
exec(compile((HERE / "render-animation.py").read_text().split("poses = {")[0],
             str(HERE / "render-animation.py"), "exec"))
OUT = Path(tempfile.gettempdir()) / "water-crescent-animation-reel"
OUT.mkdir(exist_ok=True)
scene.render.resolution_x = 560
scene.render.resolution_y = 560
camera.data.ortho_scale = 1.12
if hasattr(scene.eevee, "taa_render_samples"):
    scene.eevee.taa_render_samples = 16
metadata = json.loads((HERE / "animation.json").read_text())
frames = []
fps = 24
for clip,timing in metadata["clips"].items():
    seconds = 2.4 if clip == "Idle" else 1.6 if clip == "Run" else 1.4
    for index in range(round(seconds*fps)):
        time = index / fps
        frame = time*30
        if timing["loopSeconds"] is not None:
            frame %= timing["loopSeconds"]*30
        else:
            frame = min(frame,timing["lastKeySeconds"]*30)
        # Interpolate the source's sampled object keys, like the GLB player.
        f0 = math.floor(frame)
        fraction = frame-f0
        a = animate.apply_frame(clip,f0,base)
        b = animate.apply_frame(clip,f0+1,base)
        for name in animate.NAMES:
            for prop in a[name]:
                value = tuple(x+(y-x)*fraction for x,y in zip(a[name][prop],b[name][prop]))
                setattr(bpy.data.objects[name],prop,value)
        bpy.context.view_layer.update()
        path = OUT / f"raw-{len(frames):04d}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        frames.append({"clip":clip,"time":time,"path":str(path)})
(OUT / "frames.json").write_text(json.dumps({"fps":fps,"frames":frames,
    "sha256":metadata["sha256"],"source":"Animated Blender object keys; game-player contacts verified separately."},indent=2)+"\n")
print("Rendered",len(frames),"frames to",OUT)
