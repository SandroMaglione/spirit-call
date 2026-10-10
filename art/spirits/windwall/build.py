"""Build Windwall's static reference model; no animation or runtime edits.

Pixel profiles use the supplied front's 246 px height and side depth.
Blender is Z up, facing -Y; the glTF exporter converts to Y up, +Z forward.
"""
import hashlib
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
SHEET = json.loads((HERE/'sheet.json').read_text())
SCALE = SHEET['meters_per_pixel']
HOVER = SHEET['hover_m']
COLORS = SHEET['palette'] | {'dark':'#081F29', 'socket':'#0A2630', 'deep_teal':'#087E78'}
RNG = random.Random(713)

def linear(hex):
    rgb = [int(hex[i:i+2],16)/255 for i in (1,3,5)]
    return [v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]

def mix(a,b,t):
    return [x+(y-x)*t for x,y in zip(a,b)]

def p(x,d,z):
    return Vector((x*SCALE,d*SCALE,z*SCALE+HOVER))

def material(name, emission=0, flat=False):
    m=bpy.data.materials.new(name); m.use_nodes=True
    nodes=m.node_tree.nodes; links=m.node_tree.links
    c=nodes.new('ShaderNodeVertexColor'); c.layer_name='Color'
    bsdf=nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value=.94
    bsdf.inputs['Specular IOR Level'].default_value=.12
    links.new(c.outputs['Color'],bsdf.inputs['Base Color'])
    bsdf.inputs['Emission Strength'].default_value=emission
    if name in ('Windwall.Palette','Windwall.Face'):
        # The reference paints its lighting into each facet. glTF unlit
        # preserves that palette, including the underside, at phone scale.
        nodes.remove(bsdf)
        links.new(c.outputs['Color'],nodes.get('Material Output').inputs['Surface'])
    elif flat:
        nodes.remove(bsdf); e=nodes.new('ShaderNodeEmission')
        e.inputs['Strength'].default_value=emission
        # glTF has no emissive vertex color channel. These two materials
        # each use one constant color so Blender and the actual GLB agree.
        e.inputs['Color'].default_value=(*linear(COLORS['eye' if 'Eyes' in name else 'dark']),1)
        links.new(e.outputs[0],nodes.get('Material Output').inputs['Surface'])
    return m

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
FACET=material('Windwall.Palette')
FACE=material('Windwall.Face',.6,True)
GLOW=material('Windwall.Eyes',1.15,True)
root=bpy.data.objects.new('Windwall',None); bpy.context.collection.objects.link(root)
root['status']='static reference review'

def paint(poly, kind):
    q=poly.center/SCALE
    if kind=='hood':
        # Cream crown, pale mint sides, teal low facets: the sheet's hood.
        height=(q.z-HOVER/SCALE-82)/111
        edge=min(1,abs(q.x)/70)
        tint=max(0,min(1,(1-height)*.65+edge*.28+RNG.uniform(-.15,.15)))
        return mix(linear(COLORS['cream']),linear(COLORS['mint']),tint)
    if kind=='cape':
        h=(q.z-HOVER/SCALE-80)/80
        brightness=max(0,min(1,.53+h*.6+RNG.uniform(-.22,.22)))
        if poly.normal.z<-.15: brightness*=.76
        return mix(linear(COLORS['teal']),linear(COLORS['pale_green']),brightness)
    if kind=='lower':
        return mix(linear(COLORS['teal']),linear(COLORS['mint']),RNG.uniform(.05,.72))
    if kind=='body':
        t=RNG.uniform(.05,.64)
        if abs(q.x)>20: t+=.12
        return mix(linear(COLORS['cream']),linear(COLORS['pale_green']),min(t,.85))
    if kind=='crest':
        t=max(.15,min(1,poly.normal.z*.32+.55+RNG.uniform(-.24,.24)))
        return mix(linear(COLORS['mint']),linear(COLORS['pale_green']),t)
    if kind=='leaf_teal':
        return mix(linear(COLORS['teal']),linear(COLORS['mint']),RNG.uniform(.15,.85))
    if kind=='gem':
        return mix(linear(COLORS['deep_teal']),linear(COLORS['teal']),RNG.uniform(.28,.95))
    if kind=='collar':
        return mix(linear(COLORS['cream']),linear(COLORS['pale_green']),RNG.uniform(0,.28))
    return linear(COLORS[kind])

