"""Compact burial goods, symmetric guardian sculpture and supported sandstone courts."""
import math
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from study import A,M,H,build,jar,bowl,table,rock,stone_portal,roof_frame,scaled


def canopic():
    a=jar(.25,.12,'light')
    a.lathe('canopic lid and head',[(.067,.242),(.070,.275),(.062,.33),(.029,.35)],'stone',n=8)
    a.box('carved face relief',0,-.057,.29,.065,.022,.038,'accent')
    return a


def shard_pile():
    a=A()
    for i in range(5):
        a.extend(rock(.16,.12,.045,'cloth',i),(.13*math.cos(i*2.3),.12*math.sin(i*2.3),0))
    return a


def linen():
    return scaled(H.folded_sail(),.64)


def tablet():
    a=A().box('stone tablet',0,0,0,.34,.25,.055,'stone')
    for i in range(3):a.box('inset glyph',-.09+i*.09,0,.047,.032,.12,.012,'accent')
    return a


def offering_table():
    a=table(.87,.51,.39,True)
    a.extend(bowl(.135,.055,'metal'),(-.23,0,.42))
    a.extend(canopic(),(.24,.02,.42))
    return a


def guardian():
    a=A().box('guardian stone foot',0,0,0,.62,.39,.10,'dark')
    a.lathe('carved guardian body',[(.16,.085),(.12,.29),(.18,.51),(.15,.62),(.07,.68)],'stone',n=10)
    a.lathe('carved guardian head',[(.067,.65),(.10,.73),(.095,.82),(.052,.91)],'light',n=8)
    a.beam('attached stone beak',(0,-.073,.79),(0,-.18,.77),.039,'stone',n=6,end=.010)
    for s in (-1,1):
        outline=[(.10,.43),(.33,.47),(.46,.69),(.39,.89),(.25,.77),(.12,.64)]
        a.add(M().shell([[(s*x,y,z) for x,z in outline] for y in (-.04,.06)],['stone','light']), 'mirrored wing carved into shoulder')
        a.box('inset guardian eye',s*.041,-.080,.813,.018,.020,.018,'dark')
        for i in range(3):
            a.beam('attached feather relief',(s*(.16+i*.06),-.047,.51+i*.07),(s*(.29+i*.04),-.047,.65+i*.08),.011,'accent',n=5)
    return a


def sarcophagus():
    a=A().box('coffin ground base',0,0,0,.58,1.18,.08,'dark')
    a.box('coffin body',0,0,.065,.49,1.09,.30,'stone')
    a.box('fitted coffin lid',0,0,.345,.55,1.15,.08,'light')
    a.box('inset lid panel',0,0,.412,.31,.84,.016,'accent')
    a.lathe('carved head on lid',[(.063,.423),(.063,.45)],'stone',n=8,at=(0,.28,0))
    for y in (-.31,-.12,.07):a.box('lid relief band',0,y,.42,.31,.034,.019,'stone')
    return a


def jar_trio():
    a=A().box('burial goods tray',0,0,0,.71,.30,.04,'stone')
    for x in (-.23,0,.23):a.extend(canopic(),(x,0,.035))
    return a


def stele():
    a=A().box('stele foot',0,0,0,.54,.36,.10,'dark')
    a.box('stele upright',0,0,.08,.32,.18,.81,'stone')
    a.box('stele cap',0,0,.84,.39,.25,.07,'light')
    for z in (.25,.37,.49,.61,.73):a.box('recessed glyph',0,-.089,z,.20,.013,.032,'accent')
    return a


def tomb_portal():
    a=stone_portal(1.65,1.35,.55)
    for x in (-.825,.825):
        for z in (.36,.68,1.0):a.box('inset pier band',x,-.274,z,.19,.018,.045,'accent')
    a.box('lintel seal',0,-.302,1.38,.24,.025,.11,'accent')
    return a


def burial_dais():
    a=A().box('dais foundation',0,0,0,1.45,1.70,.15,'dark')
    a.box('dais coping',0,0,.13,1.40,1.65,.09,'stone')
    a.extend(sarcophagus(),(-.16,.10,.21))
    a.extend(jar_trio(),(.24,-.62,.21))
    return a


def sun_altar():
    a=A().box('altar base',0,0,0,1.25,.74,.12,'dark')
    a.box('supporting central pier',0,.12,.10,.27,.28,1.00,'stone')
    a.ring('sun disc',.37,.055,'metal',at=(0,.08,.96),axis='X',n=16)
    for ang in (0,math.pi/3,math.pi*2/3):
        a.beam('sun spokes',(-.35*math.cos(ang),.08,.96-.35*math.sin(ang)),(.35*math.cos(ang),.08,.96+.35*math.sin(ang)),.028,'accent',n=6)
    a.extend(table(.90,.40,.34,True),(0,-.19,.115))
    a.extend(bowl(.15,.065,'metal'),(0,-.19,.485))
    return a


def awning():
    a=roof_frame(2.10,1.30,1.27)
    a.extend(offering_table(),(-.27,.21,.15))
    a.extend(jar(.48,.19,'cloth',True),(.59,-.15,.15))
    a.extend(linen(),(-.56,-.24,.15))
    return a


build('ochre-necropolis',[
 ('offering-bowl','Compact offering bowl','small',lambda:bowl(.16,.065,'metal')),('canopic-jar','Lidded canopic jar','small',canopic),
 ('pottery-shards','Pottery shards on the ground','small',shard_pile),('folded-linen','Folded and tied burial linen','small',linen),
 ('glyph-tablet','Inlaid stone tablet','small',tablet),
 ('handled-amphora','Amphora with attached handles','working',lambda:jar(.50,.19,'cloth',True)),
 ('offering-table','Low offering table and vessels','working',offering_table),('wing-guardian','Symmetric folded-wing guardian','working',guardian),
 ('fitted-sarcophagus','Fitted sarcophagus and lid relief','working',sarcophagus),('canopic-trio','Three jars on a grounded tray','working',jar_trio),
 ('tomb-gateway','Bonded sandstone tomb gateway','large',tomb_portal),('burial-dais','Supported burial dais','large',burial_dais),
 ('sun-altar','Sun disc with pier and spokes','large',sun_altar),('offering-awning','Braced offering awning','large',awning)],
 ['Reduced urn, offering-table and burial-goods proportions; fitted the sarcophagus lid.','Rebuilt the guardian with mirrored folded wings, attached feather relief and a carved face.','Added small ritual details, a bonded tomb gateway, burial dais, supported sun altar and offering awning.'],
 [{'original':'wing-statue','study':'wing-guardian'},{'original':'urn-tall','study':'handled-amphora'},{'original':'sarcophagus','study':'fitted-sarcophagus'}])
