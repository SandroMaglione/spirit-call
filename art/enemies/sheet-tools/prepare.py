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
  'center':{'front':79,'back':338,'right':242,'left':466},
  'crops':{'front':[35,431,126,658],'right':[143,431,293,658],'back':[302,431,385,658],'left':[411,431,553,658],'top':[563,431,642,658],'bottom':[650,431,735,658],'hero':[426,22,944,360]},
  'swatches':{'violet':[1046,90],'purple':[1131,90],'charcoal':[1212,90],'metal':[1294,90],'eye':[1377,90]},
  'parts':{
   'body':part('all',front=[(68,508),(90,508),(96,527),(92,541),(70,541),(64,528)],back=r(322,494,355,543),right=[(222,491),(238,492),(247,509),(253,527),(251,537),(233,540),(225,519)]),
   'head':part('all',front=[(79,482),(97,507),(90,550),(85,576),(77,579),(69,557),(62,509)],right=[(222,476),(202,478),(186,485),(178,504),(138,539),(140,543),(202,511),(219,501),(237,489)]),
   'crest':part('all',front=[(61,441),(66,466),(74,480),(70,497),(61,490),(56,471),(59,450)],right=r(185,440,248,486)),
   'centercrest':part('all',front=[(79,481),(89,490),(84,503),(72,490)],right=[(255,475),(231,480),(228,495),(244,490)]),
   'thigh':part('all',front=[(57,535),(69,536),(63,557),(47,580),(38,579),(42,557)],right=[(243,536),(271,535),(258,556),(211,578),(197,583),(210,556),(229,541)]),
   'shoulder':part('all',front=[(52,486),(64,498),(64,520),(54,530),(47,509)],right=[(217,483),(230,487),(232,514),(225,526),(213,510),(203,495)]),
   'foot':part('dark',front=r(39,629,62,651),right=r(218,628,251,651)),
  },
  'landmarks':{'front':{'hipL':[62,544],'kneeL':[44,581],'hockL':[43,594],'ankleL':[42,637],'hipR':[96,544],'kneeR':[114,581],'hockR':[115,594],'ankleR':[116,637]},'right':{'hip':[243,538],'knee':[201,581],'hock':[240,592],'ankle':[215,638],'barrel_root':[197,490],'barrel_tip':[140,541],'eye':[197,489]}},
 },
 'guardian': {
  'meters_per_pixel':1.3/197,
  'ground':{'front':457,'back':457,'right':457,'left':457},
  'center':{'front':130,'back':645,'right':390,'left':895},
  'crops':{'front':[27,258,253,466],'right':[278,258,505,466],'back':[531,258,758,466],'left':[783,258,1009,466],'top':[1038,265,1258,466],'bottom':[1289,260,1512,464],'hero':[1220,14,1470,217]},
  'swatches':{'dark':[391,76],'steel':[458,76],'trim':[526,76],'gold':[598,76],'wood':[666,76],'light':[735,76]},
  'eye_regions':[r(120,318,128,330),r(134,317,145,329)],
  'parts':{
   'body':part('all',front=r(98,335,151,405),back=r(610,334,682,407),right=r(363,335,410,406),left=r(871,335,920,406)),
   'helmet':part('all',front=[(109,302),(124,294),(147,301),(159,320),(151,348),(131,370),(111,352),(102,326)],back=r(620,296,668,344),right=r(356,296,403,352),left=r(884,296,936,352)),
   'crest':part('gold',front=[(128,310),(132,283),(150,263),(161,296),(145,313)],back=r(632,261,658,299),right=r(370,263,399,308)),
   'shoulder':part('all',front=[(90,321),(111,321),(108,353),(86,374),(78,361)],right=r(358,324,397,359)),
   'arm':part('all',front=r(81,359,107,392),right=r(357,355,388,395)),
   'hand':part('dark',front=r(69,382,97,406),right=r(348,385,371,408)),
   'thigh':part('all',back=r(654,398,686,436),right=r(373,400,406,434)),
   'foot':part('all',back=r(655,430,692,457),right=r(365,429,407,457)),
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
  'sweep':{'turns':[-80,-30,10] if kind=='sniper' else [20,60,10],'elevations':[15,25,35]}}
 if kind=='guardian':cfg['view_sweeps']={'right':[25,45,65],'left':[-65,-45,-25]}
 if kind=='sniper':
  for entry in cfg['parts'].values():
   if entry['mask']=='all':entry['mask']='robot'
 if kind=='guardian':
  for entry in cfg['parts'].values():
   if entry['mask']=='all':entry['mask']='armor'
 (here/'spirit.json').write_text(json.dumps(cfg,indent=2)+'\n')
 (here/'sheet.py').write_text('"""Re-measure the preserved sheet."""\nimport sys\nfrom pathlib import Path\nsys.path.insert(0,str(Path(__file__).resolve().parents[2]/"sheet-tools"))\nfrom measure import measure\nmeasure("'+kind+'")\n')
 measure(kind)

if __name__=='__main__':main(*sys.argv[1:])
