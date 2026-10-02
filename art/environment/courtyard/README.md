# Courtyard asset sample

First art review milestone: a stone pillar, paving module, and jade urn.
These establish proportions, bevels, palette, and material treatment before
the larger courtyard kit is built. No game code or dependencies are changed.

![The three sample models](previews/contact-sheet.png)

## View and edit

Open [source/courtyard.blend](source/courtyard.blend) in Blender 4.5 LTS.
The three named meshes are editable, with vertex colors in the `Color`
attribute. The saved scene includes an inspection camera and lights; F12
renders the lineup. The `STUDIO` collection is only for viewing.

The PNGs require no viewer installation:

- [Courtyard composition](previews/courtyard-overview.png), with four paving
  modules and the crow as a scale reference.
- [Top view](previews/top.png), useful for footprints and the urn opening.
- Individual views: [pillar](previews/pillar-large.png),
  [paving](previews/paving-plain.png), [urn](previews/urn-jade.png).
- [Small-scale view](previews/phone-scale.png), rendered at 390 × 844.

The composition uses a 0.95 m tall crow as a proposed proportion reference.
This is not a decision about its final game scale. The crow was read from
the existing static `crow.glb`, leaving local Blender edits untouched, and is absent from all supplied
Blender sources and GLBs. Its source hash is recorded in
`previews/render-info.json`. Reproducing that optional comparison requires
the same external source; the asset pack itself is self-contained.

The small-scale image uses a 30-degree elevation as a reference to the old
sprite camera. It is an art check, not a screenshot of the Three.js migration,
a touch test, or a phone performance measurement.

## Runtime assets

| ID | Dimensions, X × Y × Z in exported meters | Triangles | Use |
|---|---|---:|---|
| `pillar-large` | 1 × 1.899 × 1 | 748 | Solid obstacle; square 1 × 1 footprint |
| `paving-plain` | 2 × 0.14 × 2 | 300 | Ground decoration; 2 m placement grid |
| `urn-jade` | 0.769 × 0.775 × 0.719 | 844 | Edge decoration; no gameplay collision |

The three GLBs total about 127 KiB. Each has one mesh and one opaque material
primitive. They use flat normals and vertex colors, with no textures,
animations, lights, cameras, or required extensions. No Draco decoder is
needed. Material roughness is 0.87. Each file carries its own material, so the
renderer may deduplicate that shared material after loading.

`manifest.json` is the machine-readable handoff. Bounds, triangle counts,
byte sizes, and SHA-256 hashes are generated from the actual exports.
Dimensions use X/Y/Z order; footprint values use X/Z order.

### Placement and collision

- Blender uses Z up and -Y forward. GLB exports use +Y up and +Z forward.
- All exported roots have identity transforms. Library display positions in
  the Blender file are discarded on export; mesh-local dimensions are kept.
- The pillar and urn origins are at ground center. The urn's emblem faces +Z.
- Paving has its origin at **top center**, so its walking surface is Y=0 and
  its thickness extends downward. Place adjacent modules 2 m apart. Bevels
  leave a narrow seam; the four slabs inside a module have 2 cm joints.
- The pillar's maximum X/Z extent is its 1 m square base. Its shaft is
  narrower; the game should continue using the existing square collision
  footprint rather than deriving collision from the decorative mesh.
- `collision: null` means this asset does not define gameplay collision.
  The urn is intended for edges, not as an invisible obstruction in a lane.
- The manifest is a delivery description, not a new simulation/content API.
  These IDs are not account-save IDs and are not added to `test/content-ids.json`.

## Handoff to the Three.js migration

The `environment-assets` branch is based on shared main commit `7ca149d`.
Its only tracked additions are in this directory. Either the migration or
the assets can merge first. No crow/renderer file needs a conflict resolution
for this sample.

After both land, the integrating change should bundle `models/*.glb` through
the game's asset pipeline. These repository paths are not assumed to be
public URLs in a production build. Use `manifest.json` for dimensions and
choose the conversion between exported meters and game units in presentation.

For example, if the current 70-unit pillar is retained, a uniform scale of
70 game units per exported meter fits this model's base. That would also make
its height about 133 game units, so height needs visual review; footprint
compatibility does not imply the old 64-unit visual height is preserved.
The renderer can choose a different presentation height independently of the
unchanged collision box. The small pillar will be authored at the 50:70
footprint ratio once this sample direction is reviewed.

Keep obstacle fading and ground-effect visibility in the renderer. Inspect
the models under its actual camera and lighting before calling integration
finished. No custom renderer or visualizer is included here.

## Rebuild and verify

Run from the repository root. Blender supplies Python; no Python packages
or Blender add-ons are required.

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender

# Export the saved source, including intentional manual edits.
"$BLENDER" --background --python-exit-code 1 --python art/environment/courtyard/scripts/export.py
"$BLENDER" --background --python-exit-code 1 --python art/environment/courtyard/scripts/verify.py

# Render asset-only inspection views from the saved source.
"$BLENDER" --background --python-exit-code 1 --python art/environment/courtyard/scripts/render.py

# Optionally include the external crow study in composition images.
"$BLENDER" --background --python-exit-code 1 --python art/environment/courtyard/scripts/render.py -- --crow /absolute/path/to/crow.glb
```

`build.py` creates the authored sample from parameters. It refuses to overwrite
an existing source unless passed `-- --replace-generated`. That option replaces
manual model edits, so only use it to deliberately regenerate the source.
`export.py`, `verify.py`, and `render.py` do not save changes to the source.
Apply edited object rotation, scale, and modifiers before exporting. Keep the
`asset_id`, `purpose`, `footprint_m`, and `origin_note` custom properties accurate.

The geometric verifier checks finite coordinates, closed manifold component
shells, nonzero faces, overall outward volume, GLB axes and origins, vertex
colors, material count, no external resources, and fresh-import bounds and
triangle counts. The deliberately separate stone courses and decorative
parts can intersect; this is a game mesh, not a watertight manufacturing solid.

Khronos glTF Validator can run outside the game dependency tree:

```sh
npm install --prefix /tmp/courtyard-gltf-validation --no-package-lock --ignore-scripts gltf-validator@2.0.0-dev.3.10
node art/environment/courtyard/scripts/validate-gltf.cjs /tmp/courtyard-gltf-validation/node_modules/gltf-validator
```

`verification.json` records the Blender checks. `gltf-validation.json` records
the Khronos results with the GLB hashes. The delivered sample passed with zero
errors, warnings, infos, or hints for all three models. Repository `pnpm check`
also passed: typecheck, lint, and 225 tests. Runtime integration is still pending.

## Art direction and next batch

Warm grey stone, subdued jade ceramics, small bronze accents, broad bevels,
and a quiet floor. The first pillar is intact; deliberate chips and damage
belong to later variants. Moss stays on the cap, clear of the walking surface.

Shape and composition references: Frits Olsen's
[Death's Door environment concepts](https://folsen.artstation.com/projects/ZeVlBN),
particularly Flooded Fortress and Mushroom Dungeon. Palette reference:
[HoYoverse's Chenyu Vale overview](https://blog.playstation.com/2024/01/19/genshin-impact-version-4-4-brings-new-friends-and-visual-enhancements-jan-31/).
The meshes and palette here were authored in Blender for this project. No
reference-game geometry or texture is included.

Review the sample's proportions, ornament, and palette before expanding it.
The remaining planned kit is the small and chipped pillars, boundary modules,
cracked paving and trim, rock clusters, a lantern/brazier, crystal, and gold token.
Destructibility, drops, and shrine interactions are outside this art task.
