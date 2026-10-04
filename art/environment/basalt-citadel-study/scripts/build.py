"""Connected military equipment, restrained banners and supported siege-yard assemblies."""
import math
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from study import A,M,H,build,brazier,table,roof_frame,scaled,recolor


def pouch():
    a=A().box('cloth supply pouch',0,0,0,.27,.21,.18,'cloth',bevel=.045)
    a.box('folded pouch flap',0,-.095,.105,.24,.04,.09,'cloth',bevel=.022)
    a.box('attached pouch clasp',0,-.118,.12,.055,.025,.043,'metal-light')
    return a


def torch_bundle():
    a=A()
    for x in (-.035,.035):
        a.beam('torch wood on ground',(x,-.20,.033),(x,.20,.033),.029,'wood',n=7)
        a.beam('torch cloth wrapping',(x,.11,.033),(x,.22,.033),.04,'sail',n=8)
    H.path(a,'rope binding around torches',[(-.065,0,.033),(-.06,0,.055),(0,0,.06),(.06,0,.055),
        (.065,0,.033),(.035,0,.007),(-.035,0,.007),(-.065,0,.033)],.008,'rope')
    return a


def spare_rings():
    a=A()
    for x,y in [(-.07,0),(.07,0),(0,.12)]:a.ring('loose metal ring',.065,.015,'metal-light',at=(x,y,.013),n=10)
    return a


def shield_flat():
    a=A().lathe('shield resting on ground',[(.17,0),(.18,.025),(.14,.048)],'metal',n=10)
    a.lathe('shield boss',[(.045,.039),(.03,.07)],'metal-light',n=8)
    a.box('shield stripe',0,0,.035,.07,.30,.019,'cloth')
    return a


def rack(shields=False):
    a=A()
    for x in (-.55,.55):
        a.box('rack ground foot',x,0,0,.19,.40,.07,'wood-dark')
        a.box('rack upright',x,0,.04,.075,.08,.84,'wood')
    a.beam('bearing top rail',(-.61,0,.72),(.61,0,.72),.045,'wood-dark')
    a.beam('rack lower rail',(-.55,0,.24),(.55,0,.24),.030,'wood')
    for x in (-.36,0,.36):
        if shields:
            profile=[(-.14,.74),(.14,.74),(.18,.52),(0,.26),(-.18,.52)]
            a.add(M().shell([[(x+xx,y,z) for xx,z in profile] for y in (-.075,-.008)],['metal']), 'shield attached to rack rail')
            a.box('shield center stripe',x,-.077,.42,.055,.018,.29,'cloth')
            a.beam('attached shield boss',(x,-.069,.58),(x,-.12,.58),.036,'metal-light')
        else:
            a.beam('spear shaft',(x,-.035,.08),(x,-.035,.95),.017,'wood')
            a.lathe('spear head',[(.045,.85),(.006,1.05)],'metal-light',n=6,at=(x,-.035,0))
            a.box('rack shaft clip',x,-.038,.69,.065,.065,.065,'metal')
    return a


def banner():
    a=A().box('banner ground foot',0,0,0,.46,.38,.08,'stone')
    a.box('banner pole',0,0,.06,.065,.07,1.12,'wood-dark')
    a.beam('banner crossbar',(-.29,0,1.13),(.29,0,1.13),.025,'metal')
    a.box('cloth fixed to crossbar',0,-.015,.52,.49,.035,.62,'cloth',bevel=.012)
    a.box('stitched cloth stripe',0,-.032,.59,.08,.012,.44,'warm')
    return a


def war_table():
    a=table(.95,.57,.42)
    a.box('map on tabletop',0,0,.453,.66,.42,.012,'sail')
    for x,y in [(-.16,-.08),(.18,.09),(.11,-.09)]:
        a.lathe('tactical marker on map',[(.027,.463),(.009,.507)],'cloth',n=6,at=(x,y,0))
    return a


def reinforced_crate():
    a=H.crate(.52,.42,.40)
    for x in (-.25,.25):
        for y in (-.195,.195):a.box('iron corner reinforcement',x,y,.02,.04,.045,.37,'metal')
    return a


