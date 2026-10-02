"""Initial inventories for the beta arena libraries. Existing kit.json files are authoritative."""
import json
from pathlib import Path

KIT_IDS = ['saltwind-harbor', 'ochre-necropolis', 'prism-quarry', 'mycelium-hollow',
           'tempest-observatory', 'autumn-estate', 'drowned-archive', 'basalt-citadel']
EXTRA_STRUCTURES = ['floor-radial', 'floor-deck', 'floor-rubble', 'wall-window',
                    'wall-buttress', 'arch-free', 'bridge-wide', 'stair-narrow', 'platform-wide']
UTILITIES = ['beacon-idle', 'beacon-active', 'supply-cache', 'supply-cache-open', 'waymarker', 'seal-plinth']
PROPS = {
    'harbor': ['bollard', 'rope-coil', 'capstan', 'dock-crane', 'anchor', 'barrel-stack',
               'fish-crate', 'cargo-pallet', 'boat-hull', 'wreck-hull', 'buoy', 'net-rack',
               'lantern-hook', 'jetty-post', 'wave-rock', 'cliff-large', 'cliff-small',
               'sail-awning', 'signpost', 'life-ring'],
    'desert': ['obelisk', 'obelisk-broken', 'sarcophagus', 'sarcophagus-open', 'canopic-jars',
              'sun-disc', 'offering-table', 'wing-statue', 'sand-drift', 'sand-rock-large',
              'sand-rock-small', 'palm', 'dead-shrub', 'market-awning', 'urn-tall', 'urn-broken',
              'torch-stand', 'rune-console', 'ruined-lintel', 'buried-column'],
    'quarry': ['crystal-large', 'crystal-small', 'crystal-cluster', 'ore-vein', 'mine-cart',
              'cart-empty', 'track-straight', 'track-corner', 'timber-shoring', 'winch',
              'lift-cage', 'drill-rig', 'ore-bin', 'pickaxe-rack', 'mine-lamp', 'cave-rock-large',
              'cave-rock-small', 'stalagmites', 'support-broken', 'powder-kegs'],
    'fungal': ['mushroom-giant', 'mushroom-cluster', 'shelf-fungus', 'spore-pod', 'pod-open',
              'root-tangle', 'root-gateway', 'hollow-stump', 'fallen-trunk', 'reed-cluster',
              'glow-stalk', 'fungal-lantern', 'woven-basket', 'fungal-shrine', 'cap-seat',
              'root-rib', 'cocoon', 'mycelium-rock', 'leaf-shelter', 'stepping-log'],
    'storm': ['orrery', 'telescope', 'armillary', 'lightning-rod', 'conductor-coil',
             'capacitor', 'wind-vane', 'star-chart', 'astrolabe', 'lens-stand', 'crystal-prism',
             'signal-dish', 'cable-spool', 'instrument-crate', 'antenna-array', 'broken-ring',
             'sky-rock', 'banner-forked', 'console', 'ring-pedestal'],
    'estate': ['maple-large', 'maple-small', 'hedge-straight', 'hedge-corner', 'topiary',
              'fountain', 'dry-fountain', 'garden-bench', 'pergola', 'gazebo-roof', 'tea-table',
              'tea-stool', 'leaf-pile', 'planter-round', 'planter-square', 'urn-pair',
              'birdbath', 'lantern-stone', 'garden-screen', 'wheelbarrow'],
    'archive': ['bookcase-tall', 'bookcase-low', 'bookcase-broken', 'reading-desk', 'lectern',
               'scroll-rack', 'scroll-pile', 'book-stack', 'armored-vault', 'tablet-plinth',
               'coral-fan', 'coral-branch', 'shell-cluster', 'barnacle-rock', 'diving-bell',
               'globe', 'chain-post', 'map-table', 'archive-lamp', 'sunken-statue'],
    'citadel': ['buttress-heavy', 'battlement', 'watchtower', 'weapon-rack', 'shield-rack',
               'banner-tall', 'war-table', 'throne', 'throne-broken', 'brazier-large',
               'brazier-small', 'basalt-spires', 'basalt-rubble', 'chain-anchor', 'siege-crate',
               'battering-ram', 'drum', 'gargoyle', 'cage', 'victory-standard'],
}
TITLES = ['Saltwind harbor', 'Ochre necropolis', 'Prism quarry', 'Mycelium hollow',
          'Tempest observatory', 'Autumn estate', 'Drowned archive', 'Basalt citadel']