def mesh(name, vertices, faces, kind, mat=FACET, origin=None):
    data=bpy.data.meshes.new(name); data.from_pydata(vertices,[],faces); data.update()
    bm=bmesh.new(); bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data); bm.free(); data.update()
    data.calc_loop_triangles()
    attr=data.color_attributes.new('Color','FLOAT_COLOR','CORNER')
    for poly in data.polygons:
        color=paint(poly,kind)
        for i in poly.loop_indices: attr.data[i].color=(*color,1)
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    data.materials.append(mat); obj.parent=root
    if origin is not None:
        origin=Vector(origin)
        for v in data.vertices: v.co-=origin
        obj.location=origin
    return obj

def connect(faces, a,b,n, alternate=0):
    for i in range(n):
        j=(i+1)%n
        if (i+alternate)%2:
            faces.extend([(a+i,a+j,b+j),(a+i,b+j,b+i)])
        else:
            faces.extend([(a+i,a+j,b+i),(a+j,b+j,b+i)])

# The hood is one closed shell, including its sloping cavity and backing.
outline=[(0,193),(36,175),(55,146),(67,113),(49,94),(22,84),
         (0,82),(-22,84),(-49,94),(-67,113),(-55,146),(-36,175)]
opening=[(0,156),(18,147),(33,129),(37,111),(29,99),(16,93),
         (0,90),(-16,93),(-29,99),(-37,111),(-33,129),(-18,147)]
outer=[p(x*1.04, -16 if z>160 else (-12 if abs(x)>45 else -47),z-10 if i==0 else z)
       for i,(x,z) in enumerate(outline)]
inner=[p(x,-59-(1-abs(x)/40)*6,z) for x,z in opening]
n=len(outer); verts=list(outer)
middle=[]
for i,(a,b) in enumerate(zip(outer,inner)):
    v=a.lerp(b,.52); v.y-=4*SCALE
    v.z+=RNG.uniform(-2,2)*SCALE; middle.append(v)
verts+=middle+inner
faces=[]; connect(faces,0,n,n); connect(faces,n,2*n,n,1)
# Full side volume behind the face rim; shared perimeter means no cracks.
for t,d in ((.5,23),(1,58)):
    verts += [p(x*1.04*(1.02 if t==.5 else .77),d,136+(z-136)*(.99 if t==.5 else .70)) for x,z in outline]
connect(faces,0,3*n,n,1); connect(faces,3*n,4*n,n)
verts.append(p(0,66,139)); back_center=len(verts)-1
for i in range(n): faces.append((4*n+i,4*n+(i+1)%n,back_center))
bevel_start=len(verts)
verts += [p(x*.94,-53-(1-abs(x)/40)*6,123+(z-123)*.95) for x,z in opening]
connect(faces,2*n,bevel_start,n)
verts.append(p(0,-56,120)); backing=len(verts)-1
for i in range(n): faces.append((bevel_start+i,bevel_start+(i+1)%n,backing))
hood=mesh('Hood',verts,faces,'hood',origin=p(0,0,135))
# Face facets use the same actual shell, with a dark material on the cavity.
hood.data.materials.append(FACE)
for poly in list(hood.data.polygons)[-3*n:-n]:
    for i in poly.loop_indices: hood.data.color_attributes['Color'].data[i].color=(*linear(COLORS['cream']),1)
for poly in list(hood.data.polygons)[-n:]:
    poly.material_index=1
    for i in poly.loop_indices: hood.data.color_attributes['Color'].data[i].color=(*linear(COLORS['dark']),1)

def blade(name, boundary, kind, ridge=7, origin=None):
    """A closed, faceted leaf with sharp outline and a raised middle vein."""
    boundary=[Vector(v) for v in boundary]; n=len(boundary)
    center=sum(boundary,Vector())/n
    # A deliberately uneven middle ring avoids concentric-looking facets.
    verts=boundary[:]
    for i,v in enumerate(boundary):
        q=center.lerp(v,.52)
        q.y-=ridge*SCALE*.6; q.z+=(ridge*SCALE*.25)
        verts.append(q)
    crest=center+Vector((0,-ridge*SCALE,ridge*SCALE*.4)); verts.append(crest)
    faces=[]; connect(faces,0,n,n)
    for i in range(n): faces.append((n+i,n+(i+1)%n,2*n))
    underside=len(verts); verts.append(center+Vector((0,ridge*SCALE*.8,-ridge*SCALE*.4)))
    for i in range(n): faces.append((i,(i+1)%n,underside))
    return mesh(name,verts,faces,kind,origin=origin or center)

