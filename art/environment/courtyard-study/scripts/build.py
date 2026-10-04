"""Player-scale jade ceramics and supported courtyard furniture."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from study import A,M,H,build,jar,bowl,bench,brazier,fern,rock,roof_frame,stone_portal,scaled,table


def chips():
    a=A()
    for i,(x,y) in enumerate([(-.16,0),(.08,.07),(.16,-.11),(-.10,-.13)]):
        a.extend(rock(.22,.18,.08,seed=i),(x,y,0))
    return a


def incense():
    a=A().box('incense tray',0,0,0,.38,.16,.04,'metal')
    for x in (-.10,0,.10):
        a.beam('incense planted in tray',(x,0,.027),(x+.02,0,.17),.009,'wood-dark',n=5)
    return a


def votives():
    a=A().box('votive plate',0,0,0,.35,.25,.035,'stone')
    for x in (-.11,0,.11):
        a.lathe('unlit candle',[ (.035,.025),(.035,.12)],'sail',at=(x,0,0),n=8)
        a.beam('attached wick',(x,0,.115),(x,0,.132),.005,'dark',n=5)
    return a


def planter():
    a=jar(.31,.24,'stone')
    a.lathe('soil inside planter',[(.19,.025),(.19,.22)],'earth')
    a.extend(fern(),(0,0,.21))
    return a


def tablet():
    a=A().box('tablet foot',0,0,0,.46,.25,.09,'dark')
    a.box('carved tablet',0,0,.07,.31,.13,.54,'stone')
    for z in (.20,.29,.38,.47):
        a.box('inset carving',0,-.063,z,.20,.015,.025,'accent')
    return a


def fountain():
    a=A().lathe('grounded basin foot',[(.55,0),(.55,.11),(.38,.16)],'stone',n=14)
    a.extend(bowl(.58,.16,'light'),(0,0,.13))
    a.lathe('central column',[(.13,.16),(.09,.64),(.15,.69)],'stone',n=10)
    a.extend(bowl(.30,.11,'accent'),(0,0,.675))
    return a


def alcove():
    a=roof_frame(2.0,1.3,1.30,tile=True)
    a.extend(table(.84,.42,.39,True),(0,.27,.15))
    a.extend(incense(),(0,.27,.57))
    a.extend(jar(.30,.13,'accent'),(.57,-.14,.15))
    return a


BUILDERS=[
 ('jade-bowl','Small jade bowl','small',lambda:bowl(.16,.075,'accent')),
 ('stone-chips','Grounded stone chips','small',chips),
 ('incense-tray','Incense in a metal tray','small',incense),
 ('jade-jar','Compact jade jar','small',lambda:jar(.31,.12,'accent')),
 ('votive-plate','Unlit votive plate','small',votives),
 ('handled-urn','Jade urn with attached handles','working',lambda:jar(.50,.20,'accent',True)),
 ('stone-bench','Paired supports and stone seat','working',lambda:bench(1.05,True)),
 ('compact-brazier','Compact bowl brazier','working',brazier),
 ('fern-planter','Fern rooted inside a planter','working',planter),
 ('carved-tablet','Carved courtyard tablet','working',tablet),
 ('courtyard-pergola','Braced timber pergola','large',lambda:roof_frame(2.1,1.25,1.30)),
 ('carved-gateway','Bonded stone gateway','large',lambda:stone_portal(1.65,1.45)),
 ('tiered-fountain','Supported two-tier fountain','large',fountain),
 ('offering-alcove','Roofed offering alcove','large',alcove),
]
build('courtyard',BUILDERS,
 ['Reduced jade urn and brazier proportions beside the current spirit.','Added small ritual details, a low bench and rooted planter.','Added supported pergola, gateway, fountain and offering alcove for the perimeter.'],
 [{'original':'urn-jade','study':'handled-urn'},{'original':'brazier','study':'compact-brazier'},{'original':'rocks-tall','study':'stone-chips'}],
 palette={'stone':'8D8D80','light':'AAA997','edge':'CCC7AE','dark':'55584E','accent':'709B83','metal':'66745F','wood':'927653','earth':'8E8363','green':'72865D','warm':'C9AE6F','snow':'CBCDBE','cloth':'9A8974'})
