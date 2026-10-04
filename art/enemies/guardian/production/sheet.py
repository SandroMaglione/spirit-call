"""Re-measure the preserved sheet."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"sheet-tools"))
from measure import measure
measure("guardian")
