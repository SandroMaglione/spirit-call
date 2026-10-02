"""Rebuild the complete authored set; pass --replace to replace existing sources."""
import runpy
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ROOT, export, render

for kind in ('dummy', 'chaser', 'shooter', 'brute', 'swarmer', 'charger', 'sniper', 'guardian'):
    runpy.run_path(str(ROOT/kind/'build.py'), run_name='__main__')
    export(kind)
    if '--renders' in sys.argv:
        render(kind)
