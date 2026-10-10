"""Audit the delivered GLB's geometry, static contract and coordinates."""
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
raw = (HERE/"quarry.glb").read_bytes()
magic,version,length = struct.unpack_from("<III",raw)
assert magic == 0x46546c67 and version == 2 and length == len(raw)
json_length,kind = struct.unpack_from("<II",raw,12)
assert kind == 0x4e4f534a
gltf = json.loads(raw[20:20+json_length])
bin_offset = 20+json_length+8
assert not gltf.get("animations") and not gltf.get("skins")
assert not gltf.get("cameras") and "KHR_lights_punctual" not in gltf.get("extensionsUsed",[])
assert not gltf.get("images") and not gltf.get("textures")
assert all(not buffer.get("uri") for buffer in gltf["buffers"])
assert "KHR_draco_mesh_compression" not in gltf.get("extensionsUsed",[])
audit = json.loads((HERE/"audit.json").read_text())
assert hashlib.sha256(raw).hexdigest() == audit["quarry.glb_sha256"]
assert {node["name"] for node in gltf["nodes"]} == set(audit["objects"]) | {"Quarry"}
primitives = [p for m in gltf["meshes"] for p in m["primitives"]]
assert all(p.get("mode",4) == 4 for p in primitives)
assert all("COLOR_0" in p["attributes"] for p in primitives if gltf["materials"][p["material"]]["name"] != "Amber eyes")
triangles = sum(gltf["accessors"][p["indices"]]["count"]//3 for p in primitives)
assert triangles == audit["triangles"] and triangles < 5000
assert len(gltf["materials"]) == 2

def positions(index):
    accessor = gltf["accessors"][index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    offset = bin_offset + view.get("byteOffset",0) + accessor.get("byteOffset",0)
    assert accessor["componentType"] == 5126 and accessor["type"] == "VEC3"
    return np.ndarray((accessor["count"],3),dtype="<f4",buffer=raw,offset=offset,
                      strides=(view.get("byteStride",12),4)).copy()

def transform(node):
    matrix = np.eye(4)
    if "matrix" in node:
        return np.array(node["matrix"]).reshape((4,4),order="F")
    x,y,z,w = node.get("rotation",[0,0,0,1])
    matrix[:3,:3] = [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                      [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                      [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
    matrix[:3,:3] = matrix[:3,:3] @ np.diag(node.get("scale",[1,1,1]))
    matrix[:3,3] = node.get("translation",[0,0,0])
    return matrix

world = {}
def visit(index,parent):
    node = gltf["nodes"][index]
    matrix = parent @ transform(node)
    if "mesh" in node:
        parts = []
        for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
            p = positions(primitive["attributes"]["POSITION"])
            parts.append((matrix @ np.column_stack((p,np.ones(len(p)))).T).T[:,:3])
        world[node["name"]] = np.concatenate(parts)
    for child in node.get("children",[]):
        visit(child,matrix)
for index in gltf["scenes"][gltf.get("scene",0)]["nodes"]:
    visit(index,np.eye(4))
all_positions = np.concatenate(list(world.values()))
assert np.isfinite(all_positions).all()
bounds = [all_positions.min(axis=0).tolist(),all_positions.max(axis=0).tolist()]
assert abs(bounds[0][1]) < 1e-6, "Model does not stand at Y=0"
assert abs(bounds[1][1]-audit["height_m"]) < 1e-6
for name in ("Stone.Front.L","Stone.Front.R","Stone.Rear.L","Stone.Rear.R"):
    assert abs(world[name][:,1].min()) < 1e-6, f"{name} is not planted"
assert min(world["Eye.L"][:,2].min(),world["Eye.R"][:,2].min()) > .3, "Model does not face +Z"
result = {"passed":True,"triangles":triangles,"materials":len(gltf["materials"]),"parts":len(world),
          "bytes":len(raw),"bounds_gltf_m":bounds,"four_supports_grounded":True,"forward":"+Z",
          "animations":0,"skeletons":0,"textures":0,"external_buffers":0,"cameras":0,"lights":0}
(HERE/"glb-audit.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,indent=2))
