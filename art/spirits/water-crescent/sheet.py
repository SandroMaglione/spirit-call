"""Keep the original sheet, sampled swatches, and traced front landmarks."""
import json
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
im = Image.open(HERE / "reference/sheet.png").convert("RGB")
views = {"front": [26,116,237,310], "left": [291,116,469,310],
         "back": [535,116,735,310], "right": [791,116,992,310],
         "top": [26,375,205,579], "bottom": [281,374,449,580],
         "hero": [510,373,751,582], "face": [845,373,978,487],
         "crescent": [846,510,983,652]}
for name, box in views.items():
    im.crop(box).save(HERE / f"reference/{name}.png")
swatches = {}
for name, x in zip(("pale", "aqua", "sky", "royal", "lavender"), (59,119,183,244,305)):
    rgb = im.getpixel((x,676))
    swatches[name] = "#" + "".join(f"{c:02x}" for c in rgb)
data = {
    "reference": "reference/sheet.png", "swatches": swatches,
    "height_m": .60, "meters_per_pixel": .60 / (300-122),
    "center_px": 150, "ground_px": 300,
    "policy": {
        "shape": "Front and isometric views establish the silhouette, palette, exposed core, tall eyes, and swept crescents.",
        "cameras": "The labelled front and sides are oblique stylized views, not mutually consistent orthographic projections.",
        "depth": "Closed lenticular crescent volumes flank a spherical core. User review clarified that the pale head sweep was overread as a solid third shell; it is now a soft color transition across core facets. Rear shell thickness is interpreted from back/top views.",
        "scale": "No dimension is supplied. Provisional 0.60 m overall mesh height, matching the existing compact Water Spirit scale. Single uniform pixel scale.",
        "scope": "Independent static study. No replacement of the shipped Water Spirit, clips, gameplay registration, or kit decisions."
    },
    "core": {"center": [162,224], "radii_px": [46,44]},
    "main_shell_rows": [
        [167,167,122], [126,162,130], [106,155,140], [98,150,150],
        [89,147,160], [81,140,170], [78,144,180], [73,123,204],
        [74,124,220], [81,129,240], [97,142,260], [112,152,273],
        [128,164,284], [145,170,290], [176,176,293]
    ],
    "right_shell_rows": [
        [170,170,154], [174,195,160], [179,205,168], [184,216,180],
        [190,224,190], [197,228,200], [206,230,211], [209,230,220],
        [208,228,232], [204,226,240], [202,221,254], [198,214,264], [197,197,281]
    ],
    "fins": {
        "Fin.Upper": [[80,153],[65,160],[55,174],[53,181],[57,193],[69,212],[69,184]],
        "Fin.Tail": [[32,201],[62,217],[76,237],[93,264],[60,260],[41,244],[34,221]],
        "Fin.Lower": [[103,269],[87,283],[80,300],[98,292],[111,278]]
    },
    "eye_centers_px": [[160,239],[185,237]], "eye_radii_px": [5.0,12.6],
    "views": views
}
(HERE / "sheet.json").write_text(json.dumps(data, indent=2)+"\n")
print(json.dumps({"palette": swatches, "height_m": data["height_m"]},indent=2))
