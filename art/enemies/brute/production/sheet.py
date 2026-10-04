"""Re-measure the preserved sheet with its labeled regions."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"production-tools"))
from measure import measure
measure("brute")
