"""Export the saved animated Chaser and generate its runtime model spec."""
import json
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
FOLDER=HERE/"animated"
sys.path.insert(0,str(HERE.parents[1]/"scripts"))
import common

# Reuse action export, loop trimming and metadata generation from the saved
# animated source, keeping the legacy Chaser files available as references.
common.export("chaser",FOLDER)
info=json.loads((FOLDER/"model-info.json").read_text())
assert info["triangles"]==1890 and info["bones"]==12
