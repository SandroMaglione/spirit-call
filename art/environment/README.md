# Environment libraries

Editable low-poly Blender kits, individual GLBs, and PNG reviews. These folders
contain art and delivery metadata only. They do not change level layouts,
simulation, rendering, controls, account content, or asset loading in the game.

The original [courtyard](courtyard/README.md) remains unchanged. The first expansion is in
`courtyard-extension`, `overgrown-sanctuary`, `flooded-cistern`, `ember-kilnworks`,
and `frostbound-monastery`. Each kit's README links its source and previews and
lists the actual delivered models. `kit.json` records the authored inventory,
palette, and reference links; it is input to the generator, not a game API.

| Library | New models | Review |
| --- | ---: | --- |
| [Courtyard extension](courtyard-extension/README.md) | 25 | [Contact sheet](courtyard-extension/previews/contact-sheet.png) · [Terrace](courtyard-extension/previews/terrace.png) |
| [Overgrown sanctuary](overgrown-sanctuary/README.md) | 47 | [Contact sheet](overgrown-sanctuary/previews/contact-sheet.png) · [Terrace](overgrown-sanctuary/previews/terrace.png) |
| [Flooded cistern](flooded-cistern/README.md) | 47 | [Contact sheet](flooded-cistern/previews/contact-sheet.png) · [Crossing](flooded-cistern/previews/crossing.png) |
| [Ember kilnworks](ember-kilnworks/README.md) | 47 | [Contact sheet](ember-kilnworks/previews/contact-sheet.png) · [Enclosure](ember-kilnworks/previews/enclosure.png) |
| [Frostbound monastery](frostbound-monastery/README.md) | 47 | [Contact sheet](frostbound-monastery/previews/contact-sheet.png) · [Terrace](frostbound-monastery/previews/terrace.png) |

These first five additions contain 213 models. Together with the original
courtyard they contain 231 models. The [beta arena expansion](BETA-ARENAS.md)
adds eight further settings with 560 models, bringing the environment library
to 791 models. Every delivered set has its own validation and delivery audit.

| Beta library | Models | Review |
| --- | ---: | --- |
| [Saltwind harbor](saltwind-harbor/README.md) | 70 | [Contact sheet](saltwind-harbor/previews/contact-sheet.png) · [Cargo court](saltwind-harbor/previews/cargo-court.png) |
| [Ochre necropolis](ochre-necropolis/README.md) | 70 | [Contact sheet](ochre-necropolis/previews/contact-sheet.png) · [Sun altar](ochre-necropolis/previews/sun-altar.png) |
| [Prism quarry](prism-quarry/README.md) | 70 | [Contact sheet](prism-quarry/previews/contact-sheet.png) · [Crystal gallery](prism-quarry/previews/crystal-gallery.png) |
| [Mycelium hollow](mycelium-hollow/README.md) | 70 | [Contact sheet](mycelium-hollow/previews/contact-sheet.png) · [Spore clearing](mycelium-hollow/previews/spore-clearing.png) |
| [Tempest observatory](tempest-observatory/README.md) | 70 | [Contact sheet](tempest-observatory/previews/contact-sheet.png) · [Star court](tempest-observatory/previews/star-court.png) |
| [Autumn estate](autumn-estate/README.md) | 70 | [Contact sheet](autumn-estate/previews/contact-sheet.png) · [Tea enclosure](autumn-estate/previews/tea-enclosure.png) |
| [Drowned archive](drowned-archive/README.md) | 70 | [Contact sheet](drowned-archive/previews/contact-sheet.png) · [Vault chamber](drowned-archive/previews/vault-chamber.png) |
| [Basalt citadel](basalt-citadel/README.md) | 70 | [Contact sheet](basalt-citadel/previews/contact-sheet.png) · [Muster court](basalt-citadel/previews/muster-court.png) |

The beta kits have four example scenes each, named for the area, with a top
view per scene. Their READMEs and `layouts.json` name those scenes. Use
`beta_catalog.py` to refresh a beta kit's README after export and validation;
`catalog.py` continues to serve the first five additions. All other pipeline
commands work for either batch.

## Review and edit

Open a kit's `source/<kit>.blend` in Blender 4.5 LTS to edit the model library.
Each asset has a named collection and an empty root carrying `asset_id` and
`metadata_json`. Its children are the actual meshes. Vertex colors are in `Color`.
The studio floor, camera, and lights are excluded from the exports.

