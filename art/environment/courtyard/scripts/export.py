"""Export the saved, potentially manually edited sources without rebuilding them."""
import hashlib
import json
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "source/courtyard.blend"
bpy.ops.wm.open_mainfile(filepath=str(source))
assets = sorted((o for o in bpy.context.scene.objects if "asset_id" in o), key=lambda o: o["asset_id"])
manifest = {
    "schema_version": 1, "stage": "courtyard-kit-v1", "units": "meters",
    "up": "+Y", "forward": "+Z", "source": "source/courtyard.blend",
    "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "material": "Opaque rough vertex colors; one shared material; no textures or extensions required",
    "integration": "Presentation assets only. Simulation owns collision and game-unit conversion.",
    "assets": [],
}
for obj in assets:
    assert obj.type == "MESH" and not obj.modifiers, f"Apply modifiers before export: {obj.name}"
    assert all(abs(s - 1) < 1e-6 for s in obj.scale), f"Apply scale before export: {obj.name}"
    assert all(abs(a) < 1e-6 for a in obj.rotation_euler), f"Apply rotation before export: {obj.name}"
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # Library display placement never leaks into an individual runtime asset.
    obj.location = (0, 0, 0)
    obj.rotation_euler = (0, 0, 0)
    obj.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    path = ROOT / "models" / (obj["asset_id"] + ".glb")
    path.parent.mkdir(exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
        export_yup=True, export_animations=False, export_cameras=False, export_lights=False,
        export_texcoords=False, export_normals=True, export_materials="EXPORT",
        export_vertex_color="NAME", export_vertex_color_name="Color", export_all_vertex_colors=False)
    points = [(v.co.x, v.co.z, -v.co.y) for v in obj.data.vertices]
    lower = [min(p[i] for p in points) for i in range(3)]
    upper = [max(p[i] for p in points) for i in range(3)]
    obj.data.calc_loop_triangles()
    manifest["assets"].append({
        "id": obj["asset_id"], "file": str(path.relative_to(ROOT)), "purpose": obj["purpose"],
        "origin": obj["origin_note"], "bounds_m": {"min": lower, "max": upper},
        "dimensions_m": [upper[i] - lower[i] for i in range(3)],
        "footprint_xz_m": list(obj["footprint_m"]),
        "triangles": len(obj.data.loop_triangles), "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "collision": json.loads(obj["collision_json"]) if "collision_json" in obj else None,
        "sockets": json.loads(obj["sockets_json"]) if "sockets_json" in obj else {},
    })
(ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("EXPORTED", len(assets), "assets; source file unchanged")