body_profile=[(0,-48,96),(30,-47,82),(40,-30,55),(24,-10,32),
              (0,9,0),(-24,-10,32),(-40,-30,55),(-30,-47,82)]
verts=[p(*v) for v in body_profile]
verts += [p(x,40 if z>80 else (5 if z>10 else 11),z) for x,d,z in body_profile]
verts += [p(0,-43,60),p(0,10,59)]
faces=[];connect(faces,0,8,8)
for i in range(8):
    faces += [(i,(i+1)%8,16),(8+i,8+(i+1)%8,17)]
body=mesh('Body',verts,faces,'body',origin=p(0,0,80))
# The pendant has a volume along the back, rather than a flat front card.
for sign,label in ((-1,'L'),(1,'R')):
    points=[p(sign*44,-15,128),p(sign*161,95,156),p(sign*140,80,100),
            p(sign*85,15,83),p(sign*17,-67,82)]
    blade('Cape.Upper.'+label,points,'cape',8,p(sign*35,6,111))
    points=[p(sign*34,28,111),p(sign*121,78,85),p(sign*78,60,41),
            p(sign*50,26,53),p(sign*28,2,76)]
    blade('Cape.Lower.'+label,points,'lower',9,p(sign*38,30,93))

# A closed rear mantle bridges both wings behind the hood.
blade('Mantle.Back',[p(-48,28,114),p(0,60,119),p(48,28,114),p(32,65,85),
                    p(0,72,78),p(-32,65,85)],'lower',-6,p(0,49,108))

# The narrow cream edge is a curved ribbon, continuous under the face.
bpy.context.view_layer.update()
surface_vertices=[];surface_faces=[]
for obj in bpy.data.objects:
    if obj.type!='MESH' or not (obj.name.startswith('Cape.') or obj.name=='Mantle.Back'): continue
    start=len(surface_vertices)
    surface_vertices += [obj.matrix_world@v.co for v in obj.data.vertices]
    surface_faces += [tuple(start+i for i in poly.vertices) for poly in obj.data.polygons]
surface=BVHTree.FromPolygons(surface_vertices,surface_faces)
def ribbon_point(x,d,z,rear=False):
    point=p(x,d,z)
    hit,_,_,_=surface.ray_cast(p(x,500 if rear else -500,z),Vector((0,-1 if rear else 1,0)))
    if hit is not None: point.y=hit.y+(.6 if rear else -.6)*SCALE
    return point

def densify(path):
    # Sample across facet boundaries so long ribbon segments cannot sink
    # behind the cape between their otherwise correctly placed endpoints.
    return [tuple(a+(b-a)*j/4 for a,b in zip(path[i],path[i+1]))
            for i in range(len(path)-1) for j in range(4)]+[path[-1]]

path=[(-140,80,101),(-111,41,96),(-79,0,89),(-46,-39,84),(-20,-63,82),
      (0,-70,81),(20,-63,82),(46,-39,84),(79,0,89),(111,41,96),(140,80,101)]
path=densify(path)
verts=[]
for x,d,z in path:
    width=2.0+abs(x)/136*3.2
    a=ribbon_point(x,d-1,z+width);b=ribbon_point(x,d-1,z)
    verts += [a,b,a+Vector((0,SCALE,0)),b+Vector((0,SCALE,0))]
faces=[]
for i in range(len(path)-1):
    a=i*4;b=(i+1)*4
    for j,k in ((0,1),(2,3),(0,2),(1,3)):
        faces.extend([(a+j,a+k,b+k),(a+j,b+k,b+j)])
end=len(verts)-4
faces += [(0,2,3),(0,3,1),(end,end+1,end+3),(end,end+3,end+2)]
mesh('Collar.Front',verts,faces,'collar',origin=p(0,-40,85))
back_path=[(-140,80,101),(-105,86,95),(-70,87,88),(-35,83,84),(0,78,83),
           (35,83,84),(70,87,88),(105,86,95),(140,80,101)]
back_path=densify(back_path)
verts=[];faces=[]
for x,d,z in back_path:
    a=ribbon_point(x,d,z+3,True);b=ribbon_point(x,d,z,True)
    verts += [a,b,a-Vector((0,SCALE,0)),b-Vector((0,SCALE,0))]
