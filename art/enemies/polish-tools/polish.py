"""Gameplay-scale finishing pass over the authored animation sources.

Run after rebuilding the family recipe, never over an already polished source:
Blender --background --python-exit-code 1 --python polish.py -- KIND
Named static parts identify vertices; the editable animated .blend is the result.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[1]
DUMMY_KINDS = ('dummy', 'sparring-dummy', 'heavy-dummy')
sys.path.insert(0, str(ROOT/'scripts'))
from common import rgba, keep_off_floor

def center(mesh, indices):
    return sum((mesh.data.vertices[i].co for i in indices), Vector())/len(indices)

def finish(kind):
    here = ROOT/kind/'production'
    folder = ROOT/kind if kind in DUMMY_KINDS else here/'animated'
    bpy.ops.wm.open_mainfile(filepath=str(folder/(kind+'.blend')))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    mesh.data.calc_loop_triangles()
    base_triangles=len(mesh.data.loop_triangles)
    assert 'roster_polish' not in rig, 'Rebuild the family recipe before polishing again.'
    rig.animation_data.action = None
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    parts = {}
    if kind not in DUMMY_KINDS:
        source = here/json.loads((here/'spirit.json').read_text())['blend']
        with bpy.data.libraries.load(str(source), link=False) as (available, loaded):
            loaded.objects = available.objects
        for obj in loaded.objects: bpy.context.collection.objects.link(obj)
        bpy.context.view_layer.update()
        tree = KDTree(len(mesh.data.vertices))
        for v in mesh.data.vertices: tree.insert(v.co, v.index)
        tree.balance()
        used = set()
        for obj in loaded.objects:
            if obj.type != 'MESH': continue
            indices = []
            for v in obj.data.vertices:
                candidates = sorted(tree.find_range(obj.matrix_world@v.co, .00002), key=lambda hit: hit[2])
                found = next((i for _,i,_ in candidates if i not in used), None)
                assert found is not None, (kind,obj.name,v.index)
                indices.append(found)
                used.add(found)
            parts[obj.name] = indices
        for obj in loaded.objects: bpy.data.objects.remove(obj, do_unlink=True)
        assert len(used) == len(mesh.data.vertices), (kind,len(used),len(mesh.data.vertices))

    colors = mesh.data.color_attributes['Color']
    def scale_part(name, scale, offset=(0,0,0)):
        indices = parts[name]
        pivot = center(mesh, indices)
        for i in indices:
            v = mesh.data.vertices[i]
            delta = v.co-pivot
            v.co = pivot+Vector(tuple(delta[a]*scale[a]+offset[a] for a in range(3)))
    def recolor(name, color):
        indices = set(parts[name])
        for loop in mesh.data.loops:
            if loop.vertex_index in indices: colors.data[loop.index].color = rgba(color)

    # Enlarge features whose thin silhouette disappears at the game camera.
    if kind == 'shooter':
        for side,sign in [('L',-1),('R',1)]:
            indices = parts['Eye.'+side]
            pivot = center(mesh,indices)
            for i in indices:
                v=mesh.data.vertices[i]
                v.co.x = pivot.x+(v.co.x-pivot.x)*1.6
                v.co.z = pivot.z+(v.co.z-pivot.z)*.65+sign*(v.co.x-pivot.x)*.45
    if kind == 'swarmer':
        pivot=center(mesh,parts['RedShell'])
        for name in ('RedShell','BackSpike','ShellSpike.L','ShellSpike.R'):
            for i in parts[name]:
                vertex=mesh.data.vertices[i];delta=vertex.co-pivot
                vertex.co=pivot+Vector((delta.x*1.08,delta.y*1.02,delta.z*.80))
    if kind == 'sniper':
        recolor('HeadAndPrecisionBarrel','#6c5487')
        for side in ('L','R'):
            for name in ('Shin.','Ankle.','Foot.'):
                scale_part(name+side,(1.32,1.18,1))
            recolor('Shin.'+side,'#51415f')
            recolor('ShoulderPlate.'+side,'#8263a2')
            scale_part('Eye.'+side,(1.1,1.4,1.4),(0,0,.006))
            recolor('Eye.'+side,'#ffe18c')
            scale_part('AngryBrow.'+side,(1,1,.70))
    if kind == 'stalker':
        recolor('Pointed head','#65427c')
        recolor('Thorax','#44344f')
        for side in ('L','R'):
            recolor('Arm blade.'+side,'#8e78a3')
            recolor('Shoulder.'+side,'#77548c')
    if kind == 'charger':
        recolor('ClothBody','#9f6850')
        recolor('BombBackpack','#423b38')
        recolor('RecessedFace','#242025')
        scale_part('PackFrontCrack',(1.5,1,1.5))
    if kind == 'juggernaut':
        # Lower the high back frame; the helmet and eyes must read over it.
        scale_part('HunchedBack',(1,1,.87),(0,0,-.035))
        for side in ('L','R'):
            recolor('FaceRecess.'+side,'#211f22')
            recolor('Brow.'+side,'#b5aa93')
        # Six tiny knuckle caps cost more than the new functional joints.
        import bmesh
        remove = {i for name,indices in parts.items() if name.startswith('Knuckle.') for i in indices}
        bm=bmesh.new();bm.from_mesh(mesh.data);bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm,geom=[bm.verts[i] for i in remove],context='VERTS')
        bm.to_mesh(mesh.data);bm.free()
        # Named indices no longer apply after the topology change.
        parts = {}
    if kind == 'warden':
        recolor('FaceRecess','#162b30')
        scale_part('Staff cyan crystal',(1.15,1.15,1.12))
    if kind == 'guardian':
        recolor('Breastplate','#58616a')
        for side in ('L','R'): recolor('Visor.'+side,'#252b31')
    if kind == 'gale-caster':
        for side in ('L','R'): recolor('FaceVoid.'+side,'#172c2c')

    def detail(name, at, size, color, luminous=False):
        # A faceted octahedron, cheap enough for features visible at phone scale.
        vertices=[Vector(at)+Vector((size[0]*x,size[1]*y,size[2]*z))
            for x,y,z in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]]
        faces=[(4,a,b) for a,b in [(0,2),(2,1),(1,3),(3,0)]]+[(5,b,a) for a,b in [(0,2),(2,1),(1,3),(3,0)]]
        data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
        obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
        obj.data.materials.append(mesh.data.materials[0])
        attr=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for value in attr.data:value.color=rgba(color)
        attr=data.attributes.new('_GLOW','FLOAT','POINT')
        for value in attr.data:value.value=1 if luminous else 0
        obj.vertex_groups.new(name='body').add(list(range(6)),1,'REPLACE')
        bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);obj.select_set(True)
        bpy.context.view_layer.objects.active=mesh;bpy.ops.object.join()

    colors = mesh.data.color_attributes['Color']
    glow = mesh.data.attributes.get('_GLOW')
    if glow: mesh.data.attributes.remove(glow)
    glow = mesh.data.attributes.new('_GLOW','FLOAT','POINT')
    luminous = ('Eye.','EyeCore.','Staff cyan crystal','StaffCore','FlameCore',
        'BombEmberCore','PackFrontCrack','BackpackCrack','Flame inner light','Mouth fissure','Muzzle')
    for name,indices in parts.items():
        if name.startswith(luminous):
            for i in indices: glow.data[i].value=1
    # Juggernaut's topology changed. Its eye palette is separate from dull gold.
    if kind == 'juggernaut':
        for loop in mesh.data.loops:
            r,g,b,_ = colors.data[loop.index].color
            if r>.8 and g>.5 and b<.45: glow.data[loop.vertex_index].value=1
    if kind == 'volatile':
        # The shell is built from inset stone islands on a connected lava core.
        # Shrink each stone island around its own center to widen the fissures.
        import bmesh
        bm=bmesh.new();bm.from_mesh(mesh.data)
        layer=bm.loops.layers.color.get('Color') or bm.loops.layers.float_color.get('Color')
        islands=[];visited=set()
        for v in bm.verts:
            if v in visited: continue
            stack=[v];island=set()
            while stack:
                p=stack.pop()
                if p in island:continue
                island.add(p);visited.add(p)
                stack.extend(e.other_vert(p) for e in p.link_edges if e.other_vert(p) not in island)
            islands.append(island)
        for island in islands:
            values=[loop[layer] for v in island for loop in v.link_loops]
            # Dark convex blocks only; preserve lava, feet and flame.
            pivot=sum((v.co for v in island),Vector())/len(island)
            if .25<pivot.z<1.45 and len(island)<60 and values and max(c[0] for c in values)<.65:
                for v in island: v.co=pivot+(v.co-pivot)*.75
        bm.to_mesh(mesh.data);bm.free()
        glow=mesh.data.attributes['_GLOW'];colors=mesh.data.color_attributes['Color']
        for loop in mesh.data.loops:
            r,g,b,_=colors.data[loop.index].color
            if r>.7 and g>.12 and b<.25: glow.data[loop.vertex_index].value=1

    if kind in ('shooter','charger'):
        indices=parts['ShooterBody' if kind=='shooter' else 'ClothBody']
        bounds=[(min(mesh.data.vertices[i].co[a] for i in indices),max(mesh.data.vertices[i].co[a] for i in indices)) for a in range(3)]
        pivot=center(mesh,indices)
        if kind=='shooter':
            for side in (-1,1):
                for level in (-1,1):
                    detail('Ivory body stud',(side*bounds[0][1]*.62,bounds[1][0]+(bounds[1][1]-bounds[1][0])*.18,
                        pivot.z+level*(bounds[2][1]-bounds[2][0])*.18),(.055,.065,.055),'cream')
        else:
            at=(0,bounds[1][0]-.018,pivot.z-.055)
            detail('Belly core rim',at,(.12,.04,.12),'#d46b25')
            detail('Belly core',(at[0],at[1]-.035,at[2]),(.083,.027,.083),'#ffcb57',True)

    # Joint sleeves connect endpoints embedded in each adjoining rigid piece.
    # Each ring follows its endpoint bone: rotation and foot planting cannot
    # leave the sleeve behind. Armor stays rigid; there are no rubber elbows.
    groups={g.index:g.name for g in mesh.vertex_groups}
    owned={name:[] for name in groups.values()}
    for v in mesh.data.vertices:
        for g in v.groups:
            if g.weight>.5: owned[groups[g.group]].append(v.index)
    connections=[]
    for bone in rig.data.bones:
        child=bone.name
        if child in ('root','jaw','tail','flame') or (child=='body' and kind not in DUMMY_KINDS) or child.startswith(('scarf','ribbon')): continue
        if kind in ('stalker','volatile') and child.startswith('leg.'): continue # authored bridge rings already exist
        parent=bone.parent.name if bone.parent else 'body'
        if parent=='root' and child!='body':parent='body'
        if not owned.get(child) or not owned.get(parent):continue
        at=center(mesh,parts['Forearm.R']) if child=='shield' else bone.head_local
        def anchor(name):
            # Use the nearest solid component, rather than a distant decoration.
            candidates=owned[name]
            nearest=sorted(candidates,key=lambda i:(mesh.data.vertices[i].co-at).length)[:6]
            return center(mesh,nearest)
        a,b=anchor(parent),anchor(child)
        if (a-b).length<.012:continue
        radius=min(.08,max(.025,(a-b).length*.22))
        axis=(b-a).normalized()
        u=axis.cross(Vector((0,0,1)))
        if u.length<.1:u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u).normalized()
        verts=[point+radius*(math.cos(i*math.tau/4)*u+math.sin(i*math.tau/4)*v) for point in (a,b) for i in range(4)]
        faces=[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
        data=bpy.data.meshes.new('Joint sleeve');data.from_pydata(verts,[],faces);data.update()
        obj=bpy.data.objects.new('Connected '+child,data);bpy.context.collection.objects.link(obj)
        obj.data.materials.append(mesh.data.materials[0])
        attr=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for value in attr.data:value.color=rgba('#433b40' if kind in ('chaser','stalker','juggernaut') else '#605858')
        data.attributes.new('_GLOW','FLOAT','POINT')
        obj.vertex_groups.new(name=parent).add(list(range(4)),1,'REPLACE')
        obj.vertex_groups.new(name=child).add(list(range(4,8)),1,'REPLACE')
        connections.append({'bone':child,'parent':parent,'anchors':[list(a),list(b)],'radius':radius})
        bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);obj.select_set(True)
        bpy.context.view_layer.objects.active=mesh;bpy.ops.object.join()

    mesh.data.calc_loop_triangles()
    assert len(mesh.data.loop_triangles)<2000,(kind,len(mesh.data.loop_triangles))
    assert len(mesh.data.materials)==1 and len(rig.data.bones)<=12
    # Small secondary recoil follows projectile release, with zero offsets at
    # both boundaries so Windup/Active/Recovery still share contact poses.
    rig.data.pose_position='POSE'
    for action in bpy.data.actions:
        rig.animation_data.action=action
        last=int(action.frame_range[1])
        for frame in range(1,last+1):
            bpy.context.scene.frame_set(frame)
            if action.name=='Spawn':
                for bone in rig.pose.bones:
                    bone.location=(0,0,0);bone.rotation_euler=(0,0,0);bone.scale=(1,1,1)
                    if bone.name=='root':
                        size=.6+.4*math.sin(math.pi*(frame-1)/max(1,last-1)/2)
                        bone.scale=(size,size,size)
                    for channel in ('location','rotation_euler','scale'):
                        bone.keyframe_insert(data_path=channel,frame=frame,group=bone.name)
            if kind=='sniper' and action.name.startswith('Recovery'):
                recoil=math.sin(math.pi*(frame-1)/max(1,last-1))*math.exp(-3*(frame-1)/max(1,last-1))
                bone=rig.pose.bones['head']
                bone.location += bone.bone.matrix_local.to_3x3().transposed()@Vector((0,.09*recoil,0))
                bone.keyframe_insert(data_path='location',frame=frame,group=bone.name)
            if kind=='gale-caster' and action.name!='Death':
                bone=rig.pose.bones['body']
                bone.location += bone.bone.matrix_local.to_3x3().transposed()@Vector((0,0,.10))
                bone.keyframe_insert(data_path='location',frame=frame,group=bone.name)
    keep_off_floor(rig,mesh)
    rig['roster_polish']=1
    rig.data.pose_position='POSE'
    rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/(kind+'.blend')))
    report={'kind':kind,'triangles':len(mesh.data.loop_triangles),'bones':len(rig.data.bones),
        'materials':1,'joint_sleeves':connections,'luminous_vertices':sum(v.value>0 for v in mesh.data.attributes['_GLOW'].data)}
    (folder/'polish-info.json').write_text(json.dumps(report,indent=2)+'\n')
    rig_path=folder/'rig-info.json'
    rig_info=json.loads(rig_path.read_text()) if rig_path.exists() else {}
    rig_info.update({'base_triangles':base_triangles,'triangles':report['triangles'],
        'bones':report['bones'],'materials':1,'mesh_objects':1,'root_motion':False,
        'rest_vertices_preserved':False,'finishing_recipe':'art/enemies/polish-tools/polish.py',
        'finishing_audit':'polish-info.json'})
    rig_path.write_text(json.dumps(rig_info,indent=2)+'\n')
    print('POLISHED',json.dumps(report))

def export(kind):
    folder=ROOT/kind if kind in DUMMY_KINDS else ROOT/kind/'production/animated'
    bpy.ops.wm.open_mainfile(filepath=str(folder/(kind+'.blend')))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    clips=json.loads(rig['clips'])
    rig.animation_data.action=None;rig.data.pose_position='REST';bpy.context.view_layer.update()
    points=[mesh.matrix_world@v.co for v in mesh.data.vertices]
    assert min(p.z for p in points)>=-1e-5
    height=max(p.z for p in points)
    for v in mesh.data.vertices:
        assert 1<=len(v.groups)<=4 and abs(sum(g.weight for g in v.groups)-1)<1e-5
    rig.data.pose_position='POSE'
    for name,spec in clips.items():
        action=bpy.data.actions[name];last=round(spec['lastKeySeconds']*30)+1
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in list(curve.keyframe_points):
                            if key.co.x>last:curve.keyframe_points.remove(key)
        action.use_frame_range=True;action.frame_start=1;action.frame_end=last
    rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=rig
    path=folder/(kind+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
        export_cameras=False,export_lights=False,export_extras=False,export_animations=True,
        export_animation_mode='ACTIONS',export_force_sampling=True,export_anim_slide_to_zero=True,
        export_frame_range=False,export_optimize_animation_size=False,export_skins=True,
        export_all_influences=False,export_influence_nb=4,export_attributes=True)
    mesh.data.calc_loop_triangles()
    info={'height':height,'height_basis':'ground origin to highest polished rest vertex',
        'triangles':len(mesh.data.loop_triangles),'bones':len(rig.data.bones),'bytes':path.stat().st_size,'clips':clips}
    (folder/'model-info.json').write_text(json.dumps(info,indent=2)+'\n')
    content_id={'gale-caster':'galeCaster','sparring-dummy':'sparringDummy','heavy-dummy':'heavyDummy'}.get(kind,kind)
    module=ROOT.parents[1]/'src/presentation/assets/enemies'/(kind+'.ts')
    module.write_text('// Generated by art/enemies/polish-tools/polish.py.\n'
        +'import url from "../../../../'+path.relative_to(ROOT.parents[1]).as_posix()+'?url"\n'
        +'import type { ModelSpec } from "../../models.ts"\n\n'
        +'export const '+content_id+'Model = { url,'+json.dumps({'height':height,'clips':clips},indent=2)[1:]+' satisfies ModelSpec\n')
    print('EXPORTED',kind,json.dumps(info))

if __name__=='__main__':
    kind=sys.argv[sys.argv.index('--')+1]
    finish(kind);export(kind)