`source/examples.blend` has scenes selectable in Blender's scene menu. The first
five kits provide a terrace, a crossing and an enclosure. Beta kits provide
four named arena compositions. They are editable art compositions, not gameplay
levels. `layouts.json` records the placements in
exported coordinates. The example file is generated from the library; edit
individual assets in the main source, not only in its generated example copy.

`previews/` includes a labeled contact sheet, library top view, individual model
PNGs, open-door views, three assembled scenes, a terrace top view, and a
390 × 844 composition. PNGs need no special viewer. The optional crow in the
composition images is a read-only reference at 0.95 m tall, not a decision about
runtime character scale. Its hash is recorded in `render-info.json`. It is not
included in exported models or the saved example scenes.

## Shared construction rules

- Meters, with +Y up and +Z forward in GLB. Blender uses Z up and -Y forward.
- Each GLB has an identity root. Its child meshes retain intentional local
  translations, including door hinges. Do not flatten the door hierarchy.
- Floors originate at top center, with thickness below Y=0. Props and ordinary
  walls originate at ground center. Consult `origin` for exceptions.
- Most floors are 2 × 2 m. Small flags are 1 × 1 m; large modules are 4 × 2 m.
  Straight wall runs are 1, 2, or 4 m long. Rotations are around +Y.
- Plain, worn, cracked, inset, and transition floors share edge positions.
  Floor borders and L corners occupy only the strips visible in their meshes.
- Each mesh has one opaque vertex-color material primitive. A door has three
  meshes, so it has three primitives. There are no textures, required glTF
  extensions, animations, lights, cameras, or compression-decoder dependencies.
- Palette accents indicate art materials, not elemental damage or interactive
  state. Water, flame, steam, glow, snowfall, and destruction are not simulated.

The original courtyard's 50:70 pillar footprint ratio remains unchanged. The
new libraries use their own documented meter dimensions. Presentation must
choose how to map these to game units; do not infer simulation sizes from color
or a filename.

## Current renderer integration

[The model rules](../../docs/models.md) and
[arena looks](../../src/presentation/looks.ts) use 70 game units per meter for
the current courtyard. Static floors, walls, and props in these libraries keep
one mesh and one material so they can use the same batching approach after
registration. The empty root is the asset's coordinate frame, not a studio
helper; its mesh child has identity placement for static assets.

Doors have a frame and two moving leaves; the sluice has a frame and a sliding
panel. These assemblies intentionally preserve their movable hierarchy and
cannot be registered unchanged as a single static scenery batch. Their
integration must retain those parts, either with separate batches per part or
a small number of individual objects. The supplied metadata does not extend
`arenaLook` automatically. Rectangular floor modules, terraces, and bridges
also need deliberate level placement beyond today's square-tile arena floor.

The build bundles only models imported by presentation. Adding these libraries
does not include all their GLBs in the running game or increase its draw calls.

## Manifest version 2

The new libraries use a versioned handoff to support several meshes and moving
parts. The original courtyard keeps its version 1 manifest. No game consumer
is changed by this delivery.

```json
{
  "id": "stair-full",
  "walk_surfaces": [{
    "kind": "ramp",
    "width_m": 2,
    "bottom_m": [0, 0, 1.2],
    "top_m": [0, 1.2, -1.2]
  }],
  "connections": [
    { "name": "bottom", "position_m": [0, 0, 1.2] },
    { "name": "top", "position_m": [0, 1.2, -1.2] }
  ]
}
```

This is an excerpt from the delivery format, not a runtime component. Per-asset
bounds, dimensions, mesh/triangle counts, byte sizes, and SHA-256 hashes are
generated from the actual source and export. Metadata uses these conventions:

| Field | Meaning |
| --- | --- |
| `collision` | Suggested static boxes with `center_m` and `size_m` in XYZ. Decorative overhangs may extend beyond them. |
| `walk_surfaces` | A horizontal plane or a continuous stair ramp. Plane `bounds_xz_m` is min X, min Z, max X, max Z relative to optional `center_xz_m`. |
| `connections` | Named local attachment points. Rotate and translate them with the model. |
| `side_boundaries` | Stair edge segments for level construction. These are not automatically created colliders. |
| `moving_parts` | Exported node name, axis, hinge pivot or slide endpoints, closed/open pose, and suggested closed collision box. |
| `opening` | Clear passage width, height, and frame depth. |
| `sockets` | Positions for optional presentation effects. No effects are embedded. |