for i in range(len(back_path)-1):
    a=i*4;b=(i+1)*4
    for j,k in ((0,1),(2,3),(0,2),(1,3)):
        faces.extend([(a+j,a+k,b+k),(a+j,b+k,b+j)])
end=len(verts)-4
faces += [(0,2,3),(0,3,1),(end,end+1,end+3),(end,end+3,end+2)]
mesh('Collar.Back',verts,faces,'collar',origin=p(0,60,85))

blade('Crest.Tall',[p(-3,10,187),p(16,13,217),p(5,17,246),p(-13,14,217)],'crest',16,p(0,12,189))
blade('Crest.Side',[p(-3,12,189),p(-18,38,223),p(-51,65,225),p(-41,48,199)],'leaf_teal',11,p(-3,14,190))

# The chest crystal follows the front-facing panel, framed by a dark rim.
center=p(0,-47,63)
gem_boundary=[p(0,-44,81),p(11,-47,63),p(0,-36,45),p(-11,-47,63)]
blade('Gem.Frame',gem_boundary,'dark',1.7,center)
gem_boundary=[p(0,-45.5,77.5),p(8,-49,63),p(0,-38,48.5),p(-8,-49,63)]
blade('Gem',gem_boundary,'gem',5,center)

eye_width=sum(e['width'] for e in SHEET['front_eyes'])/2
eye_height=sum(e['height'] for e in SHEET['front_eyes'])/2
eye_gap=(SHEET['front_eyes'][1]['center'][0]-SHEET['front_eyes'][0]['center'][0])/2
eye_z=473-sum(e['center'][1] for e in SHEET['front_eyes'])/2
for sign,label in ((-1,'L'),(1,'R')):
    c=p(sign*eye_gap,-59.6,eye_z); verts=[c+Vector((0,-.35*SCALE,0))]
    for i in range(24):
        angle=2*math.pi*i/24
        verts.append(c+Vector((math.cos(angle)*eye_width*SCALE/2,0,math.sin(angle)*eye_height*SCALE/2)))
    verts.append(c+Vector((0,.25*SCALE,0)))
    faces=[]
    for i in range(24):
        j=(i+1)%24
        faces.extend([(0,i+1,j+1),(25,j+1,i+1)])
    mesh('Eye.'+label,verts,faces,'eye',GLOW,c)

# Every exported mesh is closed and flat-shaded; objects remain editable.
audit=[]
for obj in bpy.data.objects:
    if obj.type!='MESH': continue
    bm=bmesh.new(); bm.from_mesh(obj.data)
    bad=[e for e in bm.edges if not e.is_manifold]
    assert not bad, f'{obj.name}: {len(bad)} open edges'
    bm.free(); obj.data.calc_loop_triangles()
    audit.append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'closed':True})
bpy.context.view_layer.update()
points=[obj.matrix_world@v.co for obj in bpy.data.objects if obj.type=='MESH' for v in obj.data.vertices]
low=[min(v[i] for v in points) for i in range(3)]
high=[max(v[i] for v in points) for i in range(3)]
scene=bpy.context.scene; scene.view_settings.view_transform='Standard'
scene.render.engine='BLENDER_EEVEE_NEXT'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'windwall.blend'))
glb=HERE/'windwall.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',export_apply=True,
    export_vertex_color='ACTIVE',export_animations=False,export_cameras=False,export_lights=False)
info={'name':'Windwall','status':'static model for review','height_m':high[2],
      'height_basis':'ground origin to highest rest mesh vertex, including crest',
      'silhouette_height_m':high[2]-low[2], 'hover_m':low[2],
      'width_m':high[0]-low[0],'depth_m':high[1]-low[1],
      'bounds_blender':{'min':low,'max':high}, 'triangles':sum(x['triangles'] for x in audit),
      'materials':[m.name for m in (FACET,FACE,GLOW)],'objects':audit,
      'animations':0,'armatures':0,'textures':0,'cameras':0,'lights':0,
      'bytes':glb.stat().st_size,
      'reference_sha256':hashlib.sha256((HERE/'reference/sheet.png').read_bytes()).hexdigest(),
      'source_sha256':hashlib.sha256((HERE/'windwall.blend').read_bytes()).hexdigest(),
      'glb_sha256':hashlib.sha256(glb.read_bytes()).hexdigest()}
(HERE/'export.json').write_text(json.dumps(info,indent=2)+'\n')
print(json.dumps(info,indent=2))
