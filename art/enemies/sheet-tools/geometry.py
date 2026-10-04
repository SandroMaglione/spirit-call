"""Small measured lofts and faceted parts for the static enemy review stage."""
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import tessellate_polygon


def linear(color):
    values=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    return [c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in values]


class Model:
    def __init__(self, here):
        self.here=Path(here)
        self.kind=self.here.parent.name
        self.sheet=json.loads((self.here/'sheet.json').read_text())
        self.config=json.loads((self.here/'spirit.json').read_text())
        self.rng=random.Random(41)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.mat=bpy.data.materials.new('Enemy facet palette')
        self.mat.use_nodes=True
        bsdf=self.mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Roughness'].default_value=.83
        bsdf.inputs['Specular IOR Level'].default_value=.12
        attr=self.mat.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Color'
        self.mat.node_tree.links.new(attr.outputs['Color'],bsdf.inputs['Base Color'])

    def color(self,key):return self.sheet['palette'].get(key,key)

    def pixel(self,view,point):
        scale=self.config['meters_per_pixel']
        lateral=(point[0]-self.config['center'][view])*scale
        if view in ('back','left'):lateral=-lateral
        return lateral,(self.config['ground'][view]-point[1])*scale

    def point(self,front,side):
        x,z=self.pixel('front',front);y,_=self.pixel('right',side)
        return Vector((x,y,z))

    def cylinder(self,name,a,b,radius,color,segments=8,end_radius=None):
        a,b=Vector(a),Vector(b);axis=(b-a).normalized()
        u=axis.cross(Vector((0,0,1)))
        if u.length<.01:u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u)
        verts=[]
        for center,r in ((a,radius),(b,radius if end_radius is None else end_radius)):
            for k in range(segments):
                angle=2*math.pi*k/segments
                verts.append(center+float(r)*(math.cos(angle)*u+math.sin(angle)*v))
        faces=[tuple(range(segments-1,-1,-1)),tuple(range(segments,segments*2))]
        for k in range(segments):faces.append((k,(k+1)%segments,(k+1)%segments+segments,k+segments))
        return self.mesh(name,verts,faces,color)

    def prism(self,name,pixels,front_y,back_y,color):
        points=[self.pixel('front',p) for p in pixels]
        verts=[(x,y,z) for y in (front_y,back_y) for x,z in points]
        n=len(points)
        faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
        faces += [(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
        return self.mesh(name,verts,faces,color)

    def stripe(self,name,body,view,pixels,color,width=.009):
        tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
        sign=1 if view=='back' else -1
        verts=[]
        for p in pixels:
            x,z=self.pixel(view,p)
            for dx in (-width,width):
                hit,normal,_,_=tree.ray_cast(Vector((x+dx,sign*3,z)),Vector((0,-sign,0)))
                if hit is None:raise ValueError(f'{name} missed measured surface at {p}')
                verts.append(hit+normal*.003)
        faces=[(i,i+1,i+3,i+2) for i in range(0,len(verts)-2,2)]
        return self.mesh(name,verts,faces,color,0)

    def mesh(self,name,verts,faces,color,variation=.07):
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
        bm=bmesh.new();bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        bm.to_mesh(mesh);bm.free()
        mesh.materials.append(self.mat)
        obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj)
        attr=mesh.color_attributes.new('Color','FLOAT_COLOR','CORNER')
        base=linear(self.color(color))
        for p in mesh.polygons:
            k=1+self.rng.uniform(-variation,variation)
            for i in p.loop_indices:attr.data[i].color=(*[max(0,min(1,c*k)) for c in base],1)
        return obj

    def rows(self,part,view):return np.array(self.sheet['parts'][part][view])

    def edge(self,part,view,z,align=False):
        rows=self.rows(part,view)
        if align and view in ('right','left'):
            f=self.rows(part,'front' if 'front' in self.sheet['parts'][part] else 'back')
            rows[:,0]+=(f[:,0].min()+f[:,0].max()-rows[:,0].min()-rows[:,0].max())/2
        rows=rows[np.argsort(rows[:,0])]
        lo=np.interp(z,rows[:,0],rows[:,1]);hi=np.interp(z,rows[:,0],rows[:,2])
        return lo,hi

    def section(self,part,z,align=False):
        views=self.sheet['parts'][part]
        f=self.edge(part,'front' if 'front' in views else 'back',z)
        b=self.edge(part,'back',z) if 'front' in views and 'back' in views else f
        r=self.edge(part,'right' if 'right' in views else 'left',z,align)
        l=self.edge(part,'left',z,align) if 'right' in views and 'left' in views else r
        return ((f[0]+f[1]+b[0]+b[1])/4,(r[0]+r[1]+l[0]+l[1])/4,
                max(.002,(f[1]-f[0]+b[1]-b[0])/4),max(.002,(r[1]-r[0]+l[1]-l[0])/4))

    def loft(self,name,part,color,rings=9,segments=12,align=False,symmetric=False):
        views=self.sheet['parts'][part]
        primary='front' if 'front' in views else 'back'
        rows=self.rows(part,primary)
        low,high=rows[:,0].min(),rows[:,0].max()
        # Rings at silhouette changes preserve the measured bulges. Cardinal
        # vertices stay fixed, so alternating triangulation never shrinks the
        # width of the orthographic outline.
        zs=np.linspace(low,high,rings)
        verts=[];faces=[]
        for i,z in enumerate(zs):
            cx,cy,rx,ry=self.section(part,z,align)
            if symmetric:cx=0
            for k in range(segments):
                a=2*math.pi*k/segments
                verts.append((cx+math.sin(a)*rx,cy-math.cos(a)*ry,z))
        for i in range(rings-1):
            for k in range(segments):
                a=i*segments+k;b=i*segments+(k+1)%segments;c=a+segments;d=b+segments
                faces.extend([(a,b,c),(b,d,c)] if (i+k)%2 else [(a,b,d),(a,d,c)])
        for ring,z in ((0,low),(rings-1,high)):
            cx,cy,_,_=self.section(part,z,align)
            if symmetric:cx=0
            tip=len(verts);verts.append((cx,cy,z))
            for k in range(segments):faces.append((tip,ring*segments+k,ring*segments+(k+1)%segments))
        return self.mesh(name,verts,faces,color)

    def mirror(self,obj,name):
        clone=obj.copy();clone.data=obj.data.copy();clone.name=name
        bpy.context.scene.collection.objects.link(clone)
        for v in clone.data.vertices:v.co.x=-v.co.x
        bm=bmesh.new();bm.from_mesh(clone.data);bmesh.ops.reverse_faces(bm,faces=bm.faces);bm.to_mesh(clone.data);bm.free()
        return clone

    def ellipsoid(self,name,center,radii,color,segments=8,rings=5):
        verts=[];faces=[]
        for j in range(1,rings):
            phi=math.pi*j/rings
            for k in range(segments):
                theta=2*math.pi*k/segments
                verts.append((center[0]+radii[0]*math.sin(phi)*math.cos(theta),center[1]+radii[1]*math.sin(phi)*math.sin(theta),center[2]+radii[2]*math.cos(phi)))
        for j in range(rings-2):
            for k in range(segments):
                a=j*segments+k;b=j*segments+(k+1)%segments
                faces.extend([(a,b,a+segments),(b,b+segments,a+segments)])
        for j,z in ((0,center[2]+radii[2]),(rings-2,center[2]-radii[2])):
            tip=len(verts);verts.append((center[0],center[1],z))
            for k in range(segments):faces.append((tip,j*segments+k,j*segments+(k+1)%segments))
        return self.mesh(name,verts,faces,color)

    def mouth(self,body,color,inner_color,segments=16,flatten=1):
        front=self.rows('mouth','front');side=self.rows('mouth','right')
        xmin,xmax=front[:,1].min(),front[:,2].max();zmin,zmax=front[:,0].min(),front[:,0].max()
        rx,rz=(xmax-xmin)/2,(zmax-zmin)/2
        cx,cz=(xmax+xmin)/2,(zmax+zmin)/2
        ytip=side[:,1].min();yroot=side[:,2].max()
        # A real opening with an inner wall and a recessed cap, not a dark
        # disc glued over an intact body. The sheet determines its outer size.
        gap=.71
        bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=1,depth=1,location=(cx,ytip+.15,cz),rotation=(math.pi/2,0,0))
        cutter=bpy.context.object;cutter.name='Temporary mouth cavity'
        cutter.scale=(rx*gap,rz*gap,.60)
        bpy.context.view_layer.objects.active=body
        mod=body.modifiers.new('Hollow mouth','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter,do_unlink=True)
        verts=[];faces=[]
        profiles=[(yroot, .82),(ytip+.025,1),(ytip, .92),(ytip+.018,gap),(ytip+.18,gap*.76)]
        for y,scale in profiles:
            for k in range(segments):
                a=2*math.pi*k/segments
                verts.append((cx+rx*scale*math.cos(a),y,cz+rz*scale*math.sin(a)))
        for j in range(len(profiles)-1):
            for k in range(segments):
                a=j*segments+k;b=j*segments+(k+1)%segments
                faces.append((a,b,b+segments,a+segments))
        obj=self.mesh('BellMouth' if self.kind=='shooter' else 'JawShell',verts,faces,color)
        # Inner facets transition into shadow without baking camera lighting.
        attr=obj.data.color_attributes['Color']
        for p in obj.data.polygons:
            if p.index >= segments*3:
                for i in p.loop_indices:attr.data[i].color=(*linear(inner_color),1)
        self.ellipsoid('MouthRecess',(cx,ytip+.19,cz),(rx*gap*.77,.012,rz*gap*.77),inner_color,segments,4)
        return cx,ytip,cz,rx,rz,obj

    def patch(self,name,body,points,color,axis='front',offset=.004):
        """Clip the visible surface facets to a drawn polygon.

        Keeping the body's actual triangle boundaries avoids decals cutting
        through curved armor between their projected boundary vertices.
        """
        lateral=0 if axis=='front' else 1
        depth=1 if axis=='front' else 0
        def flat(p):return Vector((p[lateral],p[2],0))
        def cross(a,b):return a.x*b.y-a.y*b.x
        outline=[flat(Vector(p)) for p in points]
        clips=[[outline[v] if isinstance(v,int) else v for v in tri]
               for tri in tessellate_polygon([outline])]
        verts=[];faces=[]
        body.data.calc_loop_triangles()
        for tri in body.data.loop_triangles:
            surface=[body.data.vertices[i].co.copy() for i in tri.vertices]
            normal=(surface[1]-surface[0]).cross(surface[2]-surface[0]).normalized()
            if normal[depth]>=-.0001:continue
            for clip in clips:
                clip=list(clip)
                if cross(clip[1]-clip[0],clip[2]-clip[0])<0:clip.reverse()
                polygon=surface[:]
                for i,a in enumerate(clip):
                    b=clip[(i+1)%3];edge=b-a;result=[]
                    for j,p in enumerate(polygon):
                        q=polygon[(j+1)%len(polygon)]
                        dp=cross(edge,flat(p)-a);dq=cross(edge,flat(q)-a)
                        if dp>=-1e-9:result.append(p)
                        if (dp>=0)!=(dq>=0):result.append(p+(q-p)*(dp/(dp-dq)))
                    polygon=result
                    if len(polygon)<3:break
                if len(polygon)<3:continue
                for i in range(1,len(polygon)-1):
                    triangle=[polygon[0],polygon[i],polygon[i+1]]
                    if (triangle[1]-triangle[0]).cross(triangle[2]-triangle[0]).length<1e-9:continue
                    # One projection-direction offset keeps adjacent facets
                    # joined. Independent normal offsets leave dark seams.
                    push=Vector((0,-offset,0)) if axis=='front' else Vector((-offset,0,0))
                    start=len(verts);verts.extend(p+push for p in triangle)
                    faces.append((start,start+1,start+2))
        if not faces:raise ValueError(f'{name} missed surface')
        return self.mesh(name,verts,faces,color,0)

    def eyes(self,body,background='#303341',core='#FFD18A',socket_scale=1.35):
        eyes=self.sheet['eyes']
        if len(eyes)!=2:raise ValueError(f'Expected two measured eye cores: {eyes}')
        x=abs(eyes[0]['x']-eyes[1]['x'])/2;z=float(np.mean([e['z'] for e in eyes]))
        rx=float(np.mean([e['width'] for e in eyes]))/2;rz=float(np.mean([e['height'] for e in eyes]))/2
        # The inner upper corner is lower than the outer corner. Build one
        # eye and mirror its vertices and colors, so both expressions agree.
        outline=[(-1,1),(.95,.30),(1,-.55),(.25,-.88),(-.85,-.58)]
        for layer,scale,color,offset in (('EyeSocket',socket_scale,background,.003),('Eye',1,core,.007)):
            points=[(-x+rx*scale*u,0,z+rz*scale*v) for u,v in outline]
            obj=self.patch(f'{layer}.L',body,points,color,offset=offset)
            self.mirror(obj,f'{layer}.R')

    def finish(self,main):
        objects=[o for o in bpy.data.objects if o.type=='MESH']
        # Editable parts have centered origins, while the central body stays
        # on the ground origin. Static exports keep the same world vertices.
        for obj in objects:
            if obj==main:continue
            origin=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
            for v in obj.data.vertices:v.co-=origin
            obj.location=origin
        bpy.context.view_layer.update()
        points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
        minimum=min(p.z for p in points)
        if abs(minimum)>.00001:
            for o in objects:o.location.z-=minimum
        bpy.context.view_layer.update()
        points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
        triangles=sum(len(p.vertices)-2 for o in objects for p in o.data.polygons)
        assert triangles<2000,triangles
        assert not bpy.data.actions
        bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
        audit={'kind':self.kind,'status':'static model review; animation and game integration await review',
               'triangles':triangles,'materials':1,'mesh_parts':[o.name for o in objects],'animations':0,'armatures':0,
               'bounds_blender_m':bounds,'height_m':bounds[2][1],'height_basis':'ground origin to highest rest-pose mesh vertex',
               'axes_glb':'meters, +Y up, +Z forward','reference':'reference/sheet.png'}
        bpy.context.scene.unit_settings.system='METRIC'
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=main
        bpy.ops.wm.save_as_mainfile(filepath=str(self.here/self.config['blend']))
        bpy.ops.export_scene.gltf(filepath=str(self.here/f'{self.kind}-model.glb'),export_format='GLB',
             use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
        (self.here/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
        print(json.dumps(audit))