For a hinge, `open_degrees` is the local rotation around +Y; `pivot_m` is its
authored child translation. The closed collision box is in asset-root space.
Rotate its center and orientation about that pivot when moving it. For a slide,
set the child translation to the named open/closed position and translate the
box by the same delta. Static frame boxes must remain at the jambs.

Stairs climb toward -Z. Short flights rise 0.4 m over 0.8 m; full and wide
flights rise 1.2 m over 2.4 m. Treads rise 0.2 m. The ramp intentionally smooths
those treads and can differ from their visible surface by up to one riser.
Character height and foot placement need runtime review. The approved traversal
direction is automatic walking with the existing movement controls.

The initial proposed traversal has one walkable height at any ground position.
The bridge examples span unwalkable gaps; they do not imply an accessible route
under the bridge. Jumping, falling, enemy navigation across heights, projectile
height rules, and camera occlusion still need game integration. These files
alone do not implement climbable stairs or functioning gates.

Props default to decoration with no collision. If an integrator makes a prop
an obstacle or interactive object, that choice needs explicit gameplay data.
Tall architecture should be reviewed for foreground fading and attack-warning
visibility under the actual game camera. The PNGs are art checks, not device
performance or touch-input verification.

## Rebuild and validation

Run from the repository root. Blender supplies its Python modules. The shared
scripts add no game dependencies. `run.py` accepts `--blender /path/to/blender`
on platforms where Blender is not in PATH or in the standard macOS location.
Rendering defaults to CPU. `--device METAL` uses an available Apple GPU;
`--threads 2` limits CPU work when other Blender jobs are running. Saved source
and example scenes default to CPU so they remain portable.

```sh
# Export and verify the saved source, including manual edits.
python3 art/environment/scripts/run.py --kit courtyard-extension

# Also regenerate previews and editable example scenes.
python3 art/environment/scripts/run.py --kit courtyard-extension --render --crow art/characters/crow/crow.glb

# Validate with the Khronos validator, installed outside the game package.
npm install --prefix /tmp/environment-gltf-validator --no-package-lock --ignore-scripts gltf-validator@2.0.0-dev.3.10
python3 art/environment/scripts/run.py --kit courtyard-extension --validator /tmp/environment-gltf-validator/node_modules/gltf-validator

# Generate a new source from kit.json. Fails if a source already exists.
python3 art/environment/scripts/run.py --kit courtyard-extension --build

# Refresh the asset index after validation, then audit the complete delivery.
python3 art/environment/scripts/catalog.py --kit courtyard-extension
python3 art/environment/scripts/audit.py --kit courtyard-extension
```

`--build --replace-generated` deliberately discards manual source edits. Ordinary
export and verification never save the source. Rendering writes `examples.blend`
and previews, never the main library file. Use `--render --compositions-only`
for assembled scenes or `--render --asset doorway` for one asset and its open
pose. Logs are saved under each kit's ignored `.logs/` folder.

Before export, apply mesh scale and modifiers, reset rotations to the closed
pose, and keep root `metadata_json` accurate. Keep moving child translations:
they define hinge pivots. Library display offsets on the root do not export.

`verification.json` records checks on finite geometry, closed manifold shells,
positive volume per disconnected shell, nondegenerate triangles, source hashes,
fresh GLB imports, bounds, hierarchy, pivots, and stair metadata. The verifier
opens imported doors and sluices and checks passage clearance.
`gltf-validation.json` records the Khronos validator result for each hashed GLB.
Intersecting closed pieces are intentional where masonry and trim meet; these
are game meshes, not manufacturing solids.

## References

The sets retain broad bevels, flat facets, subdued surfaces, and readable
silhouettes from the approved courtyard. New environments vary construction
and props as well as palette. All supplied geometry is authored for this game.

- [Sarah Morris: Death's Door](https://braverobynart.com/deathsdoor), especially
  the garden, gates, and bell tower sheets.
- [Frits Olsen: environments 1](https://folsen.artstation.com/projects/ZeVlBN)
  and [environments 2](https://folsen.artstation.com/projects/PeVneo).
- [HoYoverse: Chenyu Vale](https://blog.playstation.com/2024/01/19/genshin-impact-version-4-4-brings-new-friends-and-visual-enhancements-jan-31/).
- [HoYoverse: Enkanomiya](https://blog.playstation.com/2021/12/26/genshin-impact-version-2-4-brings-grand-celebrations-and-a-mysterious-new-area-to-teyvat/).
- [HoYoverse: Dragonspine](https://blog.playstation.com/?p=344568).

Reference images are linked, not bundled as game assets. See each `kit.json`
for the references selected for that area.
