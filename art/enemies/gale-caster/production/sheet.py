"""Re-measure the preserved enemy sheet."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"review-tools"))
from measure import measure
measure("gale-caster")
