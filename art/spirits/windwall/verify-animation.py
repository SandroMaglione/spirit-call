"""Audit the actual animated binary, including sampled world-space poses."""
import hashlib
import json
import math
import struct
from pathlib import Path
import numpy as np

HERE=Path(__file__).resolve().parent
EXPECTED={'Idle','Run','AttackA','AttackB','AttackC','Power','Dash','Hurt','Cast','Ultimate'}

class GLB:
    def __init__(self,path):
        raw=path.read_bytes();magic,version,total=struct.unpack_from('<4sII',raw)
        assert magic==b'glTF' and version==2 and total==len(raw)
        n,kind=struct.unpack_from('<II',raw,12);assert kind==0x4E4F534A
        self.doc=json.loads(raw[20:20+n]);self.binary=raw[28+n:]
    def values(self,index):
        a=self.doc['accessors'][index];v=self.doc['bufferViews'][a['bufferView']]
        dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
        width={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
        return np.ndarray((a['count'],width),dtype=dtype,buffer=self.binary,
            offset=v.get('byteOffset',0)+a.get('byteOffset',0),
            strides=(v.get('byteStride',dtype.itemsize*width),dtype.itemsize)).astype(float)
    def pose(self,clip=None,time=0):
        nodes=self.doc['nodes']
        props=[{'translation':np.array(n.get('translation',[0,0,0]),float),
                'rotation':np.array(n.get('rotation',[0,0,0,1]),float),
                'scale':np.array(n.get('scale',[1,1,1]),float)} for n in nodes]
        if clip:
            for channel in clip['channels']:
                sampler=clip['samplers'][channel['sampler']]
                ts=self.values(sampler['input'])[:,0];vs=self.values(sampler['output'])
                i=max(0,min(len(ts)-2,int(np.searchsorted(ts,time,side='right')-1)))
                u=float(np.clip((time-ts[i])/(ts[i+1]-ts[i]),0,1)) if len(ts)>1 else 0
                a=vs[i];b=vs[min(i+1,len(ts)-1)]
                path=channel['target']['path']
                if path=='rotation':
                    dot=float(np.dot(a,b))
                    if dot<0:b=-b;dot=-dot
                    if dot<.9995:
                        angle=math.acos(min(1,dot))
                        value=(a*math.sin((1-u)*angle)+b*math.sin(u*angle))/math.sin(angle)
                    else:value=a+(b-a)*u
                    value/=np.linalg.norm(value)
                else:value=a+(b-a)*u
                props[channel['target']['node']][path]=value
        local=[]
        for n,p in zip(nodes,props):
            if 'matrix' in n:local.append(np.array(n['matrix']).reshape(4,4).T);continue
            x,y,z,w=p['rotation']
            rotation=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
            m=np.eye(4);m[:3,:3]=rotation@np.diag(p['scale']);m[:3,3]=p['translation'];local.append(m)
        world={}
        def visit(index,parent):
            world[index]=parent@local[index]
            for child in nodes[index].get('children',[]):visit(child,world[index])
        for index in self.doc['scenes'][self.doc.get('scene',0)]['nodes']:visit(index,np.eye(4))
        return world
    def points(self,world):
        points={}
        for i,n in enumerate(self.doc['nodes']):
            if 'mesh' not in n:continue
            mesh=self.doc['meshes'][n['mesh']]
            vertices=np.concatenate([self.values(p['attributes']['POSITION']) for p in mesh['primitives']])
            points[mesh['name']]=(world[i]@np.column_stack([vertices,np.ones(len(vertices))]).T).T[:,:3]
        return points

static=GLB(HERE/'windwall.glb');animated=GLB(HERE/'windwall-animated.glb')
doc=animated.doc;metadata=json.loads((HERE/'animation-export.json').read_text())
assert len(doc['meshes'])==12 and len(doc['materials'])==3
assert not doc.get('skins') and not doc.get('cameras') and not doc.get('textures')
assert not doc.get('images') and 'KHR_lights_punctual' not in doc.get('extensionsUsed',[])
assert 'KHR_draco_mesh_compression' not in doc.get('extensionsUsed',[])
assert len(doc['buffers'])==1 and 'uri' not in doc['buffers'][0]
assert len(doc['animations'])==10 and {c['name'] for c in doc['animations']}==EXPECTED
assert doc['materials']==static.doc['materials']
before=static.points(static.pose());rest=animated.pose();after=animated.points(rest)
assert before.keys()==after.keys()
for name in before:assert np.allclose(before[name],after[name],atol=1e-6),name
meshes={m['name']:m for m in doc['meshes']};triangles=0
for original in static.doc['meshes']:
    new=meshes[original['name']]
    for a,b in zip(original['primitives'],new['primitives'],strict=True):
        assert a['attributes'].keys()==b['attributes'].keys()
        for channel in a['attributes']:
            assert np.allclose(static.values(a['attributes'][channel]),animated.values(b['attributes'][channel]),atol=1e-6)
        assert np.array_equal(static.values(a['indices']),animated.values(b['indices']))
        triangles+=len(animated.values(b['indices']))//3
assert triangles==416
root=next(i for i,n in enumerate(doc['nodes']) if n['name']=='Windwall')
motion=next(i for i,n in enumerate(doc['nodes']) if n['name']=='Windwall.Motion')
reports={}
for clip in doc['animations']:
    timing=metadata['clips'][clip['name']];duration=timing['lastKeySeconds']
    assert not any(c['target']['node']==root for c in clip['channels'])
    for sampler in clip['samplers']:
        assert sampler.get('interpolation','LINEAR')=='LINEAR'
        ts=animated.values(sampler['input'])[:,0];vs=animated.values(sampler['output'])
        assert np.isfinite(vs).all() and np.all(np.diff(ts)>0)
        assert abs(ts[0])<1e-6 and abs(ts[-1]-duration)<1e-6
    if timing['loopSeconds'] is None:
        for time in (0,duration):
            pose=animated.pose(clip,time)
            assert all(np.allclose(pose[i],rest[i],atol=1e-6) for i in rest),clip['name']
    minimum=math.inf;gap=math.inf
    for time in np.linspace(0,duration,max(2,math.ceil(duration*120)+1)):
        world=animated.pose(clip,time);points=animated.points(world)
        minimum=min(minimum,min(p[:,1].min() for p in points.values()))
        inverse=np.linalg.inv(world[motion])
        def relative(name):
            p=points[name]
            return (inverse@np.column_stack([p,np.ones(len(p))]).T).T[:,:3]
        # glTF's forward axis is +Z, converted from Blender's -Y.
        separation=relative('Gem')[:,2].min()-relative('Body')[:,2].max()
        gap=min(gap,separation)
        assert np.allclose(world[root],np.eye(4),atol=1e-7)
        if clip['name'] in ('Idle','Run'):
            assert abs(world[motion][0,3])<1e-7 and abs(world[motion][2,3])<1e-7
    assert minimum>.015, f'{clip["name"]}: below floor'
    assert gap>.009, f'{clip["name"]}: crystal touches chest'
    if clip['name'] in ('Cast','Ultimate'):
        assert animated.pose(clip,2/30)[motion][1,3]>.09
    reports[clip['name']]={'seconds':duration,'channels':len(clip['channels']),
        'min_height_m':minimum,'min_crystal_gap_m':gap,'returns_to_rest':timing['loopSeconds'] is None}
info={'passed':True,'sample_rate_hz':120,'triangles':triangles,'materials':3,'clips':reports,
      'approved_geometry_and_palette_preserved':True,'root_motion':False,
      'glb_sha256':hashlib.sha256((HERE/'windwall-animated.glb').read_bytes()).hexdigest()}
(HERE/'animation-verification.json').write_text(json.dumps(info,indent=2)+'\n')
print(json.dumps(info,indent=2))
