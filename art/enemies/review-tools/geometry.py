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
        obj=self.mesh(name,verts,faces,color)
        if symmetric:
            # Mirrored facets share colors as well as coordinates. Sheet
            # sampling and random facet colors must not skew the expression.
            colors={};attr=obj.data.color_attributes['Color']
            for p in obj.data.polygons:
                key=tuple(sorted((round(abs(obj.data.vertices[i].co.x),6),round(obj.data.vertices[i].co.y,6),round(obj.data.vertices[i].co.z,6)) for i in p.vertices))
                value=colors.setdefault(key,tuple(attr.data[p.loop_start].color))
                for i in p.loop_indices:attr.data[i].color=value
        return obj

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
        cutter.scale=(rx*gap*1.08,rz*gap*1.08,.60)
        bpy.context.view_layer.objects.active=body
        mod=body.modifiers.new('Hollow mouth','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter,do_unlink=True)
        # Boolean-created loops can inherit the cutter's default white.
        # These are cavity walls, so color them with the mouth's recess.
        attr=body.data.color_attributes['Color']
        for p in body.data.polygons:
            for i in p.loop_indices:
                if min(attr.data[i].color[:3])>.5:
                    attr.data[i].color=(*linear(inner_color),1)
        verts=[];faces=[]
        profiles=[(yroot+.09, .82),(ytip+.025,1),(ytip, .92),(ytip+.018,gap),(ytip+.18,gap*.76)]
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

    def eyes(self,body,background='#303341',core='#FFD18A',socket_scale=1.65,center=0,segments=12):
        eyes=self.sheet['eyes']
        if len(eyes)!=2:raise ValueError(f'Expected two measured eye cores: {eyes}')
        x=float(np.mean([abs(e['x']) for e in eyes]));z=float(np.mean([e['z'] for e in eyes]))
        rx=float(np.mean([e['width'] for e in eyes]))/2;rz=float(np.mean([e['height'] for e in eyes]))/2
        tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
        for sign,side in ((-1,'L'),(1,'R')):
            for layer,scale,color in (('EyeSocket',socket_scale,background),('Eye',1,core)):
                verts=[];faces=[];n=segments
                for ring in (0,.5,1):
                    for k in range(1 if ring==0 else n):
                        a=2*math.pi*k/n
                        pos=Vector((center+sign*x+rx*scale*math.cos(a)*ring,-3,z+rz*scale*math.sin(a)*ring))
                        hit,normal,_,_=tree.ray_cast(pos,Vector((0,1,0)))
                        if hit is None:raise ValueError(f'{layer} missed surface')
                        verts.append(hit+normal*(.002 if layer=='EyeSocket' else .004))
                for k in range(n):faces.append((0,1+k,1+(k+1)%n))
                for k in range(n):
                    a=1+k;b=1+(k+1)%n;faces.append((a,b,b+n,a+n))
                self.mesh(f'{layer}.{side}',verts,faces,color,0)

    def surface_patch(self,name,body,points,color):
        center=self.config['center']['front'];ground=self.config['ground']['front'];pixel=self.sheet['meters_per_pixel']
        verts=[];faces=[]
        region=[Vector(((x-center)*pixel,(ground-y)*pixel,0)) for x,y in points]
        patches=tessellate_polygon([region])
        body.data.calc_loop_triangles()

        def cross(a,b):return a[0]*b[1]-a[1]*b[0]

        def clipped(subject,clip):
            if cross(clip[1]-clip[0],clip[2]-clip[0])<0:clip=list(reversed(clip))
            for j in range(3):
                edge=clip[(j+1)%3]-clip[j];origin=clip[j]
                result=[]
                for k,p in enumerate(subject):
                    q=subject[k-1]
                    a=cross(edge,p-origin);b=cross(edge,q-origin)
                    if (a>=0)!=(b>=0):result.append(q+(p-q)*(b/(b-a)))
                    if a>=0:result.append(p)
                subject=result
                if not subject:break
            return subject

        # Clip each existing front-facing body triangle to the measured
        # feature. New points remain on that exact triangle plane, preventing
        # surface patches from cutting through coarse facets.
        for tri in body.data.loop_triangles:
            if tri.normal.y>=-.02:continue
            p=[body.data.vertices[i].co.copy() for i in tri.vertices]
            projected=[Vector((v.x,v.z,0)) for v in p]
            n=(p[1]-p[0]).cross(p[2]-p[0])
            for patch in patches:
                poly=clipped(projected,[region[i] if isinstance(i,int) else i for i in patch])
                if len(poly)<3:continue
                start=len(verts)
                for v in poly:
                    y=p[0].y-(n.x*(v.x-p[0].x)+n.z*(v.y-p[0].z))/n.y
                    verts.append((v.x,y-.0025,v.y))
                faces += [(start,start+k,start+k+1) for k in range(1,len(poly)-1)]
        return self.mesh(name,verts,faces,color,0)

    def tube(self, name, points, radius, color, segments=6):
        verts=[]; faces=[]
        for i,point in enumerate(points):
            p=Vector(point)
            tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
            tangent.normalize()
            u=tangent.cross(Vector((0,1,0)))
            if u.length<.001:u=tangent.cross(Vector((1,0,0)))
            u.normalize();v=tangent.cross(u).normalized()
            for k in range(segments):
                angle=k*2*math.pi/segments
                verts.append(p+radius*(u*math.cos(angle)+v*math.sin(angle)))
        for i in range(len(points)-1):
            for k in range(segments):
                a=i*segments+k;b=i*segments+(k+1)%segments
                faces.append((a,b,b+segments,a+segments))
        faces.extend([tuple(reversed(range(segments))),tuple(range(len(verts)-segments,len(verts)))])
        return self.mesh(name,verts,faces,color)

    def ribbon(self,name,part,color,steps=8):
        primary='back' if 'back' in self.sheet['parts'][part] else 'front'
        rows=self.rows(part,primary)
        visible_top=rows[:,0].max()
        high=max(visible_top,self.rows(part,'right')[:,0].max())
        zs=np.linspace(rows[:,0].min(),high,steps)
        verts=[];faces=[]
        for z in zs:
            x0,x1=self.edge(part,primary,z)
            if z>visible_top:
                # The sheet hides the scarf root behind a sleeve. Continue
                # that measured tail to the measured mantle, inside the body.
                root=self.section('collar',high)
                u=(z-visible_top)/(high-visible_top)
                sign=1 if x0+x1>0 else -1
                center=sign*root[2]*.7
                x0=x0*(1-u)+(center-.015)*u
                x1=x1*(1-u)+(center+.015)*u
            y0,y1=self.edge(part,'right',z,True)
            for u in (0,.5,1):
                # The two measured projections give the ribbon's width and
                # depth. A central fold keeps it readable under the game camera.
                verts.append((x0+(x1-x0)*u,y0+(y1-y0)*u,z+.008 if u==.5 else z))
        for i in range(steps-1):
            for k in range(2):
                a=i*3+k;faces.extend([(a,a+1,a+3),(a+1,a+4,a+3)])
        obj=self.mesh(name,verts,faces,color)
        # Cloth must read from both sides. A tiny thickness exports portable
        # geometry, rather than relying on a viewer-specific backface setting.
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Cloth thickness','SOLIDIFY');mod.thickness=.003
        bpy.ops.object.modifier_apply(modifier=mod.name)
        return obj

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
        if triangles>=2000:
            print({o.name:sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects})
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
