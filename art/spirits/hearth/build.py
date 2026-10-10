"""Build Hearth's static, faceted brazier from the supplied model sheet.

Meters, Blender +Z up and -Y forward. No rig, clips or review helpers.
Parts retain useful pivots for a later animation pass.
"""
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
RNG = random.Random(211)
TAU = math.tau
STONE = ['#3C2C35','#48343C','#563D43','#65464A','#765153','#8E6160']
FIRE = ['#ED3325','#FF4928','#FF682F','#FF993C','#FFBB45','#FFD85B','#FFE97B','#FFF0A0']


def linear(color):
    rgb = [int(color[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)


def material(name, color=None, luminous=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = .96
    bsdf.inputs['Specular IOR Level'].default_value = .10
    if color:
        bsdf.inputs['Base Color'].default_value = (*linear(color),1)
    else:
        attribute = nodes.new('ShaderNodeVertexColor')
        attribute.layer_name = 'Color'
        links.new(attribute.outputs['Color'],bsdf.inputs['Base Color'])
    if luminous:
        # The export makes this vertex-colored material unlit. Blender
        # uses the same colors as emission for the static review renders.
        if color:
            bsdf.inputs['Emission Color'].default_value = (*linear(color),1)
        else:
            links.new(attribute.outputs['Color'],bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.15
    elif not color:
        bsdf.inputs['Emission Color'].default_value = (*linear('#684148'),1)
        bsdf.inputs['Emission Strength'].default_value = .07
    return mat


def mesh(name, verts, faces, mat, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts,[],faces)
    data.materials.append(mat)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bmesh.ops.triangulate(bm,faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name,data)
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def colors(obj, painter):
    attr = obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for face in obj.data.polygons:
        color = painter(face)
        for i in face.loop_indices:
            attr.data[i].color = (*linear(color),1)


def stone_colors(obj, bright=0):
    def shade(face):
        c = sum((obj.data.vertices[i].co for i in face.vertices),Vector())/3
        h = min(1,max(0,(c.z-.08)/.44))
        index = min(5,max(0,round(1.2+2.3*h+bright+RNG.uniform(-1.1,1.1))))
        return STONE[index]
    colors(obj,shade)


def pivot(obj):
    center = sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
    for v in obj.data.vertices:
        v.co -= center
    obj.location = center


def loft(name, sections, count, mat, cap=True):
    verts, faces = [],[]
    for j,(z,cx,cy,rx,ry) in enumerate(sections):
        for i in range(count):
            a = TAU*i/count
            # Keep the measured outline while staggering interior facets.
            turn = .065*math.sin(j*1.7) if 0<j<len(sections)-1 else 0
            verts.append((cx+rx*math.sin(a+turn),cy-ry*math.cos(a+turn),z))
    for j in range(len(sections)-1):
        for i in range(count):
            a = j*count+i
            b = j*count+(i+1)%count
            c,d = b+count,a+count
            faces.extend([(a,b,c),(a,c,d)] if (i+j)%2 else [(a,b,d),(b,c,d)])
    if cap:
        faces += [tuple(reversed(range(count))),tuple(range((len(sections)-1)*count,len(sections)*count))]
    return mesh(name,verts,faces,mat)


def body(stone, dark):
    obj = loft('HearthBody',[
        (.100,0,.018,.024,.026),(.155,0,.018,.142,.132),
        (.224,0,.016,.224,.228),(.315,0,.008,.279,.262),
        (.400,0,0,.298,.279),(.454,0,0,.310,.289),
    ],18,stone)
    # A tapered cutter leaves a real inset back wall and sloping side walls.
    outline = [(-.139,.414),(.139,.414),(.183,.334),(.151,.281),
               (.077,.251),(0,.241),(-.077,.251),(-.151,.281),(-.183,.334)]
    rear = [(x*.87,.333+(z-.333)*.87) for x,z in outline]
    verts = [(x,-.42,z) for x,z in outline]+[(x,-.203,z) for x,z in rear]
    n = len(outline)
    cutter = mesh('Face cutter',verts,
                  [tuple(reversed(range(n))),tuple(range(n,n*2))]+
                  [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],dark)
    obj.data.materials.append(dark)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Recessed hearth face','BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm,faces=bm.faces)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    stone_colors(obj)
    return obj,outline


def rim(stone):
    # Closed annular cross-section. Its inner wall is visible from above.
    profile = [(.301,.421),(.330,.485),(.324,.510),(.266,.508),(.247,.468),(.259,.442)]
    n = 18
    verts = []
    for j,(r,z) in enumerate(profile):
        for i in range(n):
            a = TAU*i/n
            r2 = r*(1+.016*math.sin(i*2.13))
            verts.append((r2*math.sin(a),-r2*math.cos(a),z+.003*math.sin(i*1.9)))
    faces = []
    for j in range(len(profile)):
        for i in range(n):
            a = j*n+i
            b = j*n+(i+1)%n
            c = ((j+1)%len(profile))*n+(i+1)%n
            d = ((j+1)%len(profile))*n+i
            faces.extend([(a,b,c),(a,c,d)] if (i+j)%2 else [(a,b,d),(b,c,d)])
    obj = mesh('BowlRim',verts,faces,stone)
    stone_colors(obj,.2)
    return obj


def rock(name, x,y,z, width,depth,height, stone, phase=0):
    sections = []
    for j,(t,r) in enumerate([(0,.025),(.25,.76),(.62,1),(.83,.66),(1,.04)]):
        lean = (-math.copysign(.029,x)*(1-t)**2) if abs(x)>.2 else 0
        sections.append((z+(t-.5)*height,x+lean+.008*math.sin(j+phase),y+.008*math.cos(j+phase),width*r/2,depth*r/2))
    obj = loft(name,sections,7,stone)
    stone_colors(obj,.45)
    return obj


def jaw(side,stone):
    points = [(-.242,-.125,.315),(-.172,-.212,.265),(-.09,-.245,.226),
              (-.010,-.231,.193),(-.068,-.145,.080),(-.195,-.115,.157),(-.252,-.11,.250)]
    verts = [(side*x,y,z) for x,y,z in points]
    verts += [(side*x,y+.034,z) for x,y,z in points]
    verts += [(side*-.137,-.253,.217),(side*-.137,-.175,.217)]
    n = len(points)
    faces = [(2*n,i,(i+1)%n) for i in range(n)]
    faces += [(2*n+1,(i+1)%n+n,i+n) for i in range(n)]
    faces += [(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)]
    obj = mesh('Jaw.L' if side==1 else 'Jaw.R',verts,faces,stone)
    stone_colors(obj,.65)
    return obj


def surface_ribbon(name, points, width, target, mat, hot=True, origin=(0,0), radius=.30):
    """Snap a crack onto the physical surface; its core is a narrower strip."""
    tree = BVHTree.FromPolygons([v.co for v in target.data.vertices],
                               [p.vertices for p in target.data.polygons])
    verts,faces = [],[]
    sampled = []
    for (a,z),(b,w) in zip(points,points[1:]):
        steps = max(2,math.ceil(max(abs(z-w),abs(a-b)*radius)/.007))
        sampled.extend((a+(b-a)*i/steps,z+(w-z)*i/steps) for i in range(steps))
    sampled.append(points[-1])
    # points are angle around -Y, height. Width is measured on the surface.
    for a,z in sampled:
        for offset in (-1,-.42,.42,1):
            az = a+offset*width/radius/2
            radial = Vector((math.sin(az),-math.cos(az),0))
            hit,normal,_,_ = tree.ray_cast(radial*.65+Vector((*origin,z)),-radial)
            if hit is None:
                raise ValueError(f'{name} misses surface at {a,z}')
            verts.append(tuple(hit+normal*.0020))
    for j in range(len(sampled)-1):
        for i in range(3):
            a = j*4+i
            faces += [(a,a+1,a+5),(a,a+5,a+4)]
    obj = mesh(name,verts,faces,mat)
    colors(obj,lambda p: '#FFCB54' if hot and (p.index//2)%3==1 else ('#FF5929' if hot else '#ED4427'))
    return obj


def hot_support(obj,side,fire):
    obj.data.materials.append(fire)
    attribute = obj.data.color_attributes['Color']
    for p in obj.data.polygons:
        c = sum((obj.data.vertices[i].co for i in p.vertices),Vector())/3
        dx = side*(c.x-side*.337) if side else -(c.y+.352)
        if dx<-.040 or c.z<.165:
            p.material_index = 1
            col = '#FF4B28' if c.z>.20 else '#F43825'
            for i in p.loop_indices:
                attribute.data[i].color = (*linear(col),1)


def face_edge(outline, target, mat):
    # The warm lower edge wraps the recess without covering its black wall.
    tree = BVHTree.FromPolygons([v.co for v in target.data.vertices],
                               [p.vertices for p in target.data.polygons])
    verts,faces = [],[]
    # Exclude the straight upper edge under the overhanging stone brow.
    corners = outline[1:]+[outline[0]]
    points = []
    for (x,z),(u,w) in zip(corners,corners[1:]):
        steps = max(2,math.ceil(math.hypot(x-u,z-w)/.007))
        points.extend((x+(u-x)*i/steps,z+(w-z)*i/steps) for i in range(steps))
    points.append(corners[-1])
    for x,z in points:
        for scale in (1.018,1.28):
            px = x*scale
            pz = .335+(z-.335)*scale
            hit,normal,_,_ = tree.ray_cast(Vector((px,-.6,pz)),Vector((0,1,0)))
            if hit is None:
                raise ValueError('Face edge has no physical stone backing')
            verts.append(tuple(hit+Vector((0,-.0024,0))))
    for j in range(len(points)-1):
        a = j*2
        faces += [(a,a+1,a+3),(a,a+3,a+2)]
    obj = mesh('FaceEmberSeam',verts,faces,mat)
    colors(obj,lambda p: '#FFB945' if p.center.z<.31 else '#FF672F')
    return obj


def eye(side, mat):
    x,z = side*.047,.335
    verts = [(x,-.2053,z)]
    n = 24
    for i in range(n):
        a = TAU*i/n
        verts.append((x+math.cos(a)*.018,-.2045,z+math.sin(a)*.040))
    # A shallow closed lens keeps both the export and native topology solid.
    verts.append((x,-.2033,z))
    faces = [(0,i+1,(i+1)%n+1) for i in range(n)]
    faces += [(n+1,(i+1)%n+1,i+1) for i in range(n)]
    return mesh('Eye.L' if side<0 else 'Eye.R',verts,faces,mat)


def flame(mat):
    # The front row bounds come from sheet.py. The final lower rows include
    # the detached left tongue, so those sections use its visible main lobe.
    rows = [(322,145,268),(310,164,270),(298,171,273),(286,178,271),
            (274,165,268),(262,149,257),(250,144,244),(238,148,234),
            (226,159,199),(214,173,207),(202,196,219),(190,199,214),(178,195,195)]
    pixel = .8/301
    sections = []
    for j,(y,left,right) in enumerate(rows):
        z = .88-(y-178)*pixel
        cx = ((left+right)/2-197)*pixel
        rx = max(.002,(right-left)/2*pixel)
        # Round volume at the base, flatter at its curled tip. The sheet's
        # side cameras show the same broad lower bulb and narrow upper hook.
        ry = rx*(.90 if j<6 else .76)
        cy = cx*.85+.006*math.sin(j*.7)
        sections.append((z,cx,cy,rx,ry))
    obj = loft('FlameCore',sections,10,mat)
    def shade(p):
        center = sum((obj.data.vertices[i].co for i in p.vertices),Vector())/3
        h = (center.z-.49)/.39
        # Large triangular yellow facets run through the center. Redder
        # side facets trace the silhouette, as on the reference sheet.
        length = math.hypot(p.normal.x,p.normal.y)
        side = min(abs(p.normal.x),abs(p.normal.y))*1.6/max(.01,length)
        level = 8.0-4.0*h-5.8*side+RNG.uniform(-.55,.55)
        return FIRE[min(7,max(0,round(level)))]
    colors(obj,shade)
    return obj


def tongue(name, x,y,mat, flip=1):
    obj = loft(name,[(.477,x,y,.026,.028),(.518,x-.006*flip,y,.038,.030),
                     (.553,x-.002*flip,y,.031,.025),(.585,x+.022*flip,y,.016,.013),
                     (.613,x+.030*flip,y+.002,.002,.002)],7,mat)
    colors(obj,lambda p: FIRE[min(5,max(0,round(4-abs(p.normal.x)*3+RNG.uniform(-.8,.8))))])
    return obj


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stone = material('Hearth stone facets')
    dark = material('Hearth dark recess','#1C0F12')
    fire = material('Hearth flame and molten seams',luminous=True)
    eyes = material('Hearth warm eyes','#FFE987',luminous=True)
    core,outline = body(stone,dark)
    ring = rim(stone)
    basin = loft('EmberBasin',[(.449,0,0,.001,.001),(.464,0,0,.248,.248)],18,fire)
    colors(basin,lambda p: '#FF612C' if p.index%4 else '#FFA43C')
    # The top and bottom drawings put the compact third support in front.
    supports = [rock('Support.L',-.337,-.005,.268,.145,.182,.275,stone,.5),
                rock('Support.R', .337,-.005,.268,.145,.182,.275,stone,2.2),
                rock('Support.Front',0,-.352,.165,.164,.135,.150,stone,1.3)]
    for support,side in zip(supports,(-1,1,0)):
        hot_support(support,side,fire)
    # The front shell ends in two jagged stone points below the warm face.
    jaws = [jaw(1,stone),jaw(-1,stone)]
    molten = []
    for sign in (-1,1):
        molten.append(surface_ribbon(f'BowlCrack.{sign}',
                      [(sign*.82,.452),(sign*.90,.403),(sign*.82,.361),
                       (sign*.98,.314),(sign*1.08,.264),(sign*.99,.205)],.037,core,fire))
        molten.append(surface_ribbon(f'RimCrack.{sign}',
                      [(sign*.80,.505),(sign*.81,.485),(sign*.87,.454),(sign*.91,.435)],.022,ring,fire))
    for sign in (-1,1):
        molten.append(surface_ribbon(f'RearCrack.{sign}',
                      [(math.pi+sign*.72,.452),(math.pi+sign*.78,.391),
                       (math.pi+sign*.57,.334),(math.pi+sign*.84,.273),
                       (math.pi+sign*.85,.205)],.030,core,fire))
    molten.append(face_edge(outline,core,fire))
    for i,support in enumerate(supports):
        # Each support has one molten inward edge, leaving most of its
        # exposed faceted surface stone-colored.
        zmid = .268 if i<2 else .165
        a = math.pi/2 if i==0 else -math.pi/2 if i==1 else math.pi
        origin = [(-.337,-.005),(.337,-.005),(0,-.352)][i]
        offsets = (.080,.036,-.025,-.085) if i<2 else (.050,.022,-.016,-.053)
        molten.append(surface_ribbon(f'SupportEmber.{i}',
                      [(a,zmid+offsets[0]),(a+.14,zmid+offsets[1]),(a-.08,zmid+offsets[2]),(a+.10,zmid+offsets[3])],
                      .041,support,fire,origin=origin,radius=.075))
    flame(fire)
    tongue('FlameTongue.L',-.163,-.015,fire,-1)
    tongue('FlameTongue.Rear',.156,.094,fire,1)
    eye(-1,eyes)
    eye(1,eyes)
    # Surface details are open decals, intentional and audited separately.
    for obj in bpy.context.scene.objects:
        obj['static_stage'] = True
        obj['surface_detail'] = obj in molten
        pivot(obj)
    bpy.context.scene['character'] = 'Hearth'
    bpy.context.scene['reference'] = 'reference/sheet.png'
    bpy.context.scene['stage'] = 'static model review'
    bpy.context.scene['axes'] = 'meters, +Z up, -Y forward'
    bpy.context.scene['ground_origin'] = 'ground under floating body; hover gap 0.08 m'
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    core.select_set(True)
    bpy.context.view_layer.objects.active = core
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'hearth-spirit.blend'))
    info = {'triangles':sum(len(o.data.polygons) for o in bpy.context.scene.objects),
            'objects':len(bpy.context.scene.objects),'materials':4,'animations':0}
    (HERE/'build.json').write_text(json.dumps(info,indent=2)+'\n')
    print(info)


if __name__=='__main__':
    main()
