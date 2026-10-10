"""Score the reference-camera sweep without changing model geometry."""
import json
import re
from pathlib import Path

from review import normalize

HERE = Path(__file__).resolve().parent
best = {}
results = {}
for view in ("front","back","left","right"):
    _,a = normalize(HERE/f"reference/{view}.png",False,(700,400))
    candidates = []
    for file in (HERE/"renders").glob(f"candidate-{view}-*.png"):
        _,b = normalize(file,True,(700,400))
        score = float((a&b).sum()/(a|b).sum())
        turn,elevation = map(int,re.match(r"candidate-\w+-(-?\d+)-(\d+)",file.stem).groups())
        candidates.append({"turn":turn,"elevation":elevation,"score":score})
    candidates.sort(key=lambda item:item["score"],reverse=True)
    results[view] = candidates
    best[view] = candidates[0]
(HERE/"camera-fit.json").write_text(json.dumps({"best":best,"candidates":results},indent=2)+"\n")
print(json.dumps(best,indent=2))
