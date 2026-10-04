"""Connected roots and foliage, readable small growth and grounded shrine ruins."""
import math
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from study import A,M,H,build,rock,fern as base_fern,mushrooms,tree,branch,bench


def fern():
    a=base_fern()
    for name,mesh in a.parts:
        if name!='leaf attached to frond':continue
        rings=[mesh.vertices[:5],mesh.vertices[5:]]
        mesh.vertices=[]
        for ring in rings:
            center=tuple(sum(v[i] for v in ring)/5 for i in range(3))
            mesh.vertices.extend(tuple(center[i]+(v[i]-center[i])*1.7 for i in range(3)) for v in ring)
    return a


def litter():
    a=A()
    for i in range(7):
        leaf=M().lathe([(.018,0),(.058,.015),(.018,.029)],['green' if i%2 else 'cloth'],n=8)
        leaf.vertices=[(x*2,y,z*.5) for x,y,z in leaf.vertices]
        leaf.rotate(i*.73).move(.15*math.cos(i*2),.15*math.sin(i*2),0)
        a.add(leaf,'fallen leaf on ground')
    return a


def seedling():
    a=rock(.22,.20,.055,'earth')
    for x in (-.06,.06):
        branch(a,(x,0,.02),(x,.025,.25),.016,'green')
        a.lathe('seed pod attached to stem',[(.015,.19),(.065,.25),(.030,.34)],'warm',n=8,at=(x,.025,0))
    return a


def moss_stones():
    a=rock(.44,.36,.19)
    a.add(M().rock(0,0,.145,.29,.24,.07,'green',2),'moss attached to stone')
    return a


def stump():
    a=A().lathe('hollow trunk',[(.28,0),(.23,.48),(.18,.49),(.17,.085)],'wood-dark',n=12,cyclic=True)
    a.lathe('stump inner floor',[(.25,0),(.23,.10)],'wood',n=12)
    for i in range(6):
        ang=i*math.tau/6
        branch(a,(.17*math.cos(ang),.17*math.sin(ang),.20),(.41*math.cos(ang),.34*math.sin(ang),.015),.067,'wood-dark')
    a.lathe('shelf fungus anchored in bark',[(.03,0),(.14,.06),(.12,.09)],'warm',n=10,at=(.20,0,.26))
    return a


def log():
    a=A().beam('fallen trunk',(-.64,0,.16),(.64,0,.16),.17,'wood-dark',n=12)
    for x in (-.64,.64):
        a.beam('cut end grain',(x-.008,0,.16),(x+.008,0,.16),.148,'wood-light',n=12)
    a.add(M().rock(0,0,.295,.56,.23,.08,'green',1),'moss joined to trunk')
    branch(a,(.15,0,.16),(.25,.29,.30),.047)
    return a


def shrine():
    a=A().box('shrine ground slab',0,0,0,.72,.48,.10,'dark')
    for x in (-.24,.24):a.box('shrine pier',x,0,.08,.14,.30,.54,'stone')
    a.box('shrine lintel',0,0,.56,.74,.40,.12,'light')
    a.box('recessed altar',0,.07,.09,.28,.20,.16,'stone')
    a.lathe('altar token resting on ledge',[(.065,.235),(.065,.27)],'accent',n=8,at=(0,-.01,0))
    branch(a,(-.28,.07,.02),(-.24,.03,.59),.028,'wood')
    a.add(M().rock(-.20,0,.64,.35,.27,.08,'green',1),'moss resting on lintel')
    return a


def root_arch():
    a=A()
    for s in (-1,1):
        H.path(a,'root arch',[(s*.86,0,.02),(s*.79,.05,.57),(s*.56,.05,1.14),(s*.24,0,1.45),(0,0,1.50)],.13,'wood-dark',n=9)
        for y in (-.29,.29):branch(a,(s*.85,0,.18),(s*1.03,y,.02),.070)
        a.add(M().rock(s*.57,0,1.07,.42,.32,.25,'green',2),'foliage on arch branch')
    return a


def shrine_grove():
    a=rock(2.1,1.10,.11,'earth')
    a.extend(shrine(),(0,.13,.10))
    for x in (-.72,.72):a.extend(mushrooms(.55,True),(x,.05,.035))
    a.extend(fern(),(0,-.26,.075))
    return a


def root_wall():
    a=A().box('ruin foundation',0,0,0,2.0,.62,.13,'dark')
    for i in range(4):
        a.box('bonded ruin course',-.29,0,.10+i*.20,1.4,.35,.205,'stone' if i%2 else 'light')
    a.box('short broken end',.69,0,.10,.38,.35,.39,'stone')
    H.path(a,'connected root over masonry',[(-.96,-.12,.01),(-.71,-.20,.30),(-.45,-.20,.70),(-.10,0,.90),(.20,.16,.93)],.065,'wood-dark',n=7)
    a.add(M().rock(-.32,0,.86,1.10,.36,.10,'green',4),'moss cap touching courses')
    return a


def giant_growth():
    a=rock(1.7,1.15,.10,'earth')
    a.extend(mushrooms(1.3),(0,.12,.06))
    a.extend(mushrooms(.50,True),(-.46,-.12,.06))
    a.extend(fern(),(.47,-.11,.055))
    return a


build('overgrown-sanctuary',[
 ('ground-fern','Branching grounded fern','small',fern),('small-mushrooms','Rooted mushroom cluster','small',lambda:mushrooms(.30,True)),
 ('fallen-leaves','Individual fallen leaves','small',litter),('seed-pods','Seed pods attached to stems','small',seedling),
 ('moss-stone','Moss touching a worn stone','small',moss_stones),
 ('hollow-stump','Rooted hollow stump and shelf fungus','working',stump),('fallen-log','Fallen log with attached moss','working',log),
 ('rooted-sapling','Sapling with branches and joined canopy','working',lambda:tree(1.06)),('compact-shrine','Small grounded shrine','working',shrine),
 ('timber-seat','Low supported timber seat','working',lambda:bench(.90)),
 ('root-gateway','Continuous rooted gateway','large',root_arch),('shrine-grove','Shrine with rooted side growth','large',shrine_grove),
 ('rooted-ruin','Broken wall with connected roots','large',root_wall),('mushroom-garden','Grounded mushroom garden','large',giant_growth)],
 ['Replaced coarse plant silhouettes with connected stems, fronds, roots and branch-supported canopies.','Reduced shrine and stump sizes; added leaf litter, seed pods, moss stones and low seating.','Added a continuous root gateway, shrine grove, rooted ruin and mushroom garden around the perimeter.'],
 [{'original':'sapling','study':'rooted-sapling'},{'original':'fern','study':'ground-fern'},{'original':'shrine','study':'compact-shrine'}])
