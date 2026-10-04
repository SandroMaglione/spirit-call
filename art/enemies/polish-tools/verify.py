"""Round-trip every exported frame and audit living floor clearance."""
import importlib.util
import json
import sys
import bpy
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('verify',ROOT/'scripts/verify.py')
verify=importlib.util.module_from_spec(spec);spec.loader.exec_module(verify)
for kind in sys.argv[sys.argv.index('--')+1:]:
    folder=ROOT/kind if kind=='dummy' else ROOT/kind/'production/animated'
    bpy.ops.wm.open_mainfile(filepath=str(folder/(kind+'.blend')))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    clips=json.loads(rig['clips'])
    def points(name,end=False):
        rig.animation_data.action=bpy.data.actions[name]
        bpy.context.scene.frame_set(round(clips[name]['lastKeySeconds']*30)+1 if end else 1)
        posed=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        return [posed.matrix_world@v.co for v in posed.data.vertices]
    contacts={}
    for name in clips:
        if not name.startswith('Windup'):continue
        suffix=name[len('Windup'):]
        active='Active'+suffix;recovery='Recovery'+suffix
        for a,b in [(name,active),(active,recovery)]:
            contacts[a+'→'+b]=max((x-y).length for x,y in zip(points(a,True),points(b)))
        if kind in ('shooter','sniper','warden','gale-caster') or (kind=='charger' and not suffix):
            contacts[name+'→'+recovery]=max((x-y).length for x,y in zip(points(name,True),points(recovery)))
    print('CONTACTS',kind,json.dumps(contacts))
    assert max(contacts.values(),default=0)<1e-5,(kind,contacts)
    verify.verify(kind,folder)
    report=json.loads((folder/'verification.json').read_text())
    assert min(value for name,value in report['groundMinimum'].items() if name!='Death')>=-.0011,(kind,report['groundMinimum'])
    assert report['triangles']<2000 and report['bones']<=12
    report['phaseBoundaryVertexError']=contacts
    (folder/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
