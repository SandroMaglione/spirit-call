"""Sheet-space facial details authored once and reflected across the centerline."""
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


class Face:
    def __init__(self,model,shell):
        self.m=model;self.shell=shell
        self.tree=BVHTree.FromPolygons([v.co for v in shell.data.vertices],[p.vertices for p in shell.data.polygons])

    def point(self,pixel,offset):
        x,y=pixel;m=self.m
        origin=Vector(((x-m.config['center']['front'])*m.sheet['meters_per_pixel'],-3,
                       (m.config['ground']['front']-y)*m.sheet['meters_per_pixel']))
        hit,_,_,_=self.tree.ray_cast(origin,Vector((0,1,0)))
        if hit is None:raise ValueError(f'Face detail outside measured shell: {pixel}')
        hit.y-=offset
        return hit

    def patch(self,name,points,color,offset=.003):
        obj=self.m.surface_patch(name+'.L',self.shell,points,color)
        for v in obj.data.vertices:v.co.y-=offset
        # Clipping preserves contact with the shell, while dissolving the
        # coplanar subdivisions leaves room for expressive details.
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        bmesh.ops.dissolve_limit(bm,angle_limit=.0001,verts=list(bm.verts),edges=list(bm.edges))
        bm.to_mesh(obj.data);bm.free();obj.data.update()
        return obj,self.m.mirror(obj,name+'.R')

    def relief(self,name,points,color,offset=.014,rise=.004):
        center=(sum(p[0] for p in points)/len(points),sum(p[1] for p in points)/len(points))
        verts=[self.point(center,offset+rise)]+[self.point(p,offset) for p in points]
        obj=self.m.mesh(name+'.L',verts,[(0,i,1 if i==len(points) else i+1) for i in range(1,len(points)+1)],color,0)
        return obj,self.m.mirror(obj,name+'.R')

    def strip(self,name,outer,inner,color,offset=.014,steps=5):
        pairs=[]
        # Short spans follow the faceted shell without long edges sinking
        # into it at a change in slope.
        for j in range(len(outer)-1):
            for step in range(steps):
                t=step/steps
                pairs.append(tuple(tuple(a+(b-a)*t for a,b in zip(edge[j],edge[j+1])) for edge in (outer,inner)))
        pairs.append((outer[-1],inner[-1]))
        verts=[self.point(p,offset) for pair in pairs for p in pair]
        obj=self.m.mesh(name+'.L',verts,[(i,i+1,i+3,i+2) for i in range(0,len(verts)-2,2)],color,0)
        return obj,self.m.mirror(obj,name+'.R')


def gale_face(m,hood):
    f=Face(m,hood)
    f.patch('FaceVoid',[(148,288),(139,298),(131,312),(132,321),(140,329),(148,333)],'#13272C',.003)
    f.strip('HoodLip',[(148,286),(137,298),(128,312),(130,323),(139,330),(148,335)],
                     [(148,288),(139,298),(131,312),(132,321),(140,329),(148,333)],'#C6BBA4')
    f.patch('ShadowCheek',[(134,317),(136,320),(143,325)],'#1D363A',.006)
    f.relief('EyeSocket',[(134,307),(137,303),(141,303),(144,307),(142,312),(137,313)],'#10262D',.016,.002)
    f.relief('Eye',[(136,307),(138,305),(140,305),(142,307),(140,310),(138,311)],'#50F0ED',.022,.001)
    f.relief('EyeCore',[(138,306),(140,306),(140,308),(138,309)],'#C3FFF5',.026,.001)


def juggernaut_face(m,head):
    f=Face(m,head)
    f.patch('FaceRecess',[(148,344),(137,336),(130,342),(132,358),(140,369),(148,373)],'#202329',.003)
    f.strip('HelmetBinding',[(138,332),(130,342),(132,360),(142,372),(148,374)],
                           [(141,333),(134,342),(138,357),(145,368),(148,370)],'gold',.036,6)
    f.relief('Brow',[(132,339),(137,338),(146,346),(144,349),(138,346),(132,344)],'#55575E',.016,.003)
    f.relief('EyeSocket',[(135,345),(138,345),(145,350),(143,354),(139,353),(136,349)],'#101216',.022,.002)
    f.relief('Eye',[(136,346),(138,347),(143,350),(141,352),(138,351),(136,348)],'#FFE65B',.028,.001)
    f.relief('EyeCore',[(137,347),(139,348),(141,350),(139,350),(138,349)],'#FFF7AE',.032,.001)
    f.relief('ForeheadCrest',[(148,322),(140,329),(137,336),(148,345)],'#777980',.018,.012)
    f.relief('NoseGuard',[(148,347),(144,353),(145,363),(148,367)],'#474B52',.027,.012)
