"""Supported pipework, repair details and compact cistern machinery."""
import math
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from study import A,M,H,build,jar,table,lamp,roof_frame


def fitting():
    a=A().lathe('pipe flange',[(.16,0),(.16,.06),(.09,.07)],'metal',n=12)
    a.lathe('pipe collar',[(.09,.05),(.09,.16),(.07,.16),(.07,.05)],'metal-light',cyclic=True)
    for i in range(6):
        a.lathe('flange bolt',[(.014,.05),(.014,.082)],'metal-light',n=6,at=(.126*math.cos(i*math.tau/6),.126*math.sin(i*math.tau/6),0))
    return a


def seals():
    a=A()
    for z in (.018,.049,.080):
        a.ring('rubber seal',.12,.022,'dark',at=(0,0,z))
    return a


def gauge():
    a=A().lathe('pressure gauge body',[(.11,0),(.11,.045),(.105,.059)],'metal',n=12)
    a.lathe('dial face',[(.09,.055),(.09,.066)],'sail',n=12)
    a.beam('dial needle',(0,0,.068),(.04,.055,.068),.006,'dark',n=5)
    for i in range(7):
        angle=i*math.pi/6
        a.beam('dial tick',(.066*math.cos(angle),.066*math.sin(angle),.067),(.080*math.cos(angle),.080*math.sin(angle),.067),.003,'dark',n=5)
    return a


def tools():
    a=A().box('tool tray',0,0,0,.46,.25,.025,'wood-dark')
    for x in (-.10,.10):
        a.beam('wrench handle',(x,-.09,.04),(x,.075,.04),.016,'metal',n=6)
        a.ring('wrench head',.037,.013,'metal',at=(x,.085,.04),n=8)
    return a


def pipe_run():
    a=A()
    for x in (-.34,.34):
        a.box('pipe saddle foot',x,0,0,.17,.30,.22,'stone')
    a.beam('supported pipe',(-.53,0,.23),(.53,0,.23),.115,'metal',n=12)
    for x in (-.50,.50):
        a.ring('pipe flange',.126,.025,'metal-light',at=(x,0,.23),axis='Y')
    return a


def pump():
    a=A().box('bolted pump foot',0,0,0,.45,.38,.07,'stone')
    a.lathe('pump column',[(.12,.05),(.12,.18),(.085,.65),(.12,.71)],'metal',n=10)
    a.beam('pump spout',(0,0,.47),(.28,0,.47),.045,'metal',n=8)
    a.beam('spout bend',(.27,0,.47),(.27,0,.39),.045,'metal',n=8)
    a.beam('handle pivot',(-.13,0,.68),(.13,0,.68),.038,'metal-light')
    a.beam('connected pump handle',(-.06,0,.68),(.35,0,.83),.027,'metal')
    a.beam('wood grip',(.29,0,.806),(.40,0,.847),.035,'wood')
    for x in (-.16,.16):
        a.lathe('mount bolt',[(.018,.05),(.018,.083)],'metal-light',n=6,at=(x,-.11,0))
    return a


def valve():
    a=A().box('valve plinth',0,0,0,.43,.38,.07,'stone')
    a.lathe('valve pipe body',[(.105,.05),(.105,.58)],'metal',n=10)
    a.beam('wheel axle',(0,-.01,.47),(0,-.17,.47),.026,'metal')
    a.ring('hand wheel',.16,.023,'metal-light',at=(0,-.17,.47),axis='X')
    for angle in (0,math.pi/3,math.pi*2/3):
        a.beam('connected wheel spoke',(-.15*math.cos(angle),-.17,.47-.15*math.sin(angle)),(.15*math.cos(angle),-.17,.47+.15*math.sin(angle)),.015,'metal')
    return a


def service_bench():
    a=table(.90,.46,.41)
    a.extend(tools(),(-.18,0,.442))
    a.extend(gauge(),(.27,0,.442))
    return a


