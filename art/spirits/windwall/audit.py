"""Validate the delivered binary, independently of Blender's scene metadata."""
import hashlib
import json
import struct
from pathlib import Path
import numpy as np

HERE=Path(__file__).resolve().parent
raw=(HERE/'windwall.glb').read_bytes()
magic,version,total=struct.unpack_from('<4sII',raw)
assert magic==b'glTF' and version==2 and total==len(raw)
n,kind=struct.unpack_from('<II',raw,12)
assert kind==0x4E4F534A
doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
assert len(doc['buffers'])==1 and 'uri' not in doc['buffers'][0]
assert not doc.get('animations') and not doc.get('skins') and not doc.get('cameras')
assert not doc.get('images') and not doc.get('textures')
assert 'KHR_lights_punctual' not in doc.get('extensionsUsed',[])
assert 'KHR_draco_mesh_compression' not in doc.get('extensionsUsed',[])
assert len(doc['materials'])==3
assert len(doc['meshes'])==12
names={m['name'] for m in doc['meshes']}
assert 'Gem' in names and 'Gem.Frame' not in names
assert not any(name.startswith('Collar.') for name in names)
types={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
dtypes={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}
def accessor(index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    dtype=np.dtype(dtypes[a['componentType']]);width=types[a['type']]
    stride=v.get('byteStride',dtype.itemsize*width)
    return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=offset,strides=(stride,dtype.itemsize))

triangles=0;records=[]
for mesh in doc['meshes']:
    count=0
    for primitive in mesh['primitives']:
        assert primitive.get('mode',4)==4
        assert 'COLOR_0' in primitive['attributes'],mesh['name']
        colors=accessor(primitive['attributes']['COLOR_0'])
        assert np.isfinite(colors).all()
        count+=len(accessor(primitive['indices']))//3
    triangles+=count;records.append({'name':mesh['name'],'triangles':count,'vertex_colors':True})
assert triangles<5000 and triangles==json.loads((HERE/'export.json').read_text())['triangles']
info={'passed':True,'triangles':triangles,'materials':3,'meshes':records,'animations':0,'skins':0,
      'cameras':0,'lights':0,'textures':0,'embedded_buffer':True,'compression':False,
      'glb_sha256':hashlib.sha256(raw).hexdigest()}
(HERE/'glb-audit.json').write_text(json.dumps(info,indent=2)+'\n')
print(json.dumps(info,indent=2))