def throne():
    a=A()
    for x in (-.27,.27):
        for y in (-.21,.21):a.box('throne leg',x,y,0,.11,.11,.43,'stone')
    a.box('throne seat',0,0,.35,.70,.58,.11,'light')
    a.box('throne back',0,.235,.37,.70,.11,.67,'stone')
    a.box('recessed back cushion',0,.17,.48,.47,.045,.40,'cloth')
    a.box('throne crest',0,.235,.99,.78,.16,.09,'light')
    for x in (-.30,.30):
        a.box('arm support',x,-.18,.38,.085,.09,.23,'stone')
        a.box('throne armrest',x,0,.58,.13,.58,.08,'light')
    return a


def ram():
    a=H.deck(1.95,.94,.14)
    for x in (-.58,.58):
        a.box('log saddle',x,0,.13,.15,.44,.46,'wood-dark')
        for y in (-.34,.34):a.beam('saddle ground brace',(x,y,.14),(x,0,.47),.055,'wood')
    a.beam('ram timber on saddles',(-.82,0,.63),(.85,0,.63),.17,'wood',n=12)
    for x in (-.70,.65):a.ring('iron ram band',.17,.028,'metal',at=(x,0,.63),axis='Y')
    a.beam('attached ram nose',(.76,0,.63),(.93,0,.63),.185,'metal',n=10)
    return a


def guard_shelter():
    a=roof_frame(2.10,1.2,1.28)
    a.extend(rack(True),(.0,.35,.15))
    a.extend(pouch(),(-.49,-.25,.15))
    a.extend(scaled(brazier(),.72),(.59,-.15,.15))
    return a


def throne_dais():
    a=A().box('dais foundation',0,0,0,1.50,1.27,.14,'dark')
    a.box('dais coping',0,0,.12,1.44,1.21,.065,'light')
    a.extend(throne(),(0,.18,.18))
    for x in (-.56,.56):a.extend(scaled(brazier(),.60),(x,-.35,.18))
    return a


def battlement():
    a=A().box('battlement foundation',0,0,0,2.10,.83,.13,'dark')
    for i in range(4):a.box('bonded parapet course',0,.12,.11+i*.20,2.0,.32,.207,'stone' if i%2 else 'light')
    for x in (-.70,0,.70):a.box('merlon on parapet',x,.12,.90,.36,.36,.24,'stone')
    for x in (-.79,.79):a.beam('grounded parapet buttress',(x,-.22,.11),(x,.12,.71),.12,'dark',n=6)
    return a


build('basalt-citadel',[
 ('supply-pouch','Cloth pouch with attached clasp','small',pouch),('unlit-torches','Bound unlit torch pair','small',torch_bundle),
 ('spare-rings','Loose metal rings on the ground','small',spare_rings),('resting-shield','Shield resting on the ground','small',shield_flat),
 ('folded-banner','Folded and tied spare banner','small',lambda:recolor(scaled(H.folded_sail(),.65),{'sail':'cloth'})),
 ('weapon-rack','Clipped spear rack','working',rack),('shield-rack','Shields attached to bearing rail','working',lambda:rack(True)),
 ('restrained-banner','Banner fixed to crossbar','working',banner),('war-table','Low war table with grounded markers','working',war_table),
 ('reinforced-crate','Compact reinforced supply crate','working',reinforced_crate),
 ('supported-ram','Ram resting on braced saddles','large',ram),('guard-shelter','Braced guard shelter','large',guard_shelter),
 ('throne-dais','Symmetric throne and supported dais','large',throne_dais),('battlement-bay','Bonded parapet and grounded buttresses','large',battlement)],
 ['Reduced banners, equipment racks and supply crates to practical proportions.','Added spare equipment, cloth pouches, unlit torches and table markers.','Rebuilt a symmetric throne; added a supported ram, guard shelter and bonded battlement bay for the perimeter.'],
 [{'original':'banner-tall','study':'restrained-banner'},{'original':'weapon-rack','study':'weapon-rack'},{'original':'throne','study':'throne-dais'}],
 palette={'metal-light':'A2ACA9'})
