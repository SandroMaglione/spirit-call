"""Check physical joins in the saved static model using mesh surfaces and interiors."""
import hashlib
import json
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE/'crusher-behemoth-model.blend'))
bpy.context.view_layer.update()
parts={}
for o in bpy.data.objects:
    if o.type=='MESH':
        verts=[o.matrix_world@v.co for v in o.data.vertices]
        tree=BVHTree.FromPolygons(verts,[list(p.vertices) for p in o.data.polygons])
        parts[o.name]=(verts,tree)


def inside(point, tree):
    direction=Vector((.813,.321,.486)).normalized()
    origin=point.copy();hits=0
    for _ in range(100):
        location,_,_,distance=tree.ray_cast(origin,direction)
        if location is None:return hits%2==1
        hits+=1;origin=location+direction*.0001
    raise AssertionError('Ray did not leave the mesh')


def joined(a,b):
    va,ta=parts[a];vb,tb=parts[b]
    if ta.overlap(tb):return 'intersecting surfaces'
    if inside(va[0],tb) or inside(vb[0],ta):return 'contained solid'
    return None


expected=[('StoneTorso','Waist'),('Waist','Pelvis'),('StoneTorso','Helmet'),
          ('StoneTorso','LowerKeystone')]
for side in ('L','R'):
    expected.extend((a+(('.'+side) if a!='StoneTorso' and a!='Pelvis' else ''),b+'.'+side)
        for a,b in [('StoneTorso','ShoulderJoint'),('ShoulderJoint','Pauldron'),
                    ('Pauldron','Forearm'),('Forearm','WristArmor'),('WristArmor','WristLink'),
                    ('WristLink','FistShell'),('Pelvis','Thigh'),('Thigh','Shin'),
                    ('Shin','Foot'),('Shin','Knee'),('Shin','ShinGuard'),('Shin','KneeBinding')])
joins=[{'a':a,'b':b,'contact':joined(a,b)} for a,b in expected]
missing=[j for j in joins if not j['contact']]
report={'result':'failed' if missing else 'passed',
        'glb_sha256':hashlib.sha256((HERE/'crusher-behemoth-model.glb').read_bytes()).hexdigest(),
        'method':'Triangle intersection or solid containment, without bounding-box contact assumptions',
        'structural_joins':joins,'missing_joins':missing,
        'scope':'Load-bearing body, pelvis, shoulders, arms, fists, legs and attached leg armor. Face color patches and inset jewel surfaces are reviewed separately.'}
(HERE/'connections.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
assert not missing,missing
