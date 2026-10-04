"""Crop and label one enemy sheet. Usage: prepare.py <kind> [sheet.png]."""
import json
import shutil
import sys
from pathlib import Path
from measure import measure, rect as r

ROOT=Path(__file__).resolve().parents[1]

def part(mask, **views):return {'mask':mask,'views':views}

CONFIGS={
 'shooter':{
  'meters_per_pixel':1/192,
  'ground':{'front':462,'back':462,'right':465,'left':462},
  'center':{'front':140,'back':643,'right':390,'left':898},
  'crops':{'front':[26,264,250,471],'right':[280,264,504,473],'back':[532,264,757,472],
           'left':[782,264,1008,472],'top':[1034,264,1260,471],'bottom':[1286,264,1510,471],'hero':[1260,18,1477,214]},
  'swatches':{'body':[385,77],'fin':[530,77],'coral':[604,77],'spike':[459,77],'ivory':[677,77]},
  'eye_regions':[r(101,340,116,378),r(162,340,180,378)],
  'parts':{
   'body':part('blue',front=r(64,321,213,445),back=r(573,321,714,442),right=r(325,321,470,443),left=r(824,321,955,441)),
   'crest':part('blue',front=r(120,268,158,324),back=r(625,268,661,326),right=r(376,271,436,325),left=r(849,272,908,325)),
   'fin':part('bone',front=r(39,317,77,409),right=r(359,329,427,420)),
   'foot':part('blue',front=r(73,436,109,463),right=r(350,434,408,466)),
   'tail':part('blue',back=r(622,395,664,443),right=[(463,352),(499,357),(488,377),(469,403),(460,382)]),
   'mouth':part('coral',front=r(85,360,196,458),right=r(293,340,327,435)),
  }},
 'brute':{
  'meters_per_pixel':1.4/184,
  'ground':{'front':466,'back':466,'right':468,'left':468},
  'center':{'front':145,'back':638,'right':400,'left':892},
  'crops':{'front':[29,280,269,472],'right':[287,276,503,476],'back':[528,277,753,474],
           'left':[788,274,1007,475],'top':[1032,287,1247,455],'bottom':[1280,281,1508,459],'hero':[1190,10,1486,234]},
  'swatches':{'stone':[389,78],'dark':[459,78],'light':[533,78],'warm':[604,78],'eye':[675,78]},
  'eye_regions':[r(130,346,145,376),r(155,346,172,376)],
  'parts':{
   'torso':part('stone',front=[(111,336),(180,336),(199,356),(191,391),(166,418),(145,429),(118,414),(85,380),(86,355)],
               back=[(593,326),(665,324),(687,350),(678,387),(655,422),(619,422),(591,383)],
               right=[(383,328),(426,326),(458,343),(458,376),(435,407),(408,421),(383,397),(369,371)],
               left=[(866,325),(909,327),(928,353),(919,397),(894,420),(868,405),(843,375),(841,345)]),
   'head':part('stone',front=[(118,337),(128,323),(158,321),(176,335),(172,360),(160,378),(140,383),(125,366)],
               right=[(360,322),(386,321),(405,335),(399,356),(375,373),(357,355)],
               left=[(908,321),(931,321),(944,337),(943,356),(926,373),(905,355)]),
   'back':part('stone',front=r(116,282,174,341),back=r(606,279,673,346),right=r(405,325,458,372),left=r(833,319,885,370)),
   'shoulder':part('stone',front=[(58,345),(88,315),(109,329),(113,354),(97,376),(66,374)],
                  right=[(343,325),(378,314),(408,330),(408,367),(387,389),(348,378)]),
   'upperarm':part('stone',front=r(51,365,96,410),right=r(341,369,384,414)),
   'forearm':part('stone',front=[(45,391),(65,382),(90,397),(95,421),(75,436),(40,424)],right=r(337,389,382,435)),
   'fist':part('stone',front=[(38,412),(54,399),(77,401),(91,419),(90,440),(77,454),(47,450),(34,433)],
              right=[(331,281),(350,277),(378,288),(402,299),(402,318),(389,343),(359,350),(339,332)]),
   'thigh':part('stone',front=r(99,415,130,445),right=r(380,406,419,444)),
   'foot':part('stone',front=[(99,440),(113,427),(130,438),(135,465),(91,467),(89,455)],right=r(385,429,434,469)),
  }},
 'swarmer':{
  'meters_per_pixel':.65/157,
  'ground':{'front':439,'back':438,'right':439,'left':439},
  'center':{'front':138,'back':645,'right':389,'left':898},
  'crops':{'front':[35,279,246,446],'right':[287,278,506,448],'back':[538,278,752,447],
           'left':[787,278,1005,447],'top':[1040,268,1255,447],'bottom':[1295,268,1508,448],'hero':[1254,19,1506,211]},
  'swatches':{'shell':[400,77],'joint':[472,77],'bone':[545,77],'light':[616,77],'dark':[689,77]},
  'parts':{
   'body':part('red',front=r(65,289,210,420),back=r(576,289,720,418),right=r(315,293,454,422),left=r(831,293,972,423)),
   'mouth':part('bone',front=r(92,341,175,434),right=r(307,342,349,432)),
   'spike':part('bone',front=r(129,279,146,298),right=r(402,283,422,303)),
   'side_spike':part('bone',front=r(93,297,108,320),right=r(427,303,445,325)),
   'frontleg':part('dark',front=[(81,397),(93,399),(104,419),(96,438),(83,436),(77,421)],right=r(347,392,378,434)),
   'backleg':part('dark',back=r(589,395,625,435),right=[(439,382),(465,389),(484,417),(481,423),(452,410),(434,402)]),
   'belly':part('dark',front=r(103,402,169,434),right=r(352,410,445,435)),
  }},
}

def main(kind, source=None):
    here=ROOT/kind/'production'
    (here/'reference').mkdir(parents=True,exist_ok=True)
    (here/'renders').mkdir(exist_ok=True)
    (here/'.gitignore').write_text('*.blend1\n__pycache__/\n')
    if source:shutil.copyfile(source,here/'reference/sheet.png')
    config=CONFIGS[kind] | {'blend':f'{kind}-model.blend','background':'#DFDFE8','ortho':2.1 if kind=='brute' else 1.35,
        'resolution':[640,640],'ambient':.45,
        'lights':{'sun':[1.6,[1, .95,.9]],'fill':[.45,[.8,.88,1]],'rim':[.35,[1,1,1]]},
        'sweep':{'turns':[20,50,10],'elevations':[15,25,35]}}
    (here/'spirit.json').write_text(json.dumps(config,indent=2)+'\n')
    (here/'sheet.py').write_text('"""Re-measure the preserved sheet with its labeled regions."""\nimport sys\nfrom pathlib import Path\nsys.path.insert(0,str(Path(__file__).resolve().parents[2]/"production-tools"))\nfrom measure import measure\nmeasure("'+kind+'")\n')
    measure(kind)

if __name__=='__main__':main(*sys.argv[1:])
