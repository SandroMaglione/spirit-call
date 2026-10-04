"""Rebuild base animation, then apply polish. Runs with ordinary Python."""
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BLENDER='/Applications/Blender.app/Contents/MacOS/Blender'
KINDS=['dummy','chaser','shooter','brute','swarmer','charger','sniper','guardian','warden','stalker','volatile','gale-caster','juggernaut']
for kind in sys.argv[1:] or KINDS:
    assert kind in KINDS
    if kind=='dummy':script=ROOT/kind/'build.py';args=['--replace']
    elif kind=='chaser':script=ROOT/kind/'production/animate.py';args=[]
    else:
        family='production-tools/animate-approved.py' if kind in ('shooter','brute','swarmer') else (
            'sheet-tools/animate-approved.py' if kind in ('charger','sniper','guardian') else (
            'model-tools/animate.py' if kind in ('warden','stalker','volatile') else 'review-tools/animate.py'))
        script=ROOT/family;args=[kind,'build-export']
    subprocess.run([BLENDER,'--background','--python-exit-code','1','--python',str(script),'--',*args],check=True)
    subprocess.run([BLENDER,'--background','--python-exit-code','1','--python',str(ROOT/'polish-tools/polish.py'),'--',kind],check=True)
