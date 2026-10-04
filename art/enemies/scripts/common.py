"""Small authored creature kit. Blender 4.5; meters, Z up, -Y forward.

Recipes own silhouettes. This module owns palette, rig, action export and checks.
Rebuilding refuses to replace an editable source unless --replace is explicit.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[1]
FPS = 30
PALETTE = {
    'ink': '#242738', 'cream': '#f2dfaf', 'eye': '#ffecc0', 'pupil': '#222331',
    'rust': '#a24c35', 'orange': '#d9874c', 'hide': '#75615c', 'wood': '#795035',
    'gold': '#bd9055', 'jade': '#579184', 'stone': '#7d8891', 'darkstone': '#485462',
    'purple': '#765776', 'pink': '#d4898a', 'blue': '#769eaf', 'leaf': '#8d9b53',
}

def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

def rgba(name):
    value = PALETTE.get(name, name).lstrip('#')
    return (*[linear(int(value[i:i+2], 16)/255) for i in (0, 2, 4)], 1)

class Creature:
    def __init__(self, kind, joints):
        self.kind = kind
        self.folder = ROOT / kind
        self.folder.mkdir(exist_ok=True)
        if (self.folder / (kind + '.blend')).exists() and '--replace' not in sys.argv:
            raise RuntimeError('Source exists. Export it, or explicitly rebuild with --replace.')
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.parts = []
        self.joints = {'root': ((0, 0, 0), None), **joints}
        mat = bpy.data.materials.new('Enemy palette | vertex colors')
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value = .82
        color = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        color.layer_name = 'Color'
        mat.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
        self.material = mat

    def finish_part(self, name, bone, color):
        obj = bpy.context.object
        obj.name = name
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.data.materials.clear()
        obj.data.materials.append(self.material)
        colors = obj.data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for item in colors.data:
            item.color = rgba(color)
        group = obj.vertex_groups.new(name=bone)
        group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        self.parts.append(obj)
        return obj

    def ellipsoid(self, name, at, size, color, bone='body', segments=12, rings=6):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=at)
        bpy.context.object.scale = size
        return self.finish_part(name, bone, color)

    def box(self, name, at, size, color, bone='body', bevel=.07, rotation=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=at, rotation=rotation)
        obj = bpy.context.object
        obj.scale = size
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        mod = obj.modifiers.new('Broad edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
        return self.finish_part(name, bone, color)

    def taper(self, name, start, end, radius, tip, color, bone='body', sides=8):
        a, b = Vector(start), Vector(end)
        bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius, radius2=tip, depth=(b-a).length, location=(a+b)/2)
        bpy.context.object.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
        return self.finish_part(name, bone, color)

    def eyes(self, y, z, spread, radius=.075, bone='head'):
        for sign in (-1, 1):
            self.ellipsoid('Eye', (sign*spread, y, z), (radius, radius*.45, radius*1.12), 'eye', bone, 8, 4)
            self.ellipsoid('Pupil', (sign*spread, y-radius*.4, z), (radius*.32, radius*.2, radius*.65), 'pupil', bone, 8, 4)

    def rig(self):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in self.parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = self.parts[0]
        bpy.ops.object.join()
        mesh = bpy.context.object
        mesh.name = self.kind + ' | palette mesh'
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        armature = bpy.data.armatures.new(self.kind + ' bones')
        rig = bpy.data.objects.new(self.kind + ' rig', armature)
        bpy.context.collection.objects.link(rig)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='EDIT')
        for name, (at, parent) in self.joints.items():
            bone = armature.edit_bones.new(name)
            bone.head = at
            bone.tail = Vector(at) + Vector((0, 0, .18))
            if parent:
                bone.parent = armature.edit_bones[parent]
        bpy.ops.object.mode_set(mode='OBJECT')
        mesh.parent = rig
        modifier = mesh.modifiers.new('Creature deformation', 'ARMATURE')
        modifier.object = rig
        for bone in rig.pose.bones:
            bone.rotation_mode = 'XYZ'
        rig.animation_data_create()
        self.mesh, self.armature = mesh, rig

    def animate(self, pose):
        """Recipes return local bone transforms at normalized action time."""
        self.rig()
        clips = {'Idle': (2, True), 'Run': (.6, True), 'Windup': (1, False),
                 'Active': (.4, False), 'Recovery': (.7, False), 'Hurt': (.3, False),
                 'Death': (.7, False), 'Spawn': (.3, False)}
        if self.kind == 'dummy':
            clips = {k: v for k, v in clips.items() if k in ('Idle', 'Hurt', 'Death', 'Spawn')}
        self.clips = {}
        for name, (seconds, loop) in clips.items():
            action = bpy.data.actions.new(name)
            action.use_fake_user = True
            self.armature.animation_data.action = action
            count = round(seconds * FPS)
            for frame in range(count + 1):
                t = frame / count
                transforms = pose(name, t)
                for bone in self.armature.pose.bones:
                    rotation, location, scale = transforms.get(bone.name, ((0, 0, 0), (0, 0, 0), (1, 1, 1)))
                    # Pose channels use the bone's axes, not Blender's world axes.
                    basis = bone.bone.matrix_local.to_3x3()
                    bone.rotation_euler = (basis.transposed() @ Euler(rotation).to_matrix() @ basis).to_euler()
                    bone.location = basis.transposed() @ Vector(location)
                    bone.scale = (scale[0], scale[2], scale[1])
                    for attr in ('rotation_euler', 'location', 'scale'):
                        bone.keyframe_insert(data_path=attr, frame=frame+1, group=bone.name)
            self.clips[name] = {'lastKeySeconds': (count-1)/FPS if loop else seconds, 'loopSeconds': seconds if loop else None}
        self.armature.animation_data.action = bpy.data.actions['Idle']
        scene = bpy.context.scene
        scene.render.fps = FPS
        scene.frame_set(1)
        scene.frame_end = 60
        self.armature['clips'] = json.dumps(self.clips)
        self.armature['enemy_kind'] = self.kind
        bpy.ops.wm.save_as_mainfile(filepath=str(self.folder / (self.kind + '.blend')))

def keep_off_floor(rig, mesh):
    """Lift any part whose pose dips under the floor, on the frame it dips.

    Recipes pose in broad strokes (a lean, a lunge, a swinging leg); this
    measures the posed mesh and raises each bone hanging off the root (the
    body, each leg) by what its own vertices went under, so big motion never
    sinks into the ground. The same pose gets the same lift, so
    Windup -> Active -> Recovery stay continuous. Death is left to sink.
    """
    scene = bpy.context.scene
    owner = {}
    for bone in rig.data.bones:
        top = bone
        while top.parent is not None and top.parent.name != 'root':
            top = top.parent
        owner[bone.name] = top.name
    groups = {group.index: group.name for group in mesh.vertex_groups}
    carried = {}
    for vertex in mesh.data.vertices:
        carried.setdefault(owner[groups[vertex.groups[0].group]], []).append(vertex.index)
    carried.pop('root', None)
    for action in bpy.data.actions:
        if action.name == 'Death':
            continue
        rig.animation_data.action = action
        for frame in range(1, int(action.frame_range[1]) + 1):
            scene.frame_set(frame)
            posed = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            lows = {name: min((posed.matrix_world @ posed.data.vertices[i].co).z for i in indices) for name, indices in carried.items()}
            for name, low in lows.items():
                if low < -.001:
                    pose_bone = rig.pose.bones[name]
                    basis = pose_bone.bone.matrix_local.to_3x3()
                    pose_bone.location = pose_bone.location + basis.transposed() @ Vector((0, 0, -low))
                    pose_bone.keyframe_insert(data_path='location', frame=frame, group=name)
    rig.animation_data.action = bpy.data.actions['Idle']
    scene.frame_set(1)

def transform(rotation=(0, 0, 0), location=(0, 0, 0), scale=(1, 1, 1)):
    return rotation, location, scale

def motion(style, action, t):
    """Shared movement vocabulary; distinct attack arcs and mass by anatomy."""
    s = math.sin(t * math.tau)
    c = math.cos(t * math.tau)
    heavy = style in ('brute', 'guardian')
    data = {}
    if action == 'Idle':
        data['body'] = transform((0, .02*s, 0), (0, 0, .018*(1-c)))
        data['head'] = transform((.025*s, 0, .045*s))
        data['jaw'] = transform((.04*(1-c), 0, 0))
        data['tail'] = transform((0, 0, .09*s))
    elif action == 'Run':
        bounce = abs(s) * (.035 if heavy else .09)
        data['body'] = transform((.08 if heavy else .2, .035*s, .035*s), (0, 0, bounce))
        data['head'] = transform((-.06, 0, -.03*s))
        for side, sign in (('L', 1), ('R', -1)):
            data['leg.'+side] = transform((0, 0, 0), (0, .14*s*sign, .14*max(0, s*sign)))
            data['back.'+side] = transform((0, 0, 0), (0, -.13*s*sign, .12*max(0, -s*sign)))
            data['arm.'+side] = transform((.28*s*sign, 0, .06*sign))
        data['tail'] = transform((0, .08*s, .18*s))
    elif action in ('Windup', 'Active', 'Recovery'):
        # The active clip starts on contact. The windup ends on that same pose.
        if action == 'Windup':
            ready = math.sin(min(1, t/.72)*math.pi/2)
            strike = max(0, (t-.82)/.18)
        elif action == 'Active':
            ready, strike = 1, 1
        else:
            ready, strike = (1-t)**2, (1-t)**2
        if style in ('chaser', 'guardian'):
            data['body'] = transform((.06*strike, 0, -.35*ready+.65*strike))
            data['arm.R'] = transform((-.6*ready+.9*strike, -.4*ready, -.95*ready+1.65*strike))
            data['head'] = transform((0, 0, .18*ready-.3*strike))
            data['arm.L'] = transform((-.2*ready, 0, .15*ready))
        elif style in ('shooter', 'sniper'):
            # Keep the muzzle forward throughout tracking and the final aim lock.
            data['body'] = transform((-.12*ready+.3*strike, 0, 0))
            data['head'] = transform((.12*ready-.3*strike, 0, 0))
            data['jaw'] = transform((.3*ready-.23*strike, 0, 0), (0, -.1*ready, 0), (1+.12*ready, 1, 1+.12*ready))
            for side in ('L', 'R'):
                data['arm.'+side] = transform((-.5*ready, 0, 0))
        elif style == 'brute':
            data['body'] = transform((-.2*ready+.62*strike, 0, 0), (0, 0, .12*ready-.08*strike))
            data['head'] = transform((.1*ready-.3*strike, 0, 0))
            for side in ('L', 'R'):
                data['arm.'+side] = transform((-2.35*ready+1.8*strike, 0, 0))
        elif style == 'charger':
            data['body'] = transform((.16*ready, 0, 0), (0, 0, -.025*ready))
            data['head'] = transform((.22*ready, 0, 0))
            if action == 'Active':
                data.update({key: value for key, value in motion(style, 'Run', t*2).items() if key.startswith(('leg.', 'back.'))})
                data['body'] = transform((.16, 0, .015*s), (0, 0, .035*abs(s)))
        elif style == 'swarmer':
            data['body'] = transform((-.2*ready+.55*strike, 0, 0), (0, 0, .07*strike), (1+.18*ready, 1+.1*strike, 1-.14*ready))
            data['jaw'] = transform((.45*ready-.4*strike, 0, 0))
    elif action == 'Hurt':
        recoil = math.sin(t*math.pi)*(1-t)
        data['body'] = transform((-.3*recoil, .12*recoil, 0))
        data['head'] = transform((.18*recoil, 0, 0))
    elif action == 'Death':
        # Fold into a compact silhouette, then disappear through a small scale.
        fall = math.sin(t*math.pi/2)
        size = max(.02, 1-max(0, (t-.55)/.45))
        data['body'] = transform((.7*fall, 0, .45*fall), (0, 0, -.12*fall), (size, size, size))
        for bone in ('leg.L', 'leg.R', 'back.L', 'back.R'):
            data[bone] = transform(scale=(size, size, size))
    elif action == 'Spawn':
        size = .6+.4*math.sin(t*math.pi/2)
        data['body'] = transform(location=(0, 0, .1*math.sin(t*math.pi)), scale=(size, size, size))
    return data

def export(kind, folder=None):
    """Export the saved source. Never save over manual Blender edits."""
    folder = ROOT / kind if folder is None else folder
    bpy.ops.wm.open_mainfile(filepath=str(folder / (kind+'.blend')))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    clips = json.loads(rig['clips'])
    rig.animation_data.action = None
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    vertices = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
    height = max(v.z for v in vertices)
    mesh.data.calc_loop_triangles()
    triangles = len(mesh.data.loop_triangles)
    assert min(v.z for v in vertices) >= -1e-5
    assert triangles < 5000
    assert len(mesh.data.materials) == 1
    assert all(len(v.groups) == 1 and abs(v.groups[0].weight-1) < 1e-6 for v in mesh.data.vertices)
    rig.data.pose_position = 'POSE'
    for name, info in clips.items():
        action = bpy.data.actions[name]
        last = round(info['lastKeySeconds']*FPS)+1
        # Blender 4.5 actions use channel bags, one slot for the armature.
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in list(curve.keyframe_points):
                            if key.co.x > last:
                                curve.keyframe_points.remove(key)
        action.use_frame_range = True
        action.frame_start, action.frame_end = 1, last
    rig.animation_data.action = bpy.data.actions['Idle']
    bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = folder / (kind+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_yup=True, export_cameras=False, export_lights=False, export_extras=False,
        export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_anim_slide_to_zero=True, export_frame_range=False, export_optimize_animation_size=False,
        export_skins=True, export_all_influences=False, export_influence_nb=4,
        # Custom vertex attributes (`_GLOW`: vertices that shine, see the enemy shader).
        export_attributes=True)
    info = {'height': height, 'triangles': triangles, 'bones': len(rig.data.bones),
            'bytes': path.stat().st_size, 'clips': clips}
    (folder/'model-info.json').write_text(json.dumps(info, indent=2)+'\n')
    module = ROOT.parents[1] / 'src/presentation/assets/enemies' / (kind+'.ts')
    module.parent.mkdir(exist_ok=True)
    module.write_text('// Generated from the saved Blender source by art/enemies/scripts/common.py.\n'
        + 'import url from "../../../../'+path.relative_to(ROOT.parents[1]).as_posix()+'?url"\n'
        + 'import type { ModelSpec } from "../../models.ts"\n\n'
        + 'export const '+kind+'Model = { url,'+json.dumps({'height': height, 'clips': clips}, indent=2)[1:]+' satisfies ModelSpec\n')
    print('ENEMY_EXPORTED', kind, json.dumps(info))

def render(kind):
    folder = ROOT / kind
    bpy.ops.wm.open_mainfile(filepath=str(folder/(kind+'.blend')))
    scene = bpy.context.scene
    rig = next(o for o in scene.objects if o.type == 'ARMATURE')
    rig.animation_data.action = bpy.data.actions['Idle']
    scene.frame_set(1)
    mesh = next(o for o in scene.objects if o.type == 'MESH')
    height = max(v.co.z for v in mesh.data.vertices)
    bpy.ops.object.camera_add(location=(height*2.8, -height*4.4, height*3.1))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, height*.48))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = height*1.65
    scene.camera = camera
    for at, energy, size in [((3,-4,6), 750, 5), ((-3,-1,3), 450, 4), ((1,4,5), 850, 3)]:
        bpy.ops.object.light_add(type='AREA', location=at)
        lamp = bpy.context.object
        lamp.data.energy = energy
        lamp.data.shape = 'DISK'
        lamp.data.size = size
        lamp.rotation_euler = (Vector((0,0,height*.5))-lamp.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.world = bpy.data.worlds.new('Neutral studio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.09,.105,.12,1)
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x, scene.render.resolution_y = 640, 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(folder/'reference.png')
    bpy.ops.render.render(write_still=True)

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--')+1:]
    {'export': export, 'render': render}[args[0]](args[1])
