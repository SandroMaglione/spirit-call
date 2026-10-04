# Gale Caster and Juggernaut review tools

This is the model-review stage of `docs/spirits.md`, adapted for multipart
enemies on pale backgrounds. It stops before rigging and game integration.
The tools are preserved locally for these two models so work on other
enemy recipes does not change their build dependency.

- `prepare.py` preserves the attachment, crops its seven views, and writes
  labeled pixel regions and configuration for either model.
- `measure.py` measures row contours, swatches and eye blobs. It uses the
  existing spirits tool's blob detector. Background masking distinguishes
  warm ivory, mint cloth, neutral stone, gold and eyes from blue-gray panels.
- `geometry.py` lofts measured widths and depths, projects surface details,
  creates cloth and prop geometry, and saves a static Blender source and GLB.
- `render.py` reads the saved Blender file and renders six orthographic
  views, the hero, the 30-degree game view, and a small raster preview.
  `sweep` renders candidate hero cameras.
- `review.py` scores silhouettes and creates comparison, overlay and
  phone-size boards. Enclosed shading gaps are filled in reference masks;
  the wide scoring canvas avoids cropping the scarf. It reports every view,
  including results below the 90% target.
- `verify.mjs` loads a GLB with Three.js and checks colors, one material,
  ground/height agreement, triangle budget and absence of animations or rigs.
- `grid.py` adds sheet pixel coordinates to a crop for checking labels.

The sources retain separate mesh parts for editing. A static review asset
is not a crowd-ready animated asset; the later rigging stage must join it
into one skinned mesh and follow `docs/models.md`.

Open `art/enemies/gale-juggernaut-review.html` through the repository's
network-served dev server. The page provides both models, camera presets,
wireframe, the original sheets, overlays and file downloads. It supports
phone layout and orbit controls without registering either enemy look.
