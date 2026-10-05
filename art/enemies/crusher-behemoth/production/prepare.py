"""Measure the sheet's visible parts in unscaled pixel coordinates."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / 'review-tools'))
from measure import measure


def part(front, right, back=None, left=None):
    views = {'front': front, 'right': right}
    if back:
        views['back'] = back
    if left:
        views['left'] = left
    return {'mask': 'figure', 'views': views}


config = {
    'blend': 'crusher-behemoth-model.blend', 'meters_per_pixel': 8.5 / 128,
    'ground': dict(front=282, back=282, right=282, left=282),
    'center': dict(front=533, back=721, right=987, left=877),
    'crops': {'front': [439,149,632,286], 'back': [632,149,818,286],
              'left': [830,128,934,287], 'right': [940,128,1042,287],
              'top': [1052,164,1238,287], 'bottom': [1245,159,1436,282],
              'hero': [16,103,421,399]},
    'swatches': {},
    'lights': {'sun': [2.4,[1,.94,.83]], 'fill': [.7,[.8,.89,1]], 'rim': [.5,[1,.89,.67]]},
    'ortho': 14.5, 'sweep': {'turns': [-15,30,15], 'elevations': [10,20,30]},
    'parts': {
        'torso': part([(513,174),(553,174),(570,190),(575,214),(559,241),(534,258),(510,240),(492,215),(497,190)],
                      [(986,171),(1004,187),(1003,213),(998,239),(982,252),(970,225),(967,198)],
                      [(701,173),(741,172),(757,190),(763,214),(749,241),(722,260),(698,238),(681,213),(687,190)],
                      [(875,173),(865,188),(862,212),(866,242),(881,255),(894,221),(899,194)]),
        'helmet': part([(519,167),(533,154),(547,168),(552,181),(542,189),(524,188),(514,181)],
                       [(974,161),(984,163),(991,176),(988,189),(976,187),(972,176)],
                       [(706,167),(721,154),(735,168),(738,180),(730,189),(711,188),(704,179)]),
        'shoulder': part([(455,179),(469,165),(489,156),(511,163),(511,181),(502,202),(477,209),(456,202)],
                         [(962,154),(975,143),(995,138),(1016,149),(1032,165),(1034,178),(1028,194),(1007,195),(985,186),(970,180)],
                         [(643,177),(658,163),(675,156),(694,163),(694,181),(685,204),(665,210),(644,202)],
                         [(844,149),(860,138),(882,137),(899,147),(915,165),(918,180),(910,195),(885,193),(861,185),(838,177)]),
        'wrist': part([(462,205),(479,199),(500,207),(510,220),(493,231),(466,224),(453,214)],
                      [(957,193),(974,184),(996,192),(1006,207),(998,221),(970,223),(950,211)],
                      [(652,205),(670,198),(692,206),(703,221),(686,232),(662,226),(642,215)]),
        'fist': part([(459,220),(477,214),(496,222),(508,240),(508,258),(496,277),(477,281),(457,273),(445,255),(442,236)],
                     [(956,216),(969,208),(986,213),(1008,229),(1018,248),(1013,266),(1000,279),(983,277),(969,266),(955,247),(947,230)],
                     [(649,222),(664,213),(684,219),(698,232),(703,250),(695,271),(681,280),(662,276),(646,265),(637,246)],
                     [(871,210),(889,215),(910,234),(922,251),(922,268),(909,282),(891,280),(875,268),(860,251),(851,230)]),
        'keystone': part([(520,249),(546,249),(547,260),(534,273),(521,261)],
                         [(975,242),(988,246),(990,260),(983,277),(976,263)],
                         [(708,252),(734,251),(735,262),(722,274),(710,262)])}}
for name in ('shoulder', 'wrist', 'fist'):
    # Back-facing screen right is the same anatomical arm as front screen left.
    config['parts'][name]['views']['back'] = [(1442-x,y) for x,y in config['parts'][name]['views']['back']]
(HERE / 'spirit.json').write_text(json.dumps(config, indent=2) + '\n')
measure('crusher-behemoth')
p = HERE / 'sheet.json'
data = json.loads(p.read_text())
# The printed hex swatches are authoritative. Sphere highlights are lighting.
data['palette'] = dict(dark='#4A4A52', stone='#6F7179', gold='#D4B26A', core='#FFB52E', eye='#FFAA00', recess='#242429')
data['hero'] = dict(turn=0, elevation=20)
data['dimension_conflict'] = {
    'sheet_annotation_m': [16,12,8.5],
    'rule': 'Preserve orthographic shape and use 8.5 m rest height. Do not stretch the front to the inconsistent 16 m label.',
    'height_basis': 'ground between feet to helmet apex after requested leg revision',
    'reference_ground_clearance_m': .8}
p.write_text(json.dumps(data, indent=2) + '\n')
