"""Sample the delivered GLB, including between keys and across loop seams."""
import copy
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
FEET = ("Stone.Front.L","Stone.Rear.R","Stone.Front.R","Stone.Rear.L")


class Asset:
    def __init__(self,path):
        self.raw = path.read_bytes()
        magic,version,length = struct.unpack_from("<III",self.raw)
        assert magic == 0x46546c67 and version == 2 and length == len(self.raw)
        size,kind = struct.unpack_from("<II",self.raw,12)
        assert kind == 0x4e4f534a
        self.gltf = json.loads(self.raw[20:20+size])
        self.offset = 28+size

    def data(self,index):
        a = self.gltf["accessors"][index]
        v = self.gltf["bufferViews"][a["bufferView"]]
        n = {"SCALAR":1,"VEC3":3,"VEC4":4}[a["type"]]
        assert a["componentType"] == 5126
        return np.ndarray((a["count"],n),dtype="<f4",buffer=self.raw,
            offset=self.offset+v.get("byteOffset",0)+a.get("byteOffset",0),
            strides=(v.get("byteStride",n*4),4)).copy()

    def world(self,nodes):
        result = {}
        self.transforms = {}
        def visit(i,parent):
            n = nodes[i]
            x,y,z,w = n.get("rotation",[0,0,0,1])
            m = np.eye(4)
            m[:3,:3] = np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]) @ np.diag(n.get("scale",[1,1,1]))
            m[:3,3] = n.get("translation",[0,0,0])
            if "matrix" in n:
                m = np.array(n["matrix"]).reshape(4,4,order="F")
            m = parent @ m
            self.transforms[n["name"]] = m
            if "mesh" in n:
                parts = []
                for p in self.gltf["meshes"][n["mesh"]]["primitives"]:
                    xyz = self.data(p["attributes"]["POSITION"])
                    parts.append((m @ np.column_stack([xyz,np.ones(len(xyz))]).T).T[:,:3])
                result[n["name"]] = np.concatenate(parts)
            for child in n.get("children",[]):
                visit(child,m)
        for i in self.gltf["scenes"][self.gltf.get("scene",0)]["nodes"]:
            visit(i,np.eye(4))
        return result

    def sample(self,animation,time,loop=None):
        nodes = copy.deepcopy(self.gltf["nodes"])
        for channel in animation["channels"]:
            sampler = animation["samplers"][channel["sampler"]]
            assert sampler.get("interpolation","LINEAR") == "LINEAR"
            times = self.data(sampler["input"])[:,0].astype(float)
            values = self.data(sampler["output"]).astype(float)
            if loop is not None:
                times = np.append(times,loop)
                values = np.concatenate([values,values[:1]])
            i = min(max(0,int(np.searchsorted(times,time,side="right"))-1),len(times)-2)
            u = np.clip((time-times[i])/(times[i+1]-times[i]),0,1)
            a,b = values[i],values[i+1]
            path = channel["target"]["path"]
            if path == "rotation":
                dot = float(a@b)
                if dot < 0:
                    b = -b
                    dot = -dot
                angle = np.arccos(np.clip(dot,-1,1))
                value = a*(1-u)+b*u if dot > .9995 else (np.sin((1-u)*angle)*a+np.sin(u*angle)*b)/np.sin(angle)
                value /= np.linalg.norm(value)
            else:
                value = a*(1-u)+b*u
            nodes[channel["target"]["node"]][path] = value.tolist()
        return self.world(nodes)


