"""Winter court props with connected bells, fitted lanterns and supported roofs."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from study import A,M,H,build,jar,bowl,bench,book_stack,scaled,rock,roof_frame,stone_portal,table,brazier


def incense():
    a=bowl(.13,.085,'metal')
    for x in (-.04,0,.04):a.beam('incense planted in bowl',(x,0,.021),(x+.02,0,.25),.007,'wood-dark',n=5)
    return a


def ice_chips():
    a=A()
    for i,(x,y,h) in enumerate([(-.10,0,.18),(.10,.03,.12),(0,-.10,.09)]):
        a.lathe('ice rooted at ground',[(.075,0),(.067,h*.62),(.01,h)],'snow',n=6,at=(x,y,0))
    return a


def bell_body(a,z,r=.23,h=.40):
    a.lathe('cast bell shell',[(r,z),(r,z+.055),(r*.70,z+h*.62),(r*.20,z+h),
        (r*.13,z+h-.015),(r*.58,z+h*.57),(r*.80,z+.065),(r*.80,z+.018)],'metal',n=12,cyclic=True)
    a.lathe('bell crown',[(r*.22,z+h-.028),(r*.22,z+h+.03)],'metal-light',n=10)
    a.beam('clapper joined to bell crown',(0,0,z+h),(0,0,z+.027),.016,'metal')
    a.lathe('clapper weight',[(.035,z+.025),(.035,z+.065)],'metal-light',n=8)


def bell_frame():
    a=A()
    for x in (-.34,.34):
        a.box('bell frame foot',x,0,0,.18,.36,.055,'wood-dark')
        a.box('bell frame upright',x,0,.035,.08,.08,.88,'wood')
    a.beam('bell bearing rail',(-.41,0,.85),(.41,0,.85),.042,'wood-dark')
    bell_body(a,.36,.15,.29)
    a.beam('visible bell hanger',(0,0,.66),(0,0,.87),.022,'metal')
    return a


def lantern():
    a=A().box('lantern base',0,0,0,.46,.42,.075,'stone')
    a.lathe('stone lantern pillar',[(.16,.06),(.095,.16),(.10,.54),(.19,.58)],'stone',n=8)
    a.box('lantern floor',0,0,.55,.38,.35,.065,'light')
    a.box('warm glass sitting on floor',0,0,.605,.17,.17,.19,'warm')
    for x in (-.15,.15):
        for y in (-.135,.135):a.box('lantern roof support',x,y,.59,.045,.045,.24,'stone')
    a.lathe('supported stone lantern roof',[(.29,.805),(.20,.87),(.045,.94)],'light',n=4)
    a.lathe('snow resting on lantern roof',[(.215,.846),(.18,.883),(.039,.956)],'snow',n=4)
    return a


def prayer_banner():
    a=A().box('banner foot',0,0,0,.40,.34,.065,'stone')
    a.box('banner pole',0,0,.045,.065,.07,.99,'wood-dark')
    a.beam('cloth crossbar',(-.25,0,.98),(.25,0,.98),.025,'wood')
    a.box('prayer cloth attached to rail',0,-.019,.38,.43,.034,.61,'cloth')
    for z in (.50,.64,.78):a.box('embroidered prayer line',0,-.034,z,.19,.013,.026,'accent')
    return a


def firewood():
    a=A().box('wood rack foot',0,0,0,.69,.45,.045,'wood-dark')
    for x in (-.29,.29):a.box('wood rack side',x,0,.025,.06,.43,.33,'wood')
    for x in (-.14,0,.14):a.beam('lower log',(x,-.19,.10),(x,.19,.10),.078,'wood-dark',n=8)
    for x in (-.075,.075):a.beam('upper log resting on lower logs',(x,-.18,.23),(x,.18,.23),.077,'wood',n=8)
    return a


def snow_roof(a,w,d,h):
    for s in (-1,1):
        a.add(M().shell([[(0,y,h+.325),(s*w*.54,y,h+.035),(s*w*.54,y,h+.066),(0,y,h+.356)]
            for y in (-d*.58,d*.58)],['snow']), 'snow touching roof panels')


def bell_tower():
    a=roof_frame(1.55,1.00,1.70,True)
    snow_roof(a,1.55,1.00,1.70)
    bell_body(a,.86,.24,.48)
    a.beam('bell hanger fixed to roof tie',(0,0,1.35),(0,0,1.74),.034,'metal')
    a.beam('transverse bearing tie',(-.64,0,1.72),(.64,0,1.72),.055,'wood-dark')
    return a


def shrine_pavilion():
    a=roof_frame(2.10,1.30,1.28,True)
    snow_roof(a,2.10,1.30,1.28)
    a.extend(table(.84,.45,.38,True),(0,.26,.15))
    a.extend(incense(),(0,.26,.56))
    a.extend(bench(.91,True),(0,-.35,.15))
    return a


def cloister_gate():
    a=stone_portal(1.65,1.45,.53)
    a.box('snow resting on lintel',0,0,1.605,1.94,.53,.055,'snow')
    for x in (-.825,.825):a.box('attached pier inlay',x,-.267,.53,.16,.018,.48,'accent')
    return a


def winter_hearth():
    a=A().box('hearth slab',0,0,0,1.72,1.02,.13,'dark')
    for x in (-.64,.64):a.box('hearth pier',x,.15,.11,.25,.40,.80,'stone')
    a.box('hearth back',0,.31,.11,1.4,.18,.72,'stone')
    a.box('supported hearth lintel',0,.16,.83,1.57,.51,.14,'light')
    a.box('snow resting on hearth lintel',0,.16,.96,1.53,.47,.045,'snow')
    a.extend(scaled(brazier(),.75),(-.27,-.08,.125))
    a.extend(firewood(),(.43,-.20,.125))
    return a


build('frostbound-monastery',[
 ('tea-cup','Open tea cup','small',lambda:jar(.12,.06,'accent')),('prayer-books','Grounded prayer book stack','small',lambda:scaled(book_stack(),.73)),
 ('folded-mat','Folded and tied prayer mat','small',lambda:scaled(H.folded_sail(),.69)),('incense-bowl','Incense fixed inside a bowl','small',incense),
 ('ice-chips','Grounded ice fragments','small',ice_chips),
 ('cloister-bench','Low cloister bench','working',lambda:bench(1.10,True)),('small-bell-frame','Bell connected to bearing rail','working',bell_frame),
 ('fitted-lantern','Stone lantern with roof supports','working',lantern),('prayer-banner','Prayer cloth fixed to crossbar','working',prayer_banner),
 ('firewood-rack','Logs resting in a grounded rack','working',firewood),
 ('bell-tower','Supported bell tower and attached snow','large',bell_tower),('shrine-pavilion','Snow-roofed shrine pavilion','large',shrine_pavilion),
 ('cloister-gateway','Bonded cloister gate with snow cap','large',cloister_gate),('winter-hearth','Supported winter hearth and wood store','large',winter_hearth)],
 ['Reduced benches, lanterns and banners; connected every bell to a visible hanger and bearing rail.','Added tea cups, prayer books, folded mats, planted incense, grounded ice and stacked firewood.','Added a snow-roofed bell tower, shrine pavilion, bonded cloister gate and winter hearth outside the grid.'],
 [{'original':'bell','study':'small-bell-frame'},{'original':'lantern-post','study':'fitted-lantern'},{'original':'bench','study':'cloister-bench'}],
 palette={'metal-light':'B1B8BB'})
