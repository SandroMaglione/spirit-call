"""Compact foundry tools and supported exterior production assemblies."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from study import A,M,H,build,bowl,rock,table,roof_frame,scaled


def ingots():
    a=A()
    for i,(x,y,z) in enumerate([(-.09,0,0),(.09,0,0),(0,0,.055)]):
        a.box('stacked iron ingot',x,y,z,.17,.32,.06,'metal-light')
    return a


def tongs():
    a=A().box('tool tray',0,0,0,.52,.25,.028,'wood-dark')
    for s in (-1,1):
        H.path(a,'connected tong arm',[(s*.055,-.18,.04),(s*.02,.03,.04),(s*.07,.17,.04)],.013,'metal')
    a.beam('hammer shaft',(.14,-.17,.045),(.14,.09,.045),.017,'wood')
    a.box('hammer head',.14,.10,.028,.15,.075,.065,'metal')
    return a


def coal():
    a=A()
    for i,(x,y) in enumerate([(-.13,0),(.13,0),(0,.12),(0,-.11)]):
        a.extend(rock(.24,.18,.13,'dark',i),(x,y,0))
    a.extend(rock(.22,.19,.13,'dark',5),(0,0,.09))
    return a


def mould():
    a=A().box('casting mould floor',0,0,0,.39,.24,.04,'dark')
    for x in (-.18,.18):a.box('mould end',x,0,.02,.04,.24,.08,'metal')
    for y in (-.10,.10):a.box('mould side',0,y,.02,.39,.04,.08,'metal')
    return a


def anvil():
    a=A().box('anvil ground foot',-.05,0,0,.36,.28,.07,'wood-dark')
    a.lathe('anvil waist',[(.15,.05),(.09,.17),(.13,.29)],'metal',n=8,at=(-.05,0,0))
    a.box('anvil face',-.07,0,.265,.45,.21,.075,'metal-light')
    a.beam('attached tapered horn',(.09,0,.30),(.42,0,.30),.075,'metal',n=8,end=.015)
    return a


def tool_rack():
    a=A()
    for x in (-.44,.44):
        a.box('rack ground foot',x,0,0,.20,.37,.06,'wood-dark')
        a.box('rack post',x,0,.035,.075,.075,.78,'wood')
    a.beam('tool bearing rail',(-.49,0,.67),(.49,0,.67),.041,'wood-dark')
    for x in (-.28,0,.28):
        a.beam('hammer handle',(x,-.028,.25),(x,-.028,.71),.019,'wood')
        a.box('hammer head on rail',x,-.028,.65,.18,.105,.09,'metal')
    return a


def coal_bin():
    a=A().box('coal bin floor',0,0,0,.76,.48,.045,'wood-dark')
    for y in (-.22,.22):a.box('bin wall',0,y,.025,.76,.05,.28,'wood')
    for x in (-.355,.355):a.box('bin end',x,0,.025,.05,.48,.28,'wood')
    a.extend(rock(.64,.34,.14,'dark'),(0,0,.04))
    for x in (-.16,0,.16):a.extend(scaled(coal(),.58),(x,0,.13))
    return a


def boiler():
    a=A().box('boiler plinth',0,0,0,.56,.48,.09,'stone')
    a.lathe('boiler vessel',[(.21,.07),(.24,.17),(.24,.64),(.19,.75),(.06,.79)],'metal',n=12)
    for z in (.17,.60):a.ring('boiler band',.24,.024,'metal-light',at=(0,0,z))
    a.beam('attached relief pipe',(0,0,.75),(.24,0,.75),.035,'metal')
    a.box('front firebox',0,-.23,.13,.24,.11,.25,'dark')
    a.box('firebox door',0,-.29,.15,.20,.045,.20,'metal-light')
    a.beam('door latch',(-.06,-.32,.25),(.06,-.32,.25),.018,'metal')
    return a


def furnace():
    a=A().box('furnace slab',0,0,0,1.16,.90,.12,'dark')
    for x in (-.42,.42):
        for i in range(5):
            a.box('bonded furnace pier course',x,0,.10+i*.21,.28,.72,.216,'stone' if i%2 else 'light')
    a.box('firebox back',0,.28,.11,.64,.18,.98,'dark')
    a.box('firebox hearth',0,0,.10,.88,.72,.10,'stone')
    a.box('supported furnace crown',0,0,1.02,1.02,.77,.20,'light')
    a.box('firebox lintel',0,-.34,.67,.92,.15,.25,'stone')
    for x in (-.30,.30):a.box('door jamb fixed to pier',x,-.36,.15,.075,.14,.55,'metal')
    a.box('furnace door',0,-.40,.18,.61,.075,.48,'metal')
    for x in (-.22,.22):a.box('door hinge',x,-.45,.23,.045,.05,.24,'metal-light')
    for z in (.26,.52):a.box('door strap',0,-.45,z,.51,.035,.045,'metal-light')
    for i in range(3):a.box('chimney course',0,.14,1.19+i*.18,.43,.43,.185,'stone')
    a.box('chimney cap',0,.14,1.70,.52,.52,.075,'dark')
    return a


def forging_bay():
    a=roof_frame(2.05,1.20,1.34,True)
    a.extend(anvil(),(-.43,-.05,.15));a.extend(tool_rack(),(.46,.35,.15))
    a.extend(ingots(),(.46,-.28,.15))
    return a


def chimney():
    a=A().box('chimney slab',0,0,0,1.25,.92,.12,'dark')
    for i in range(9):
        w=.70-i*.025
        a.box('bonded chimney course',0,.10,.10+i*.19,w,.56,.195,'stone' if i%2 else 'light')
    for x in (-.44,.44):
        a.beam('grounded buttress',(x,0,.10),(x*.52,.10,.85),.13,'dark',n=6)
    a.box('chimney coping',0,.10,1.79,.60,.64,.10,'dark')
    return a


def casting_station():
    a=H.deck(1.90,1.10,.14)
    a.extend(table(1.35,.64,.44),(-.10,.13,.13))
    a.extend(mould(),(-.47,.13,.60));a.extend(ingots(),(.28,.13,.60))
    a.extend(bowl(.19,.17,'metal'),(.63,-.22,.13))
    a.extend(tongs(),(-.57,-.30,.13))
    return a


build('ember-kilnworks',[
 ('iron-ingots','Stacked iron ingots','small',ingots),('tongs-tray','Tongs and hammer in a tray','small',tongs),
 ('coal-pile','Grounded coal pile','small',coal),('small-crucible','Open crucible','small',lambda:bowl(.18,.16,'metal')),
 ('casting-mould','Open casting mould','small',mould),
 ('compact-anvil','Anvil with attached tapered horn','working',anvil),('hammer-rack','Tools resting on a bearing rail','working',tool_rack),
 ('coal-bin','Planked coal bin','working',coal_bin),('compact-boiler','Boiler with plinth and connected pipe','working',boiler),
 ('casting-bench','Low casting bench','working',lambda:table(1.1,.56,.43)),
 ('brick-furnace','Compact bonded-brick furnace','large',furnace),('forging-bay','Supported smithing canopy','large',forging_bay),
 ('buttressed-chimney','Bonded chimney with buttresses','large',chimney),('casting-station','Grounded casting station','large',casting_station)],
 ['Reduced the furnace, boiler, anvil and tool proportions beside the spirit.','Added ingots, tongs, coal, open crucibles and casting moulds.','Rebuilt furnace piers and chimney supports; added smithing and casting bays outside the grid.'],
 [{'original':'furnace','study':'brick-furnace'},{'original':'anvil','study':'compact-anvil'},{'original':'boiler','study':'compact-boiler'}],
 palette={'metal-light':'A0A7A7'})