asset = Asset(HERE/"quarry-animated.glb")
g = asset.gltf
meta = json.loads((HERE/"animation.json").read_text())
assert hashlib.sha256(asset.raw).hexdigest() == meta["animated_glb_sha256"]
assert hashlib.sha256((HERE/"quarry.blend").read_bytes()).hexdigest() == meta["static_source_sha256"]
assert len(g["materials"]) == 2 and len(g["meshes"]) == 17
assert not g.get("skins") and not g.get("cameras") and not g.get("images")
assert "KHR_lights_punctual" not in g.get("extensionsUsed",[])
assert all(not b.get("uri") for b in g["buffers"])
assert {a["name"] for a in g["animations"]} == set(meta["clips"])
triangles = sum(g["accessors"][p["indices"]]["count"]//3 for m in g["meshes"] for p in m["primitives"])
assert triangles == meta["triangles"] and triangles < 2000
static = Asset(HERE/"quarry.glb")
rest = asset.world(g["nodes"])
static_rest = static.world(static.gltf["nodes"])
for name,points in rest.items():
    if name not in FEET and not name.startswith("Joint."):
        assert np.allclose(points,static_rest[name],atol=1e-6), f"Approved torso geometry changed: {name}"

results = {}
for animation in g["animations"]:
    name = animation["name"]
    timing = meta["clips"][name]
    duration = timing["loopSeconds"] or timing["lastKeySeconds"]
    for channel in animation["channels"]:
        node = g["nodes"][channel["target"]["node"]]
        assert node["name"] != "Quarry", "Root motion"
        times = asset.data(animation["samplers"][channel["sampler"]]["input"])[:,0]
        assert abs(times[0]) < 1e-6 and abs(times[-1]-timing["lastKeySeconds"]) < 1e-6
    min_ground = 100
    min_support = 4
    min_gap = 100
    max_lift = 0
    joint_error = 0
    samples = []
    for t in np.linspace(0,duration,round(duration*240)+1):
        world = asset.sample(animation,t,timing["loopSeconds"])
        points = np.concatenate(list(world.values()))
        assert np.isfinite(points).all()
        ground = float(points[:,1].min())
        min_ground = min(min_ground,ground)
        assert ground > -.0001, f"{name} penetrates ground at {t}: {ground}"
        soles = [float(world[f][:,1].min()) for f in FEET]
        support = sum(abs(y) < .0001 for y in soles)
        min_support = min(min_support,support)
        window = meta["airborneWindows"].get(name)
        deliberate_jump = window is not None and window[0] < t < window[1]
        assert support >= 2 or deliberate_jump, f"{name} is unsupported outside its jump at {t}: {soles}"
        for foot,anchors in meta["jointAnchors"].items():
            convert = lambda p: np.array([p[0],p[2],-p[1],1])
            a = asset.transforms["Torso"] @ convert(anchors["body"])
            b = asset.transforms[foot] @ convert(anchors["leg"])
            joint = asset.transforms[anchors["name"]]
            start = joint @ np.array([0,-.5,0,1])
            end = joint @ np.array([0,.5,0,1])
            error = max(np.linalg.norm(start-a),np.linalg.norm(end-b))
            joint_error = max(joint_error,error)
            assert error < .003, f"Joint detached in {name} at {t}: {foot}, {error}"
        max_lift = max(max_lift,*soles)
        gap = float(world["FloatRock"][:,1].min()-world["MossCap"][:,1].max())
        min_gap = min(min_gap,gap)
        assert gap > .035, f"Floating rock overlaps moss in {name}: {gap}"
        samples.append(world)
    if timing["loopSeconds"] is not None:
        for part in rest:
            assert np.allclose(samples[0][part],samples[-1][part],atol=1e-6), f"{name} seam: {part}"
    else:
        for part in rest:
            assert np.allclose(samples[0][part],rest[part],atol=1e-6), f"{name} starts off rest: {part}"
            assert np.allclose(samples[-1][part],rest[part],atol=1e-6), f"{name} ends off rest: {part}"
    results[name] = {"duration_s":duration,"sample_rate_hz":240,
        "minimum_supports":min_support,"minimum_ground_y_m":min_ground,
        "maximum_sole_lift_m":max_lift,"minimum_float_moss_gap_m":min_gap,
        "maximum_joint_endpoint_error_m":joint_error}
    if name == "Run":
        assert max_lift > .09
        errors = []
        for f in FEET:
            offset = 0 if f in FEET[:2] else .5
            for t in np.linspace(0,duration,193,endpoint=False):
                phase = (t/duration+offset)%1
                if .01 < phase < meta["gait"]["stanceFraction"]-.01:
                    a = asset.sample(animation,t,duration)[f].mean(axis=0)
                    b = asset.sample(animation,t+.0001,duration)[f].mean(axis=0)
                    errors.append(abs((b[2]-a[2])/.0001+meta["gait"]["travelMetersPerSecond"]))
        assert max(errors) < .0001, f"Planted sole slides relative to travel: {max(errors)}"
        results[name]["maximum_stance_velocity_error_m_s"] = max(errors)
report = {"passed":True,"clips":results,"triangles":triangles,"materials":2,
          "approved_torso_geometry_unchanged":True,"articulated_legs":True,"root_motion":False}
(HERE/"animation-audit.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