def outlet():
    a=A().box('masonry outlet back',0,.06,0,.62,.30,.64,'stone')
    a.beam('outlet pipe',(0,.08,.39),(0,-.32,.39),.115,'metal',n=12)
    a.ring('outlet flange',.13,.025,'metal-light',at=(0,-.26,.39),axis='X')
    a.beam('dark pipe opening',(0,-.314,.39),(0,-.329,.39),.080,'dark',n=12)
    a.box('drip channel',0,-.25,0,.45,.62,.06,'dark')
    for x in (-.23,.23):a.box('channel side',x,-.25,0,.07,.62,.14,'stone')
    return a


def pump_bank():
    a=H.deck(1.75,1.06,.14)
    for x in (-.53,.53):a.extend(pump(),(x,.12,.135))
    a.beam('connected collection pipe',(-.63,.13,.35),(.63,.13,.35),.10,'metal',n=12)
    for x in (-.31,.31):a.box('collection pipe cradle',x,.13,.13,.10,.25,.17,'stone')
    a.extend(jar(.31,.15,'accent'),(0,-.25,.135))
    return a


def manifold():
    a=A().box('manifold foundation',0,0,0,2.10,.95,.12,'stone')
    for x in (-.82,.82):
        a.beam('upright pipe',(x,0,.10),(x,0,1.15),.12,'metal',n=12)
        a.ring('upright flange',.134,.03,'metal-light',at=(x,0,.26))
    a.beam('top connecting pipe',(-.82,0,1.14),(.82,0,1.14),.12,'metal',n=12)
    for x in (-.48,.48):a.extend(valve(),(x,-.04,.115))
    a.beam('valve feed pipe',(-.48,0,.64),(.48,0,.64),.09,'metal',n=10)
    return a


def tank():
    a=A().lathe('tank wall',[(.67,0),(.67,.62),(.59,.62),(.59,.07)],'stone',n=16,cyclic=True)
    a.lathe('tank floor',[(.66,0),(.66,.085)],'dark',n=16)
    a.lathe('still water on floor',[(.585,.075),(.585,.09)],'accent',n=16)
    a.ring('tank rim',.635,.047,'light',at=(0,0,.61),n=16)
    for x in (-.24,.24):
        a.box('ladder foot',x,-.69,0,.075,.08,.65,'metal')
        a.beam('ladder rim bracket',(x,-.69,.64),(x,-.56,.64),.025,'metal')
    for z in (.13,.28,.43,.58):a.beam('ladder rung',(-.24,-.69,z),(.24,-.69,z),.025,'metal-light')
    return a


def workshop():
    a=roof_frame(2.0,1.22,1.28,True)
    a.extend(service_bench(),(0,.26,.15));a.extend(lamp(),(.59,-.18,.15))
    a.extend(H.bucket(),(-.60,-.12,.15))
    return a


build('flooded-cistern',[
 ('pipe-fitting','Bolted pipe fitting','small',fitting),('gasket-stack','Grounded gasket stack','small',seals),
 ('pressure-gauge','Pressure gauge with attached dial','small',gauge),('repair-tools','Wrenches resting in a tray','small',tools),
 ('water-jar','Compact water jar','small',lambda:jar(.32,.14,'accent')),
 ('hand-pump','Compact hand pump','working',pump),('supported-pipe','Pipe on paired saddles','working',pipe_run),
 ('valve-wheel','Wheel, axle and valve body','working',valve),('service-bench','Repair workbench','working',service_bench),
 ('masonry-outlet','Supported pipe outlet and channel','working',outlet),
 ('pump-bank','Grounded twin pump bank','large',pump_bank),('valve-manifold','Connected valve manifold','large',manifold),
 ('settling-tank','Open tank with grounded ladder','large',tank),('repair-canopy','Roofed maintenance station','large',workshop)],
 ['Rebuilt pump handles, wheel spokes and pipe supports at everyday prop scale.','Added repair fittings, gaskets, dial gauges, tools and water jars.','Added connected pump bank, manifold, settling tank and roofed service station outside the grid.'],
 [{'original':'pump','study':'hand-pump'},{'original':'valve','study':'valve-wheel'},{'original':'urn','study':'water-jar'}])
