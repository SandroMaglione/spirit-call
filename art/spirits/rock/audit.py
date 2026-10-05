"""Check the delivered GLB itself, rather than trusting export metadata."""
import json
import struct
from pathlib import Path

HERE=Path(__file__).resolve().parent
raw=(HERE/"rock-spirit.glb").read_bytes()
magic,version,length=struct.unpack_from("<III",raw)
assert magic==0x46546C67 and version==2 and length==len(raw),"invalid GLB header"
json_length,kind=struct.unpack_from("<II",raw,12)
assert kind==0x4E4F534A,"first GLB chunk is not JSON"
gltf=json.loads(raw[20:20+json_length])
assert not gltf.get("animations") and not gltf.get("skins"),"static asset contains animation or skinning"
assert not gltf.get("cameras") and "KHR_lights_punctual" not in gltf.get("extensionsUsed",[]),"export includes review helpers"
assert all(not b.get("uri") for b in gltf["buffers"]),"external buffers"
assert not gltf.get("images"),"unexpected textures"
assert "KHR_draco_mesh_compression" not in gltf.get("extensionsUsed",[]),"decoder required"
expected={"RockSpirit","TopRock","Foot.L","Foot.R","Float.L","Float.R","Eye.L","Eye.R","FaceInset"}
assert {n["name"] for n in gltf["nodes"]}==expected,"missing or extra part"
primitives=[p for m in gltf["meshes"] for p in m["primitives"]]
assert all(p.get("mode",4)==4 for p in primitives),"non-triangle primitive"
triangles=sum(gltf["accessors"][p["indices"]]["count"]//3 for p in primitives)
info=json.loads((HERE/"export.json").read_text())
assert triangles==info["triangles"] and triangles<5000,"triangle budget or metadata mismatch"
assert len(gltf["materials"])==3,"material budget"
result={"triangles":triangles,"materials":len(gltf["materials"]),"mesh_primitives":len(primitives),"nodes":len(gltf["nodes"]),"bytes":len(raw),"animations":0,"skins":0,"textures":0,"external_buffers":0,"cameras":0,"lights":0}
(HERE/"glb-audit.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result))
