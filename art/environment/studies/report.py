"""Write one arena handoff and refresh the study index from verified deliveries."""
import html
import json
import sys
from pathlib import Path

ENV=Path(__file__).resolve().parents[1]
name=sys.argv[1]
root=ENV/(name+'-study')
kit=json.loads((root/'kit.json').read_text())
manifest=json.loads((root/'manifest.json').read_text())
audit=json.loads((root/'support-audit.json').read_text())
verification=json.loads((root/'verification.json').read_text())
assert len(verification['assets'])==len(kit['assets'])==len(manifest['assets'])
assert all(not a['unsupported'] for a in audit['assets'].values())
assets={a['id']:a for a in manifest['assets']}
lines=['# '+kit['title'],'','\n'.join('- '+n for n in kit['changes']),'',
 'These models are now placed in the playable arena, using the current 0.5804 m player spirit.',
 'Small ground details are decorative; solid props use simulation collisions.',
 'Large assemblies stand outside the arena walls on extended paving.',
 'See [in-game layouts and previews](../studies/IN_GAME.md).',
 '', '## Review', '',
 'Run `pnpm dev --host --port 5200` and open',
 f'`/art/environment/{name}-study/review.html`. Switch between all props,',
 'small details, working props, large assemblies, before/after and exterior views.',
 'Drag or touch to rotate. Each before/after pair uses the same camera scale.',
 '', '![All models beside the current spirit](previews/all.png)',
 '![Exterior arrangement](previews/outside.png)',
 '![Before and after](previews/compare.png)', '',
 '## Models', '', '| Model | Group | Height | Player height ratio | Triangles |',
 '| --- | --- | ---: | ---: | ---: |']
for entry in kit['assets']:
    a=assets[entry['id']];h=a['dimensions_m'][1]
    lines.append(f"| {entry['title']} | {entry['group']} | {h:.2f} m | {h/kit['player_height_m']:.1f} | {a['triangles']} |")
lines+=['','## Source and verification','',
 f'`source/{name}-study.blend` contains the editable library. `models/` contains',
 'the GLBs, one mesh and one opaque vertex-color material each.',
 '`support-audit.json` records geometric contact through a chain to ground,',
 'with a 2 mm tolerance and zero unsupported pieces. This checks contact,',
 'not structural load capacity. Components touch or intersect within the',
 'joined mesh; they are closed shells rather than one boolean-welded solid.',
 '', '`verification.json` records the successful manifold-shell, positive-volume,',
 'origin, material, hash and GLB round-trip checks for every model.',
 'Desktop, phone-sized and exterior-bound reviews use the actual exported files.',
 '', 'Rebuild from the repository root. Building requires `--replace-generated`',
 'to replace a generated source. To retain manual Blender edits, export directly.',
 '', '```sh',
 f'/Applications/Blender.app/Contents/MacOS/Blender --background --threads 4 --python-exit-code 1 --python art/environment/{name}-study/scripts/build.py -- --replace-generated',
 f'/Applications/Blender.app/Contents/MacOS/Blender --background --threads 4 --python-exit-code 1 --python art/environment/scripts/export.py -- --kit {name}-study',
 f'/Applications/Blender.app/Contents/MacOS/Blender --background --threads 4 --python-exit-code 1 --python art/environment/scripts/verify.py -- --kit {name}-study',
 '```','','Repository checks use `env VITEST_MAX_WORKERS=2 pnpm check` to avoid',
 'the existing replay-test timeout under default parallelism.','']
(root/'README.md').write_text('\n'.join(lines))
names=['saltwind-harbor','courtyard','flooded-cistern','ember-kilnworks','overgrown-sanctuary','ochre-necropolis','basalt-citadel','frostbound-monastery']
cards=[]
for n in names:
    p=ENV/(n+'-study')
    if not (p/'kit.json').exists():continue
    k=json.loads((p/'kit.json').read_text());title=html.escape(k['title'])
    pic='working.png' if n=='saltwind-harbor' else 'all.png'
    notes=html.escape(' '.join(k.get('changes',[k.get('description','')])) )
    arena=next(arena for arena, layout in json.loads((ENV/'studies/layouts.json').read_text()).items() if layout['kit']==n)
    cards.append(f'<article><a href="../{n}-study/review.html"><img src="../{n}-study/previews/{pic}" alt="{title} models"><h2>{title}</h2></a><p>{len(k["assets"])} models. {notes}</p><a href="../{n}-study/review.html?view=outside">Exterior study</a> · <a href="/?play&amp;arena={arena}&amp;challenge=trainingGround&amp;character=tidecaller">Play quiet tour</a> · <a href="in-game/{arena}.png">In-game preview</a></article>')
(ENV/'studies/index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arena prop studies</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#15232d;color:#e3e9df;font:15px system-ui}h1{margin:0 0 8px}p{color:#b2c4c5;line-height:1.55}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:20px}article{background:#233640;border:1px solid #435761;border-radius:8px;padding:16px}a{color:#c4b28d}img{width:100%;height:280px;object-fit:contain;background:#182831}h2{font-size:20px}</style><h1>Arena prop studies</h1><p>Connected construction, everyday prop scale and supported perimeter assemblies. Every sheet uses the current player spirit as a reference.</p><main>'+''.join(cards)+'</main></html>')
print('REPORT',name,len(kit['assets']))
