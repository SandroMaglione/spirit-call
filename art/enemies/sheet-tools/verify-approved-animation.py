"""Round-trip every clip, check attack continuity and preserve approved rest geometry."""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path
import bpy
from mathutils import Matrix

ROOT=Path(__file__).resolve().parents[1]

def bounds(mesh):
    evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    points=[evaluated.matrix_world@v.co for v in evaluated.data.vertices]
    assert all(math.isfinite(n) for v in points for n in v)
    return [min(v[i] for v in points) for i in range(3)]+[max(v[i] for v in points) for i in range(3)]

def sample(rig,mesh,clips,start):
    result={}
    for name,spec in clips.items():
        rig.animation_data.action=bpy.data.actions[name];poses=[]
        for frame in range(round(spec['lastKeySeconds']*30)+1):
            bpy.context.scene.frame_set(start+frame);poses.append(bounds(mesh))
            root=rig.pose.bones['root'].matrix_basis
            assert max(abs(root[i][j]-Matrix.Identity(4)[i][j]) for i in range(4) for j in range(4))<1e-6
        result[name]=poses
    return result

def verify(kind):
    here=ROOT/kind/'production';folder=here/'animated'
    info=json.loads((folder/'model-info.json').read_text());audit=json.loads((here/'audit.json').read_text())
    data=(folder/(kind+'.glb')).read_bytes();size=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+size])
    assert len(gltf['meshes'])==len(gltf['skins'])==len(gltf['materials'])==1
    assert len(gltf['meshes'][0]['primitives'])==1
    assert not gltf.get('cameras') and not gltf.get('extensionsRequired')
    assert 'KHR_lights_punctual' not in gltf.get('extensionsUsed',[])
    assert info['triangles']==audit['triangles']<2000 and info['bones']<=12
    assert set(info['clips'])=={a['name'] for a in gltf['animations']}
    bpy.ops.wm.open_mainfile(filepath=str(folder/(kind+'.blend')))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    source=sample(rig,mesh,info['clips'],1)
    feet={}
    if kind=='sniper':
        for name in ('Run','Windup','Active','Recovery'):
            rig.animation_data.action=bpy.data.actions[name]
            error=0
            for frame in range(round(info['clips'][name]['lastKeySeconds']*30)+1):
                bpy.context.scene.frame_set(frame+1)
                for side in ('L','R'):
                    bone=rig.pose.bones['foot.'+side]
                    rotation=bone.matrix.to_quaternion().rotation_difference(bone.bone.matrix_local.to_quaternion())
                    error=max(error,rotation.angle)
            feet[name]=error
        assert max(feet.values())<1e-5,feet
    def matrices(name,frame):
        rig.animation_data.action=bpy.data.actions[name];bpy.context.scene.frame_set(frame)
        return {b.name:b.matrix.copy() for b in rig.pose.bones}
    def difference(a,b):return max(abs(a[n][i][j]-b[n][i][j]) for n in a for i in range(4) for j in range(4))
    contacts={}
    for suffix in ('',)+({'charger':('Swipe',),'guardian':('Thrust',)}.get(kind,())):
        contacts['windup_active'+suffix]=difference(matrices('Windup'+suffix,31),matrices('Active'+suffix,1))
        contacts['active_recovery'+suffix]=difference(matrices('Active'+suffix,13),matrices('Recovery'+suffix,1))
        contacts['recovery_idle'+suffix]=difference(matrices('Recovery'+suffix,22),matrices('Idle',1))
    assert max(contacts.values())<1e-6,contacts
    for name,spec in info['clips'].items():
        if spec['loopSeconds'] is not None:
            rig.animation_data.action=bpy.data.actions[name];bpy.context.scene.frame_set(round(spec['loopSeconds']*30)+1)
            assert max(abs(a-b) for a,b in zip(source[name][0],bounds(mesh)))<1e-5
    rig.animation_data.action=None;rig.data.pose_position='REST';bpy.context.view_layer.update()
    rest=bounds(mesh);expected=[axis[0] for axis in audit['bounds_blender_m']]+[axis[1] for axis in audit['bounds_blender_m']]
    assert max(abs(a-b) for a,b in zip(rest,expected))<1e-6
    assert abs(info['height']-audit['height_m'])<1e-6
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30
    bpy.ops.import_scene.gltf(filepath=str(folder/(kind+'.glb')))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    imported=sample(rig,mesh,info['clips'],0)
    errors={name:max(abs(a-b) for left,right in zip(source[name],imported[name]) for a,b in zip(left,right)) for name in source}
    assert max(errors.values())<5e-4,(errors,source['Idle'][0],imported['Idle'][0],mesh.name,rig.name)
    ground={name:min(p[2] for p in poses) for name,poses in source.items()}
    assert min(v for name,v in ground.items() if name!='Death')>-.0001,ground
    report={'sha256':hashlib.sha256(data).hexdigest(),'triangles':info['triangles'],'bones':info['bones'],
        'material_count':1,'mesh_count':1,'root_motion':False,'approved_rest_bounds_preserved':True,
        'roundTripBoundsError':errors,'contactPoseErrors':contacts,'groundMinimum':ground,
        'flatFootRotationErrorRadians':feet,'result':'passed'}
    (folder/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

for kind in sys.argv[sys.argv.index('--')+1:]:verify(kind)