DESCRIPTIONS = [
    'Salt-worn quays, timber decks, mooring gear and folded sails. A coastal setting with cargo courts, rock-edged piers and dock crossings.',
    'Ochre sandstone, battered tombs and restrained turquoise inlays. Open processional courts connect to burial chambers and raised sun altars.',
    'Faceted slate, pale mineral seams and timber shoring. Excavation yards and galleries mix broad fighting floors with rail-side work areas.',
    'Earthen ruins, ribbed roots and oversized muted fungi. The hollow alternates open clearings, root corridors and raised cap gardens.',
    'Octagonal stonework, brass instruments and storm-blue details. An exposed observatory with radial courts, instrument bays and linked terraces.',
    'Warm plaster, timber panels, clipped hedges and russet leaves. Walled gardens and estate courtyards offer spacious courts with readable side cover.',
    'Pale limestone, copper fittings and sea-worn shelves. Dry fighting floors sit among sunken records, coral growth and abandoned instruments.',
    'Dark basalt, reinforced parapets and rust-red cloth. A fortress setting with broad mustering grounds, battlements and an imposing audience chamber.',
]
PALETTES = [
    '7B9192 AAB9AC C4CBB3 435F65 C29B60 526C70 88715B 8F9F89 657F70 D5B271 CCD4CB A27760',
    'B3966D C7AC82 E0C89C 786652 62A9A0 587A78 826447 BDA478 7A8860 D4B063 D1BD99 A06959',
    '777F92 9AABC0 BCC9C7 424E64 8CB9B6 576277 796955 8C887A 708C81 C7AE6F B4C9CF 816C83',
    '778575 98A991 B7BDA0 465D52 A1B5B3 596E67 766B50 89785D 879867 CBB68A B4C0AB 9C7E90',
    '78819B A2AEC2 CCD0D2 434F6E BFA973 606B82 776859 838C99 66847D DBC58E CDD4DC 8B7998',
    'A59780 C6BBA0 E0D6B8 625E55 CBA77A 65766A 8C6A4E 9F8B65 7F8D62 D3AB69 C8CCB5 AE7354',
    '79978E AAC1AD D0D7BD 436865 84B7B1 597E78 7C7660 879D8C 70988A C6AD77 C5D3C4 A18A7F',
    '626C79 89939B B1B9B6 343F50 B99469 455566 706052 77796F 627569 C7A570 ACB8B7 935F59',
]
DD = 'https://braverobynart.com/deathsdoor'
FO = 'https://folsen.artstation.com/projects/PeVneo'
DESERT = 'https://blog.playstation.com/2022/09/16/genshin-impact-version-3-1-a-journey-through-the-desert/'
CHASM = 'https://blog.playstation.com/2022/03/18/genshin-impact-version-2-6-lets-dig-into-the-chasm/'
INAZUMA = 'https://blog.playstation.com/2021/07/09/genshin-impact-version-2-0-all-about-inazuma/'
FONTAINE = 'https://blog.playstation.com/2023/08/04/genshin-impact-version-4-0-launches-august-16-first-details/'
REFERENCES = [[DD, FONTAINE], [DD, DESERT], [FO, CHASM], [FO, CHASM],
              [DD, INAZUMA], [DD, INAZUMA], [FO, FONTAINE], [DD, FO]]
