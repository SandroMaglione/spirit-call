"""Label the supplied enemy sheets; measurements remain in source pixels.

Regions separate touching armor, cloth, and props. Geometry uses their actual
colored row contours, not a hand-authored replacement silhouette.
"""
import json
import shutil
import sys
from pathlib import Path
from measure import measure, rect as r

ROOT = Path(__file__).resolve().parents[1]
def part(mask, **views): return {'mask':mask, 'views':views}
CONFIGS = {
 'charger': {
  'meters_per_pixel':1.1/196,
  'ground':{'front':458,'back':458,'right':458,'left':458},
  'center':{'front':143,'back':644,'right':397,'left':890},
  'crops':{'front':[30,260,255,465],'right':[280,260,505,465],'back':[532,260,755,465],'left':[784,260,1007,465],'top':[1034,270,1259,465],'bottom':[1288,270,1511,465],'hero':[1240,12,1475,213]},
  'swatches':{'charcoal':[401,76],'brown':[474,76],'hood':[546,76],'fire':[616,76],'cloth':[684,76]},
  'eye_regions':[r(120,371,135,392),r(147,371,160,392)],
  'parts':{
   'body':part('all',front=r(96,404,186,439),back=r(595,393,696,438),right=r(338,380,429,438),left=r(852,380,944,438)),
   'hood':part('red',front=[(94,359),(112,334),(146,327),(166,340),(180,370),(178,408),(161,425),(127,429),(100,408)],right=[(302,356),(330,335),(351,349),(365,382),(354,415),(335,426),(309,412)]),
   'pack':part('all',back=r(583,315,706,417),right=r(360,315,476,415),left=r(811,315,925,415)),
   'collar':part('all',front=r(110,300,178,329),back=r(614,299,681,328),right=r(375,295,438,326)),
   'flame':part('fire',front=r(132,262,163,309),right=r(391,260,431,303)),
   'arm':part('bone',front=r(187,365,223,402),right=r(336,365,388,407)),
   'cuff':part('red',front=r(194,390,237,410),right=r(328,393,373,417)),
   'hand':part('dark',front=r(201,407,242,437),right=r(324,409,370,442)),
   'foot':part('dark',front=r(88,434,122,458),right=r(350,433,384,458)),
   'bomb':part('dark',front=r(44,356,103,414),right=r(294,354,325,410)),
   'bombflame':part('fire',front=r(64,329,90,359),right=r(303,327,327,357)),
  },
  'landmarks':{'front':{'pack_crack':[[111,331],[119,343],[112,357],[119,370]],'hood_outer':[[143,331],[163,347],[179,383],[166,412],[141,426],[113,412],[98,386],[114,349]],'hood_inner':[[142,356],[156,365],[166,387],[157,407],[140,414],[121,405],[114,388],[125,367]],'bomb_neck':[76,356]},'back':{'crack':[[604,325],[612,341],[605,358],[616,373],[611,391]]}},
 },
 'sniper': {
  'meters_per_pixel':1.25/212,
  'ground':{'front':650,'back':650,'right':650,'left':650},
  'center':{'front':83,'back':338,'right':242,'left':466},
  'crops':{'front':[35,431,126,658],'right':[143,431,293,658],'back':[302,431,385,658],'left':[411,431,553,658],'top':[563,431,642,658],'bottom':[650,431,735,658],'hero':[426,22,944,360]},
  'swatches':{'violet':[1046,90],'purple':[1131,90],'charcoal':[1212,90],'metal':[1294,90],'eye':[1377,90]},
  'parts':{
   'body':part('all',front=r(60,487,108,568),back=r(314,485,363,565),right=r(216,473,271,530),left=r(440,473,494,535)),
   'head':part('all',front=r(69,479,98,526),right=[(196,477),(216,466),(242,477),(254,492),(236,509),(211,499)]),
   'crest':part('purple',front=[(57,441),(73,480),(69,504),(61,475)],right=[(224,443),(259,470),(252,483),(239,470)]),
   'centercrest':part('purple',front=[(89,447),(100,440),(96,481),(86,494)],right=[(236,443),(262,478),(249,477)]),
   'thigh':part('all',front=[(54,529),(72,524),(76,554),(63,584),(49,583)],right=[(242,526),(273,510),(271,540),(243,574),(225,575)]),
   'foot':part('dark',front=r(39,629,62,651),right=r(218,628,251,651)),
  },
  'landmarks':{'front':{'hipL':[67,557],'kneeL':[52,594],'ankleL':[48,638],'hipR':[99,557],'kneeR':[108,594],'ankleR':[112,638]},'right':{'hip':[252,549],'knee':[227,577],'ankle':[242,638],'barrel_root':[203,491],'barrel_tip':[145,543],'eye':[219,481]}},
 },
 'guardian': {
  'meters_per_pixel':1.3/197,
  'ground':{'front':457,'back':457,'right':457,'left':457},
  'center':{'front':127,'back':645,'right':390,'left':895},
  'crops':{'front':[27,258,253,466],'right':[278,258,505,466],'back':[531,258,758,466],'left':[783,258,1009,466],'top':[1038,265,1258,466],'bottom':[1289,260,1512,464],'hero':[1220,14,1470,217]},
  'swatches':{'dark':[391,76],'steel':[458,76],'trim':[526,76],'gold':[598,76],'wood':[666,76],'light':[735,76]},
  'eye_regions':[r(111,312,125,341),r(132,312,146,341)],
  'parts':{
   'body':part('all',front=r(98,335,151,405),back=r(610,334,682,407),right=r(363,335,410,406),left=r(871,335,920,406)),
   'helmet':part('all',front=[(109,302),(124,294),(147,301),(159,320),(151,348),(131,370),(111,352),(102,326)],back=r(620,296,668,344),right=r(356,296,403,352),left=r(884,296,936,352)),
   'crest':part('gold',front=[(128,310),(132,283),(150,263),(161,296),(145,313)],back=r(632,261,658,299),right=r(370,263,399,308)),
   'shoulder':part('all',front=[(90,321),(111,321),(108,353),(86,374),(78,361)],right=r(358,324,397,359)),
   'arm':part('all',front=r(81,359,107,392),right=r(357,355,388,395)),
   'hand':part('dark',front=r(69,382,97,406),right=r(348,385,371,408)),
   'thigh':part('all',front=r(94,399,119,437),back=r(608,399,637,438),right=r(365,400,392,434)),
   'foot':part('dark',front=r(76,431,115,455),right=r(363,429,400,458)),
   'mace':part('all',front=r(32,335,82,381),right=r(300,335,347,381)),
  },
  'landmarks':{'front':{'shield':[[143,331],[218,321],[236,451],[153,459]],'shield_inner':[[153,340],[210,331],[225,442],[160,449]],'shield_diamond':[[183,367],[193,386],[186,407],[176,389]],'handle_start':[80,397],'handle_end':[59,365]},'right':{'shield_front':[350,390],'shield_back':[367,390]}},
 },
}

def main(kind, source):
 here=ROOT/kind/'production'
 (here/'reference').mkdir(parents=True,exist_ok=True)
 (here/'renders').mkdir(exist_ok=True)
 shutil.copyfile(source,here/'reference/sheet.png')
 cfg=CONFIGS[kind] | {'blend':f'{kind}-model.blend','background':'#DFDFE8','ortho':1.9 if kind=='sniper' else 1.7,
  'lights':{'sun':[1.6,[1,.95,.9]],'fill':[.45,[.8,.88,1]],'rim':[.35,[1,1,1]]},
  'sweep':{'turns':[20,60,10],'elevations':[15,25,35]}}
 (here/'spirit.json').write_text(json.dumps(cfg,indent=2)+'\n')
 (here/'sheet.py').write_text('"""Re-measure the preserved sheet."""\nimport sys\nfrom pathlib import Path\nsys.path.insert(0,str(Path(__file__).resolve().parents[2]/"sheet-tools"))\nfrom measure import measure\nmeasure("'+kind+'")\n')
 measure(kind)

if __name__=='__main__':main(*sys.argv[1:])
