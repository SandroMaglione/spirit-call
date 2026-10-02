"""Combat silhouette and a closed feather grip, in the rig's rest space."""
import math

import bpy
from mathutils import Vector


def refine(meshes, collection, root, rig, ground, mesh):
    charcoal = bpy.data.materials['Wings | charcoal']
    # Taper the belly and beak without changing the recognisable head.
    for obj in meshes:
        if obj.name.startswith('Body'):
            for v in obj.data.vertices:
                belly = max(0, 1 - abs(v.co.z + ground - .8) / .55)
                v.co.x *= 1 - .07 * belly
                v.co.y *= 1 - .06 * belly
        if obj.name.startswith('Beak'):
            for v in obj.data.vertices:
                v.co.x *= .90
                v.co.y = -.235 + (v.co.y + .235) * 1.12
        if obj.name.startswith('Nape'):
            for v in obj.data.vertices:
                v.co.y = .09 + (v.co.y - .09) * .65

    def skin(obj):
        obj.parent = root
        obj.modifiers.new('Crow skin', 'ARMATURE').object = rig
        meshes.append(obj)
        return obj

    for label, side in [('L', -1), ('R', 1)]:
        for obj in list(meshes):
            if obj.name.startswith(f'Wing {label}'):
                meshes.remove(obj)
                bpy.data.objects.remove(obj, do_unlink=True)
        # Broad shoulder coverts taper into a narrow elbow. The forewing's
        # trailing edge is a feather fan rather than a cylindrical forearm.
        sections = [(.29,1.47,.14,.105),(.35,1.34,.16,.10),
                    (.42,1.17,.12,.075),(.475,1.01,.065,.065),
                    (.51,.91,.065,.06),(.59,.71,.07,.05),(.65,.55,.062,.047)]
        vertices, faces = [], []
        n = 10
        for x,z,width,depth in sections:
            for i in range(n):
                a = math.tau*i/n
                vertices.append((side*(x+width*math.cos(a)), -.045+depth*math.sin(a), z-ground))
        faces.append(tuple(reversed(range(n))))
        for k in range(len(sections)-1):
            for i in range(n):
                faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i))
        faces.append(tuple(range((len(sections)-1)*n,len(sections)*n)))
        obj = skin(mesh(f'Wing {label} | shoulder and wrist',vertices,faces,charcoal,collection))
        for p in obj.data.polygons:
            p.use_smooth = True

        outline = [(.48,1.03),(.66,.95),(.82,.78),(.94,.54),(.90,.48),
                   (.81,.58),(.82,.43),(.76,.40),(.68,.55),(.66,.47),(.60,.55),(.53,.81)]
        center = Vector((.67,.72))
        vertices = [(side*x,-.045,z-ground) for x,z in outline]
        for depth in [-.065,.055]:
            for x,z in outline:
                p = Vector((x,z)).lerp(center,.60)
                vertices.append((side*p.x,-.045+depth,p.y-ground))
        n = len(outline)
        faces = []
        for i in range(n):
            j = (i+1)%n
            faces.extend([(i,j,n+j,n+i),(i,2*n+i,2*n+j,j)])
        faces.extend([tuple(range(n,2*n)),tuple(reversed(range(2*n,3*n)))])
        skin(mesh(f'Wing {label} | flight feathers',vertices,faces,charcoal,collection))

    # The hilt runs along Z here. Closed C-shaped digits wrap its cross
    # section; their open side meets the palm. No floating socket beads.
    center = Vector((.65,-.06,.48-ground))
    def tube(name, points, radius):
        vertices, faces = [], []
        sides = 6
        for i, point in enumerate(points):
            tangent = Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
            rotation = tangent.to_track_quat('Z','Y')
            for j in range(sides):
                a = math.tau*j/sides
                vertices.append(Vector(point)+rotation@Vector((radius*math.cos(a),radius*math.sin(a),0)))
        faces.append(tuple(reversed(range(sides))))
        for k in range(len(points)-1):
            for i in range(sides):
                faces.append((k*sides+i,k*sides+(i+1)%sides,(k+1)*sides+(i+1)%sides,(k+1)*sides+i))
        faces.append(tuple(range((len(points)-1)*sides,len(points)*sides)))
        obj = skin(mesh(name,vertices,faces,charcoal,collection))
        for p in obj.data.polygons:
            p.use_smooth = True
        return obj

    for i in range(3):
        z = -.04+i*.052
        points = [center+Vector((.068*math.cos(a),.058*math.sin(a),z))
                  for a in [math.radians(35+j*36) for j in range(9)]]
        tube(f'Hand R | curled feather {i+1}',points,.027)
    tube('Hand R | palm', [center+Vector(p) for p in [(.06,.035,-.07),(.065,.04,.03),(.035,.01,.11)]],.052)
    tube('Hand R | opposing feather', [center+Vector(p) for p in [(.055,.03,.10),(.01,-.065,.105),(-.035,-.06,.07)]],.032)


def palette(meshes):
    """Pack the painted body and solid colours into one 512 px material."""
    body = next((o for o in meshes if o.name.startswith('Body')),None)
    source = next(n.image for n in body.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE') if body else None
    source_pixels = list(source.pixels[:]) if source else [0.0]*(512*512*4)
    materials = list({m.name: m for o in meshes for m in o.data.materials}.values())
    solid = [m for m in materials if not any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes)]
    size, strip = 512, 16
    pixels = [0.0]*(size*size*4)
    for y in range(strip,size):
        sy = min(size-1, int((y-strip)/(size-strip)*size))
        pixels[y*size*4:(y+1)*size*4] = source_pixels[sy*size*4:(sy+1)*size*4]
    def srgb(c):
        return 12.92*c if c <= .0031308 else 1.055*c**(1/2.4)-.055
    for y in range(strip):
        for x in range(size):
            mat = solid[min(len(solid)-1,x*len(solid)//size)]
            color = mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value
            pixels[(y*size+x)*4:(y*size+x+1)*4] = [*(srgb(c) for c in color[:3]),1]
    atlas = bpy.data.images.new('Crow combat | palette',width=size,height=size)
    atlas.colorspace_settings.name = 'sRGB'
    atlas.pixels.foreach_set(pixels)
    atlas.pack()
    shared = bpy.data.materials.new('Crow | single palette' if body else 'Sword | single palette')
    shared.use_nodes = True
    shader = shared.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .78 if body else .48
    shader.inputs['Metallic'].default_value = 0 if body else .35
    shader.inputs['Specular IOR Level'].default_value = .16
    texture = shared.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = atlas
    texture.extension = 'EXTEND'
    shared.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
    for obj in meshes:
        uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='Combat palette')
        uv.name = 'Combat palette'
        uv.active_render = True
        if obj == body:
            for loop in uv.data:
                loop.uv.y = min(1-.5/size, strip/size + loop.uv.y*(size-strip)/size)
        else:
            for polygon in obj.data.polygons:
                slot = solid.index(obj.data.materials[polygon.material_index])
                for i in polygon.loop_indices:
                    uv.data[i].uv = ((slot+.5)/len(solid),.5*strip/size)
        obj.data.materials.clear()
        obj.data.materials.append(shared)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
