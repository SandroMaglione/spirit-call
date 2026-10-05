"""Export the static review asset, preserving the editable rest source."""
import hashlib
import json
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE/"rock-spirit.blend"))
out=HERE/"rock-spirit.glb"
bpy.ops.export_scene.gltf(filepath=str(out),export_format="GLB",export_apply=True,
    export_vertex_color="ACTIVE",export_animations=False,export_cameras=False,export_lights=False)
audit=json.loads((HERE/"audit.json").read_text())
metadata={**audit,"bytes":out.stat().st_size,"source_sha256":hashlib.sha256((HERE/"rock-spirit.blend").read_bytes()).hexdigest(),"glb_sha256":hashlib.sha256(out.read_bytes()).hexdigest(),"clips":{}}
(HERE/"export.json").write_text(json.dumps(metadata,indent=2)+"\n")
print(json.dumps(metadata))
