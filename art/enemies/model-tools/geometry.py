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

    def loft(self,name,part,color,rings=9,segments=12,align=False):
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
            for k in range(segments):
                a=2*math.pi*k/segments
                verts.append((cx+math.sin(a)*rx,cy-math.cos(a)*ry,z))
        for i in range(rings-1):
            for k in range(segments):
                a=i*segments+k;b=i*segments+(k+1)%segments;c=a+segments;d=b+segments
                faces.extend([(a,b,c),(b,d,c)] if (i+k)%2 else [(a,b,d),(a,d,c)])
        for ring,z in ((0,low),(rings-1,high)):
            cx,cy,_,_=self.section(part,z,align)
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

    def eyes(self,body,background='#303341',core='#FFD18A',socket_scale=1.65,slant=0,offset=.004):
        eyes=self.sheet['eyes']
        if len(eyes)!=2:raise ValueError(f'Expected two measured eye cores: {eyes}')
        x=float(np.mean([abs(e['x']) for e in eyes]));z=float(np.mean([e['z'] for e in eyes]))
        rx=float(np.mean([e['width'] for e in eyes]))/2;rz=float(np.mean([e['height'] for e in eyes]))/2
        tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
        for sign,side in ((-1,'L'),(1,'R')):
            for layer,scale,color in (('EyeSocket',socket_scale,background),('Eye',1,core)):
                verts=[];faces=[];n=12
                for ring in (0,.5,1):
                    for k in range(1 if ring==0 else n):
                        a=2*math.pi*k/n
                        dx=rx*scale*math.cos(a)*ring
                        pos=Vector((sign*x+dx,-3,z+rz*scale*math.sin(a)*ring+sign*dx*slant))
                        hit,normal,_,_=tree.ray_cast(pos,Vector((0,1,0)))
                        if hit is None:raise ValueError(f'{layer} missed surface')
                        verts.append(hit+Vector((0,-(offset-.002) if layer=='EyeSocket' else -offset,0)))
                for k in range(n):faces.append((0,1+k,1+(k+1)%n))
                for k in range(n):
                    a=1+k;b=1+(k+1)%n;faces.append((a,b,b+n,a+n))
                self.mesh(f'{layer}.{side}',verts,faces,color,0)

    def angry_eyes(self,body,core,background,depth=0,parts=None):
        """Mirror one measured angular eye; optionally carve a tapered socket."""
        eyes=self.sheet['eyes']
        x=float(np.mean([abs(e['x']) for e in eyes]))
        z=float(np.mean([e['z'] for e in eyes]))
        rx=float(np.mean([e['width'] for e in eyes]))*.62
        rz=float(np.mean([e['height'] for e in eyes]))*.38
        # The inner corner sits below the outer brow. Keep the measured eye
        # center and area, replacing the rounded silhouette with a scowl.
        outline=[(-1,.02),(.85,1),(1,.35),(.45,-.65),(-.55,-.55)]
        targets=parts or [body]
        vertices=[];polygons=[]
        for obj in targets:
            offset=len(vertices)
            vertices.extend(v.co.copy() for v in obj.data.vertices)
            polygons.extend([i+offset for i in p.vertices] for p in obj.data.polygons)
        tree=BVHTree.FromPolygons(vertices,polygons)
        def contour(scale,offset):
            points=[]
            for u,v in outline:
                px=x+u*rx*scale;pz=z+v*rz*scale
                hits=[tree.ray_cast(Vector((sign*px,-3,pz)),Vector((0,1,0)))[0] for sign in (-1,1)]
                if any(hit is None for hit in hits):raise ValueError('Angry eye missed face')
                py=sum(hit.y for hit in hits)/2+offset
                points.append(Vector((px,py,pz)))
            return points
        n=len(outline)
        outer=contour(1.18,-.002)
        if depth:
            rear=contour(.76,depth)
            for sign in (-1,1):
                verts=[(sign*p.x,-1,p.z) for p in outer]+[(sign*p.x,p.y+.002,p.z) for p in rear]
                faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
                faces += [(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
                cutter=self.mesh('Temporary eye cavity',verts,faces,background,0)
                # Cut each closed stone separately. A joined mesh of overlapping
                # stones and core is not one solid for a boolean operation.
                for target in targets:
                    bpy.context.view_layer.objects.active=target
                    mod=target.modifiers.new('Recess eye into rock','BOOLEAN')
                    mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
                    bpy.ops.object.modifier_apply(modifier=mod.name)
                bpy.data.objects.remove(cutter,do_unlink=True)
            # The lining ends behind the iris; no iris is a protruding solid.
            verts=outer+rear
            faces=[(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]+[tuple(range(n,2*n))]
            left=self.mesh('EyeSocket.R',verts,faces,background,0)
            self.mirror(left,'EyeSocket.L')
            # Follow the socket's rear cap, rather than sampling a different
            # patch of the rough exterior. Clearance keeps the cap from
            # crossing an iris triangle at oblique angles.
            center=sum(rear,Vector())/n
            points=[center+(p-center)*.92+Vector((0,-.006,0)) for p in rear]
        else:
            # Hoods lean slightly across facets. Mirror the frontal outline,
            # then snap each side to its own face so neither eye sinks into it.
            for sign,side in ((-1,'L'),(1,'R')):
                for label,scale,color,offset in (('EyeSocket',1.18,background,.002),('Eye',1,core,.004)):
                    vertices=[]
                    for ring in (0,.5,1):
                        for u,v in ([(0,0)] if ring==0 else outline):
                            px=sign*(x+u*rx*scale*ring);pz=z+v*rz*scale*ring
                            hit,_,_,_=tree.ray_cast(Vector((px,-3,pz)),Vector((0,1,0)))
                            if hit is None:raise ValueError('Eye missed hood face')
                            vertices.append(hit+Vector((0,-offset,0)))
                    faces=[(0,k+1,(k+1)%n+1) for k in range(n)]
                    faces += [(k+1,(k+1)%n+1,(k+1)%n+1+n,k+1+n) for k in range(n)]
                    self.mesh(f'{label}.{side}',vertices,faces,color,0)
            return
        center=sum(points,Vector())/n
        eye=self.mesh('Eye.R',[center]+points,[(0,k+1,(k+1)%n+1) for k in range(n)],core,0)
        self.mirror(eye,'Eye.L')

    def bridge(self,name,first,second,radius,color='dark'):
        """Connect the nearest armor surfaces with a short overlapping joint."""
        a=[v.co.copy() for v in first.data.vertices]
        b=[v.co.copy() for v in second.data.vertices]
        tree=BVHTree.FromPolygons(b,[p.vertices for p in second.data.polygons])
        pairs=[(p,tree.find_nearest(p)[0]) for p in a]
        start,end=min(pairs,key=lambda pair:(pair[0]-pair[1]).length_squared)
        ca=sum(a,Vector())/len(a);cb=sum(b,Vector())/len(b)
        start += (ca-start).normalized()*radius*.7
        end += (cb-end).normalized()*radius*.7
        return self.tube(name,[start,end],radius,color,5)

    def tube(self,name,points,radii,color,segments=6):
        """Faceted trim or a staff shaft with a radius measured in pixels."""
        verts=[];faces=[]
        for i,p in enumerate(points):
            tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
            tangent.normalize()
            a=tangent.cross(Vector((0,1,0)))
            if a.length<.01:a=tangent.cross(Vector((1,0,0)))
            a.normalize();b=tangent.cross(a)
            radius=radii[i] if isinstance(radii,list) else radii
            for k in range(segments):
                angle=2*math.pi*k/segments
                verts.append(Vector(p)+(a*math.cos(angle)+b*math.sin(angle))*radius)
        for i in range(len(points)-1):
            for k in range(segments):
                a=i*segments+k;b=i*segments+(k+1)%segments
                faces.append((a,b,b+segments,a+segments))
        faces.extend([tuple(range(segments-1,-1,-1)),tuple((len(points)-1)*segments+k for k in range(segments))])
        return self.mesh(name,verts,faces,color)

    def hood(self,name,part,color,depth=.04):
        """Open the measured face contour, with an actual recessed dark cavity."""
        obj=self.loft(name,part,color,8,12)
        rows=self.rows('face','front');rows=rows[np.argsort(rows[:,0])]
        zs=np.linspace(rows[0,0]+.001,rows[-1,0]-.001,7)
        def lip(z,index):
            x=self.edge('face','front',z)[index]
            cx,cy,rx,ry=self.section(part,z)
            return max(cx-rx*.82,min(cx+rx*.82,x)),z
        outline=[lip(z,0) for z in zs]
        outline += [lip(z,1) for z in reversed(zs)]
        # Follow the original hood facets as the head leans forward. A flat
        # back plane sticks out through a tilted chin in a side camera.
        tree=BVHTree.FromPolygons([v.co for v in obj.data.vertices],[p.vertices for p in obj.data.polygons])
        front=[]
        for x,z in outline:
            hit,_,_,_=tree.ray_cast(Vector((x,-3,z)),Vector((0,1,0)))
            if hit is None:raise ValueError(f'{name} opening missed hood at {x,z}')
            front.append(hit)
        n=len(outline)
        cx=sum(x for x,z in outline)/n;cz=sum(z for x,z in outline)/n
        hit,_,_,_=tree.ray_cast(Vector((cx,-3,cz)),Vector((0,1,0)))
        center=hit+Vector((0,depth,0))
        rear=[p+Vector((0,depth,0)) for p in front]
        verts=[(x,-3,z) for x,z in outline]+rear+[center]
        faces=[tuple(range(n-1,-1,-1))]
        faces += [(2*n,n+k,n+(k+1)%n) for k in range(n)]
        faces += [(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
        cutter=self.mesh('Temporary face opening',verts,faces,'void' if 'void' in self.sheet['palette'] else 'dark',0)
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Face cavity','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter,do_unlink=True)
        # The wall and rear surface share the dark palette, while the outer
        # hood keeps its cream or purple facets.
        dark='void' if 'void' in self.sheet['palette'] else 'dark'
        lining=[p+Vector((0,-.001,0)) for p in front+rear]
        wallfaces=[(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
        self.mesh('Hood inner wall',lining,wallfaces,dark,0)
        recess=self.mesh('FaceRecess',[center+Vector((0,-.002,0))]+[p+Vector((0,-.002,0)) for p in rear],
            [(0,(k+1)%n+1,k+1) for k in range(n)],dark,0)
        return obj,recess

    def ribbon(self,name,part,color):
        """A thin folded cloth ribbon, measured across the back silhouette."""
        columns=np.array(self.sheet['columns'][part]['back'])
        columns=columns[np.argsort(columns[:,0])]
        xs=np.linspace(columns[0,0],columns[-1,0],9)
        side=self.rows(part,'right')
        near,far=side[:,1].min(),side[:,2].max()
        verts=[]
        for i,x in enumerate(xs):
            lo=np.interp(x,columns[:,0],columns[:,1]);hi=np.interp(x,columns[:,0],columns[:,2])
            t=i/(len(xs)-1)
            twist=(hi-lo)*.45*t
            y=near+(far-near)*t-twist
            fold=math.sin(i*math.pi/4)*.02
            # Keep the measured front/back width while letting the cloth
            # turn toward the floor at the tips. A vertical strip disappears
            # in the top view; the sheet shows broad, twisting ribbon faces.
            verts.extend([(x,y+twist,lo),(x,y-twist,hi),(x,y+fold,(lo+hi)/2)])
        faces=[]
        for i in range(len(xs)-1):
            a=i*3;b=a+3
            faces.extend([(a,b,b+2),(a,b+2,a+2),(a+2,b+2,b+1),(a+2,b+1,a+1)])
        # Cloth uses the shared double-sided vertex-color material. A thin
        # ribbon needs no duplicate underside or extra draw-call material.
        self.mat.use_backface_culling=False
        return self.mesh(name,verts,faces,color)

    def surface_path(self,name,body,points,color,width):
        """Project trim onto a faceted surface, with no camera-dependent color."""
        tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
        pixel=self.sheet['meters_per_pixel'];center=self.config['center']['front'];ground=self.config['ground']['front']
        verts=[]
        samples=[]
        for start,end in zip(points,points[1:]):
            count=max(2,round(math.dist(start,end)/2))
            samples.extend([(start[0]+(end[0]-start[0])*t/count,start[1]+(end[1]-start[1])*t/count) for t in range(count)])
        samples.append(points[-1])
        for i,(x,y) in enumerate(samples):
            a=samples[max(0,i-1)];b=samples[min(len(samples)-1,i+1)]
            tangent=Vector((b[0]-a[0],b[1]-a[1]));tangent.normalize()
            perpendicular=Vector((-tangent.y,tangent.x))*width
            for sign in (-1,1):
                xx=x+sign*perpendicular.x;yy=y+sign*perpendicular.y
                hit,normal,_,_=tree.ray_cast(Vector(((xx-center)*pixel,-3,(ground-yy)*pixel)),Vector((0,1,0)))
                if hit is None:raise ValueError(f'{name} missed surface at {xx,yy}')
                verts.append(hit+Vector((0,-.012,0)))
        return self.mesh(name,verts,[(2*i,2*i+2,2*i+3,2*i+1) for i in range(len(samples)-1)],color,0)

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
        bpy.ops.export_scene.gltf(filepath=str(self.here/f'{self.kind}-model.glb'),export_format='GLB',
             use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
        # The editable file opens on the colored model, framed for inspection.
        # Viewport settings are editor state, not cameras or helpers in glTF.
        bpy.ops.object.select_all(action='DESELECT')
        direction=Vector((.45,-.78,.5)).normalized()
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type=='VIEW_3D':
                    space=area.spaces.active
                    space.shading.type='SOLID';space.shading.color_type='VERTEX'
                    space.shading.show_cavity=True
                    space.region_3d.view_rotation=direction.to_track_quat('Z','Y')
                    space.region_3d.view_location=(0,0,bounds[2][1]/2)
                    space.region_3d.view_distance=max(bounds[2][1],bounds[0][1]-bounds[0][0])*1.8
                    space.region_3d.view_perspective='ORTHO'
        bpy.ops.wm.save_as_mainfile(filepath=str(self.here/self.config['blend']))
        (self.here/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
        print(json.dumps(audit))
