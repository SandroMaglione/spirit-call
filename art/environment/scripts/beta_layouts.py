"""Four editable art layouts per setting, with reserved combat floors and connectors."""
import math
from beta_specs import KIT_IDS
from pipeline import camera, clone


def assemble(kit_id, kit, assets, manifest, new_scene, open_parts):
    scenes, layouts = [], []
    theme_index = KIT_IDS.index(kit_id)
    specs = {a['id']: a for a in manifest['assets']}
    for variant, title in enumerate(kit['examples']):
        props = kit['scene_props'][variant]
        scene, ground = new_scene(kit['title'] + ' | ' + title, 18)
        placed = []

        def place(name, x, y, z=0, angle=0, opened=False):
            obj = clone(assets[name], scene, name + ' instance', (x, y, z), angle)
            if opened:
                open_parts(obj, name)
            placed.append({'asset': name, 'kit': kit_id, 'position_m': [x, z, -y],
                           'yaw_degrees': math.degrees(angle), 'open': opened})

        def edge_prop(name, x, y, z=0):
            # Preserve authored scale; move large landmarks outwards, never into the floor's core.
            ext = specs[name]['bounds_m']
            dx = max(abs(ext['min'][0]), abs(ext['max'][0]))
            dz = max(abs(ext['min'][2]), abs(ext['max'][2]))
            if abs(x) > 3:
                x = math.copysign(max(abs(x), 3.8 + dx), x)
            if abs(y) > 3:
                y = math.copysign(max(abs(y), 2.8 + dz), y)
            place(name, x, y, z)

        def floor(x, y, index=0):
            if kit['style'] == 'harbor' and y > 0:
                name = 'floor-deck'
            elif kit['style'] in ('quarry', 'fungal') and abs(x) >= 4:
                name = 'floor-rubble'
            elif (index + theme_index) % 7 == 0:
                name = 'floor-cracked'
            else:
                name = 'floor-plain'
            place(name, x, y)

        clear_areas = []
        if variant == 0:
            # Broad quest floor. The two diagonal corners vary by setting.
            for ix, x in enumerate(range(-6, 7, 2)):
                for iy, y in enumerate(range(-4, 5, 2)):
                    clipped = abs(x) == 6 and abs(y) == 4 and (ix + iy + theme_index) % 2 == 0
                    if not clipped:
                        floor(x, y, ix + iy)
            for x in (-4.4, -2.4, 2.4, 4.4):
                place('wall-straight', x, 4.85)
            for x in (-4, 0, 4):
                place('wall-low', x, -4.85)
            for x in (-6.7, 6.7):
                for y in (-2, 0, 2):
                    place('wall-low' if x > 0 else 'wall-straight', x, y, angle=math.pi / 2)
            place('arch-free', 0, 4.65)
            for x, y in [(-3.5, 2.6), (3.5, -2.6)]:
                place('pillar-broken', x, y)
            for name, x, y in zip(props, [-5, 5, -5, 5, -5], [2.5, 2.5, -2.5, -2.5, 0]):
                edge_prop(name, x, y)
            place('supply-cache', 5, 0)
            place('waymarker', -1.65, 4.65)
            clear_areas = [{'name': 'combat-core', 'bounds_xz_m': [-2.5, -2.5, 2.5, 2.5], 'height_m': 0}]
            reference = [0, 0, 1.5]
        elif variant == 1:
            for x in (-5, -3, 3, 5):
                for y in (-4, -2, 0, 2, 4):
                    floor(x, y)
            place('bridge-wide', 0, 0, angle=math.pi / 2)
            for y in (-2.12, 2.12):
                for x in (-1, 1):
                    place('railing-straight', x, y)
            for x in (-4, 4):
                place('wall-straight', x, 4.85)
                place('wall-low', x, -4.85)
            place('gate-wide', 4.8, 0, angle=math.pi / 2, opened=True)
            for name, x, y in zip(props, [-5, 5, -5, 5, -3, 3], [-3.2, -3.2, 3.2, 3.2, 3.8, -3.8]):
                edge_prop(name, x, y)
            place('beacon-idle', -5, 1.5)
            clear_areas = [{'name': 'crossing-deck', 'bounds_xz_m': [-1.8, -1.7, 1.8, 1.7], 'height_m': 0}]
            reference = [0, 0, .6]
        elif variant == 2:
            for ix, x in enumerate(range(-6, 7, 2)):
                for iy, y in enumerate(range(-4, 5, 2)):
                    floor(x, y, ix + iy)
            # Replace a plain centre flag with the radial model, rather than overlaying it.
            old = next(p for p in placed if p['position_m'] == [0, 0, 0])
            old['asset'] = 'floor-radial'
            # Remove just that clone and its meshes; source objects stay untouched.
            import bpy
            obj = next(o for o in scene.objects if o.type == 'EMPTY' and tuple(o.location) == (0, 0, 0))
            for child in list(obj.children_recursive):
                bpy.data.objects.remove(child, do_unlink=True)
            bpy.data.objects.remove(obj, do_unlink=True)
            clone(assets['floor-radial'], scene, 'floor-radial instance')
            for x in (-4.4, -2.4, 2.4, 4.4):
                place('wall-window' if abs(x) == 4.4 else 'wall-tall', x, 4.85)
            for x in (-6, 6):
                place('wall-short', x, 4.85)
            for x in (-6.85, 6.85):
                for y in (-4, -2, 0, 2):
                    place('wall-low' if y < 0 else 'wall-straight', x, y, angle=math.pi / 2)
            place('doorway', 0, 4.85, opened=True)
            for x in (-3.7, 3.7):
                for y in (-1.8, 1.8):
                    place('pillar-large', x, y)
            for name, x, y in zip(props, [-5.3, 5.3, -5.3, 5.3, -5.3], [-2.8, -2.8, 2.8, 2.8, 0]):
                edge_prop(name, x, y)
            place('seal-plinth', 5.2, 0)
            place('supply-cache-open', 2, 3.8)
            clear_areas = [{'name': 'encounter-core', 'bounds_xz_m': [-2.8, -2.8, 2.8, 2.8], 'height_m': 0}]
            reference = [0, 0, 1.7]
        else:
            for ix, x in enumerate(range(-6, 7, 2)):
                for iy, y in enumerate(range(-4, 5, 2)):
                    floor(x, y, ix + iy)
                place('platform', x, 4)
            for x in (-3, 3):
                place('stair-full', x, 1.8)
                for side in (-1.1, 1.1):
                    place('stair-rail', x + side, 1.8)
            for x in (-6, 0, 6):
                place('railing-straight', x, 3.12, 1.2)
            place('arch-free', 0, 4.3, 1.2)
            for x in (-6.8, 6.8):
                for y in (-3, -1, 1):
                    place('wall-low', x, y, angle=math.pi / 2)
            for name, x, y in zip(props, [-5.5, 5.5, -5.5, 5.5], [-2.5, -2.5, .8, .8]):
                edge_prop(name, x, y)
            place('beacon-active', -5.4, 4.1, 1.2)
            place('pillar-small', 5.4, 4.1, 1.2)
            clear_areas = [{'name': 'lower-combat-floor', 'bounds_xz_m': [-3, 1, 3, 4.3], 'height_m': 0}]
            reference = [0, 0, 2]
        camera(scene, (15, -21, 20), (0, .1, .6), 20.5, (1600, 1200))
        scenes.append(scene)
        layouts.append({'name': title, 'scene': scene.name, 'role': kit['roles'][variant],
                        'placements': placed, 'reserved_clear_areas': clear_areas,
                        'reference_position_m': reference,
                        'entry_points': [{'name': 'arrival', 'position_m': [0, 0, 3.5]}] if variant != 1 else
                                        [{'name': 'west', 'position_m': [-3, 0, 0]}, {'name': 'east', 'position_m': [3, 0, 0]}],
                        'runtime_note': 'Art assembly only. Enemy spawns, navigation, collisions and objectives need gameplay authoring.'})
    return scenes, layouts