SCENES = [
    ['cargo-court', 'quay-crossing', 'customs-yard', 'lighthouse-terrace'],
    ['procession-court', 'tomb-approach', 'burial-chamber', 'sun-altar'],
    ['excavation-yard', 'haulage-crossing', 'crystal-gallery', 'winch-terrace'],
    ['spore-clearing', 'root-crossing', 'nursery-hollow', 'elder-garden'],
    ['star-court', 'sky-crossing', 'instrument-hall', 'zenith-terrace'],
    ['leaf-court', 'garden-crossing', 'tea-enclosure', 'pergola-terrace'],
    ['catalogue-court', 'record-crossing', 'vault-chamber', 'reading-terrace'],
    ['muster-court', 'keep-crossing', 'audience-chamber', 'watch-terrace'],
]
SCENE_PROPS = {
    'harbor': [
        ['barrel-stack', 'cargo-pallet', 'fish-crate', 'dock-crane', 'capstan'],
        ['boat-hull', 'wreck-hull', 'bollard', 'rope-coil', 'buoy', 'life-ring'],
        ['net-rack', 'lantern-hook', 'jetty-post', 'sail-awning', 'signpost'],
        ['cliff-large', 'cliff-small', 'wave-rock', 'anchor']],
    'desert': [
        ['obelisk', 'obelisk-broken', 'wing-statue', 'canopic-jars', 'offering-table'],
        ['palm', 'market-awning', 'sand-drift', 'sand-rock-large', 'sand-rock-small', 'buried-column'],
        ['sarcophagus', 'sarcophagus-open', 'urn-tall', 'urn-broken', 'torch-stand'],
        ['sun-disc', 'dead-shrub', 'rune-console', 'ruined-lintel']],
    'quarry': [
        ['mine-cart', 'cart-empty', 'ore-bin', 'drill-rig', 'powder-kegs'],
        ['track-straight', 'track-corner', 'timber-shoring', 'support-broken', 'mine-lamp', 'pickaxe-rack'],
        ['crystal-large', 'crystal-small', 'crystal-cluster', 'ore-vein', 'stalagmites'],
        ['winch', 'lift-cage', 'cave-rock-large', 'cave-rock-small']],
    'fungal': [
        ['mushroom-giant', 'mushroom-cluster', 'shelf-fungus', 'reed-cluster', 'cap-seat'],
        ['root-gateway', 'root-tangle', 'hollow-stump', 'fallen-trunk', 'root-rib', 'stepping-log'],
        ['spore-pod', 'pod-open', 'cocoon', 'woven-basket', 'glow-stalk'],
        ['fungal-shrine', 'mycelium-rock', 'leaf-shelter', 'fungal-lantern']],
    'storm': [
        ['orrery', 'armillary', 'star-chart', 'ring-pedestal', 'banner-forked'],
        ['lightning-rod', 'conductor-coil', 'capacitor', 'cable-spool', 'antenna-array', 'broken-ring'],
        ['telescope', 'astrolabe', 'lens-stand', 'instrument-crate', 'console'],
        ['signal-dish', 'wind-vane', 'crystal-prism', 'sky-rock']],
    'estate': [
        ['maple-large', 'maple-small', 'hedge-straight', 'hedge-corner', 'leaf-pile'],
        ['fountain', 'dry-fountain', 'topiary', 'birdbath', 'garden-bench', 'wheelbarrow'],
        ['tea-table', 'tea-stool', 'garden-screen', 'urn-pair', 'lantern-stone'],
        ['pergola', 'gazebo-roof', 'planter-round', 'planter-square']],
    'archive': [
        ['bookcase-tall', 'bookcase-low', 'reading-desk', 'lectern', 'book-stack'],
        ['coral-fan', 'coral-branch', 'shell-cluster', 'barnacle-rock', 'diving-bell', 'chain-post'],
        ['armored-vault', 'tablet-plinth', 'scroll-rack', 'scroll-pile', 'bookcase-broken'],
        ['globe', 'map-table', 'archive-lamp', 'sunken-statue']],
    'citadel': [
        ['weapon-rack', 'shield-rack', 'war-table', 'drum', 'banner-tall'],
        ['battlement', 'buttress-heavy', 'chain-anchor', 'siege-crate', 'battering-ram', 'cage'],
        ['throne', 'throne-broken', 'brazier-large', 'brazier-small', 'gargoyle'],
        ['watchtower', 'basalt-spires', 'basalt-rubble', 'victory-standard']],
}


def initial_specs():
    # Keep this module importable with ordinary Python; Blender is needed only to build.
    structures = ['floor-plain', 'floor-worn', 'floor-cracked', 'floor-inset', 'floor-small',
                  'floor-large', 'floor-border', 'floor-border-corner', 'floor-threshold',
                  'floor-transition', 'wall-short', 'wall-straight', 'wall-long', 'wall-low',
                  'wall-tall', 'wall-corner', 'wall-end', 'wall-broken', 'pillar-small',
                  'pillar-large', 'pillar-broken', 'stair-short', 'stair-full', 'stair-wide',
                  'stair-rail', 'landing', 'platform', 'platform-edge', 'railing-straight',
                  'railing-corner', 'doorway', 'gate-wide', 'floor-grate', 'wall-grille', 'bridge']
    keys = ['stone', 'light', 'edge', 'dark', 'accent', 'metal', 'wood', 'earth', 'green', 'warm', 'snow', 'cloth']
    for i, (kit_id, style) in enumerate(zip(KIT_IDS, PROPS)):
        assets = [{'id': r, 'recipe': r} for r in structures + EXTRA_STRUCTURES + PROPS[style] + UTILITIES]
        yield kit_id, {'title': TITLES[i], 'style': style, 'batch': 'beta-arenas',
                       'description': DESCRIPTIONS[i], 'palette': dict(zip(keys, PALETTES[i].split())),
                       'assets': assets, 'references': REFERENCES[i],
                       'examples': SCENES[i], 'signature_props': PROPS[style], 'scene_props': SCENE_PROPS[style],
                       'roles': ['quest skirmish', 'dungeon connector', 'boss or elite room', 'survival arena'],
                       'scope': 'Environment art and assembly plans. No gameplay modes or quests are implemented.'}


if __name__ == '__main__':
    for kit_id, spec in initial_specs():
        path = Path(__file__).resolve().parents[1] / kit_id / 'kit.json'
        if path.exists():
            raise SystemExit(f'Refusing to replace authored inventory: {path}')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(spec, indent=2) + '\n')
        print(kit_id, len(spec['assets']))
