# Ochre necropolis

Ochre sandstone, battered tombs and restrained turquoise inlays. Open processional courts connect to burial chambers and raised sun altars.

![Quest arena composition](previews/procession-court.png)

## Review and edit

- [Labeled contact sheet](previews/contact-sheet.png), [library top view](previews/top.png), and [phone-scale review](previews/phone-scale.png).
- [Editable model library](source/ochre-necropolis.blend) and [four editable assemblies](source/examples.blend).
- [Manifest](manifest.json), [layout placements and reserved areas](layouts.json), and [full authoring inventory](kit.json).
- [Door open](previews/doorway-open.png), [gate open](previews/gate-wide-open.png), [open cache](previews/supply-cache-open.png), and [active beacon](previews/beacon-active.png).

| Intended use | Assembly | Plan |
| --- | --- | --- |
| quest skirmish | [procession-court](previews/procession-court.png) | [Top view](previews/procession-court-top.png) |
| dungeon connector | [tomb-approach](previews/tomb-approach.png) | [Top view](previews/tomb-approach-top.png) |
| boss or elite room | [burial-chamber](previews/burial-chamber.png) | [Top view](previews/burial-chamber-top.png) |
| survival arena | [sun-altar](previews/sun-altar.png) | [Top view](previews/sun-altar-top.png) |

The assemblies propose spaces for future quests and dungeon rooms. They are
editable art scenes, not shipped gameplay levels. The crow is a read-only size
reference in PNGs and is excluded from the saved assemblies and model exports.
Tall props belong at boundaries; review occlusion under the actual game camera.

## Models

70 GLBs, 32,876 triangles combined, 2,306,620 bytes combined.
These totals describe the library, not one arena's draw cost. Every static asset
has one mesh and one opaque vertex-color material. Each hinged door has a frame
and two leaves. No textures, required glTF extensions, or animation clips.

| Model preview | Export | Dimensions in XYZ meters | Triangles |
| --- | --- | --- | ---: |
| [arch-free](previews/arch-free.png) | [GLB](models/arch-free.glb) | 2.8 × 3.23 × 0.4 | 436 |
| [beacon-active](previews/beacon-active.png) | [GLB](models/beacon-active.glb) | 1 × 1.67 × 1 | 232 |
| [beacon-idle](previews/beacon-idle.png) | [GLB](models/beacon-idle.glb) | 1 × 1.12 × 1 | 104 |
| [bridge](previews/bridge.png) | [GLB](models/bridge.glb) | 2 × 0.3 × 4 | 1080 |
| [bridge-wide](previews/bridge-wide.png) | [GLB](models/bridge-wide.glb) | 4 × 0.3 × 4 | 1080 |
| [buried-column](previews/buried-column.png) | [GLB](models/buried-column.glb) | 1.815 × 1.618 × 0.98 | 96 |
| [canopic-jars](previews/canopic-jars.png) | [GLB](models/canopic-jars.glb) | 1.09 × 0.84 × 0.84 | 576 |
| [dead-shrub](previews/dead-shrub.png) | [GLB](models/dead-shrub.glb) | 0.708 × 0.653 × 0.742 | 80 |
| [doorway](previews/doorway.png) | [GLB](models/doorway.glb) | 2.69 × 2.982 × 0.58 | 1188 |
| [floor-border](previews/floor-border.png) | [GLB](models/floor-border.glb) | 2 × 0.14 × 0.3 | 180 |
| [floor-border-corner](previews/floor-border-corner.png) | [GLB](models/floor-border-corner.glb) | 2 × 0.14 × 2 | 120 |
| [floor-cracked](previews/floor-cracked.png) | [GLB](models/floor-cracked.glb) | 2 × 0.14 × 2 | 420 |
| [floor-deck](previews/floor-deck.png) | [GLB](models/floor-deck.glb) | 2 × 0.3 × 2 | 600 |
| [floor-grate](previews/floor-grate.png) | [GLB](models/floor-grate.glb) | 2 × 0.14 × 2 | 900 |
| [floor-inset](previews/floor-inset.png) | [GLB](models/floor-inset.glb) | 2 × 0.14 × 2 | 600 |
| [floor-large](previews/floor-large.png) | [GLB](models/floor-large.glb) | 4 × 0.14 × 2 | 540 |
| [floor-plain](previews/floor-plain.png) | [GLB](models/floor-plain.glb) | 2 × 0.14 × 2 | 300 |
| [floor-radial](previews/floor-radial.png) | [GLB](models/floor-radial.glb) | 2 × 0.14 × 2 | 436 |
| [floor-rubble](previews/floor-rubble.png) | [GLB](models/floor-rubble.glb) | 2 × 0.14 × 2 | 892 |
| [floor-small](previews/floor-small.png) | [GLB](models/floor-small.glb) | 1 × 0.14 × 1 | 120 |
| [floor-threshold](previews/floor-threshold.png) | [GLB](models/floor-threshold.glb) | 2 × 0.14 × 0.6 | 180 |
| [floor-transition](previews/floor-transition.png) | [GLB](models/floor-transition.glb) | 2 × 0.14 × 2 | 300 |
| [floor-worn](previews/floor-worn.png) | [GLB](models/floor-worn.glb) | 2 × 0.14 × 2 | 1020 |
| [gate-wide](previews/gate-wide.png) | [GLB](models/gate-wide.glb) | 4.69 × 1.96 × 0.58 | 1620 |
| [landing](previews/landing.png) | [GLB](models/landing.glb) | 2 × 0.14 × 2 | 300 |
| [market-awning](previews/market-awning.png) | [GLB](models/market-awning.glb) | 2.8 × 2.195 × 1.6 | 404 |
| [obelisk](previews/obelisk.png) | [GLB](models/obelisk.glb) | 1 × 2.4 × 1 | 260 |
| [obelisk-broken](previews/obelisk-broken.png) | [GLB](models/obelisk-broken.glb) | 1 × 1.15 × 1 | 260 |
| [offering-table](previews/offering-table.png) | [GLB](models/offering-table.glb) | 1.7 × 0.95 × 0.85 | 792 |
| [palm](previews/palm.png) | [GLB](models/palm.glb) | 2.473 × 2.142 × 2.352 | 164 |
| [pillar-broken](previews/pillar-broken.png) | [GLB](models/pillar-broken.glb) | 1 × 1.08 × 1 | 156 |
| [pillar-large](previews/pillar-large.png) | [GLB](models/pillar-large.glb) | 1 × 1.9 × 1 | 164 |
| [pillar-small](previews/pillar-small.png) | [GLB](models/pillar-small.glb) | 0.72 × 1.45 × 0.72 | 164 |
| [platform](previews/platform.png) | [GLB](models/platform.glb) | 2 × 1.2 × 2.013 | 480 |
| [platform-edge](previews/platform-edge.png) | [GLB](models/platform-edge.glb) | 2 × 1.2 × 0.263 | 480 |
| [platform-wide](previews/platform-wide.png) | [GLB](models/platform-wide.glb) | 4 × 1.2 × 2.013 | 480 |
| [railing-corner](previews/railing-corner.png) | [GLB](models/railing-corner.glb) | 2.04 × 0.85 × 2.04 | 1500 |
| [railing-straight](previews/railing-straight.png) | [GLB](models/railing-straight.glb) | 2.04 × 0.85 × 0.24 | 780 |
| [ruined-lintel](previews/ruined-lintel.png) | [GLB](models/ruined-lintel.glb) | 2.25 × 1.597 × 0.6 | 180 |
| [rune-console](previews/rune-console.png) | [GLB](models/rune-console.glb) | 0.7 × 0.93 × 0.623 | 300 |
| [sand-drift](previews/sand-drift.png) | [GLB](models/sand-drift.glb) | 2.185 × 0.3 × 1.331 | 104 |
| [sand-rock-large](previews/sand-rock-large.png) | [GLB](models/sand-rock-large.glb) | 2.077 × 1.4 × 1.333 | 52 |
| [sand-rock-small](previews/sand-rock-small.png) | [GLB](models/sand-rock-small.glb) | 1.039 × 0.55 × 1.333 | 52 |
| [sarcophagus](previews/sarcophagus.png) | [GLB](models/sarcophagus.glb) | 1 × 0.74 × 2 | 388 |
| [sarcophagus-open](previews/sarcophagus-open.png) | [GLB](models/sarcophagus-open.glb) | 1.859 × 0.69 × 2.164 | 388 |
| [seal-plinth](previews/seal-plinth.png) | [GLB](models/seal-plinth.glb) | 1.2 × 0.77 × 1.2 | 168 |
| [stair-full](previews/stair-full.png) | [GLB](models/stair-full.glb) | 2 × 1.2 × 2.4 | 720 |
| [stair-narrow](previews/stair-narrow.png) | [GLB](models/stair-narrow.glb) | 1 × 1.2 × 2.4 | 720 |
| [stair-rail](previews/stair-rail.png) | [GLB](models/stair-rail.glb) | 0.14 × 2.004 × 2.52 | 200 |
| [stair-short](previews/stair-short.png) | [GLB](models/stair-short.glb) | 2 × 0.4 × 0.8 | 240 |
| [stair-wide](previews/stair-wide.png) | [GLB](models/stair-wide.glb) | 4 × 1.2 × 2.4 | 720 |
| [sun-disc](previews/sun-disc.png) | [GLB](models/sun-disc.glb) | 1.72 × 1.91 × 0.65 | 280 |
| [supply-cache](previews/supply-cache.png) | [GLB](models/supply-cache.glb) | 1.2 × 0.73 × 0.765 | 660 |
| [supply-cache-open](previews/supply-cache-open.png) | [GLB](models/supply-cache-open.glb) | 1.2 × 1.32 × 0.846 | 1092 |
| [torch-stand](previews/torch-stand.png) | [GLB](models/torch-stand.glb) | 0.48 × 1.3 × 0.48 | 252 |
| [urn-broken](previews/urn-broken.png) | [GLB](models/urn-broken.glb) | 1.101 × 0.45 × 0.9 | 216 |
| [urn-tall](previews/urn-tall.png) | [GLB](models/urn-tall.glb) | 0.8 × 1.25 × 0.8 | 164 |
| [wall-broken](previews/wall-broken.png) | [GLB](models/wall-broken.glb) | 2 × 0.79 × 0.513 | 404 |
| [wall-buttress](previews/wall-buttress.png) | [GLB](models/wall-buttress.glb) | 2 × 1.8 × 1.15 | 512 |
| [wall-corner](previews/wall-corner.png) | [GLB](models/wall-corner.glb) | 2 × 0.95 × 2.013 | 720 |
| [wall-end](previews/wall-end.png) | [GLB](models/wall-end.glb) | 0.6 × 1.05 × 0.513 | 360 |
| [wall-grille](previews/wall-grille.png) | [GLB](models/wall-grille.glb) | 1.5 × 1.2 × 0.14 | 720 |
| [wall-long](previews/wall-long.png) | [GLB](models/wall-long.glb) | 4 × 0.95 × 0.513 | 360 |
| [wall-low](previews/wall-low.png) | [GLB](models/wall-low.glb) | 2 × 0.38 × 0.5 | 240 |
| [wall-short](previews/wall-short.png) | [GLB](models/wall-short.glb) | 1 × 0.95 × 0.513 | 360 |
| [wall-straight](previews/wall-straight.png) | [GLB](models/wall-straight.glb) | 2 × 0.95 × 0.513 | 360 |
| [wall-tall](previews/wall-tall.png) | [GLB](models/wall-tall.glb) | 2 × 1.8 × 0.513 | 480 |
| [wall-window](previews/wall-window.png) | [GLB](models/wall-window.glb) | 2 × 2.3 × 0.513 | 1560 |
| [waymarker](previews/waymarker.png) | [GLB](models/waymarker.glb) | 0.8 × 1.4 × 0.4 | 208 |
| [wing-statue](previews/wing-statue.png) | [GLB](models/wing-statue.glb) | 2.005 × 1.556 × 0.65 | 212 |

## Handoff

Read the [beta arena plan](../BETA-ARENAS.md) for role coverage and reference
choices, and the [shared guide](../README.md) for origins, axes and runtime
integration. Use `ochre-necropolis/<asset-id>` as the library key. These are art IDs,
not persistent gameplay-content IDs.

Floors connect on the 2 m grid at Y=0. The narrow stair is 1 m wide; full and
wide flights are 2 m and 4 m wide, all rising 1.2 m over 2.4 m. The wide bridge
is 4 × 4 m; the wide platform is 4 × 2 m and rises 1.2 m. Walk planes, stair
ramps, static collision suggestions and door pivots are in the manifest.
Cache and beacon states are separate static assets for presentation to swap.
They define no interaction, reward, elemental effect or gameplay timer.

[Source and import checks](verification.json), [Khronos validation](gltf-validation.json),
and [delivery audit](delivery-audit.json) accompany the files. The audit also
checks that both sample stairs meet supporting surfaces and that all four
reserved combat areas are free of modeled props and suggested solid bounds.
This is not an enemy-navigation test or phone performance measurement.

```sh
python3 art/environment/scripts/run.py --kit ochre-necropolis --render --crow art/characters/crow/crow.glb
python3 art/environment/scripts/beta_catalog.py --kit ochre-necropolis
python3 art/environment/scripts/audit.py --kit ochre-necropolis
```

Export uses the saved source, including manual edits. Rebuilding with
`--build --replace-generated` deliberately replaces those edits.

## Reference links

- https://braverobynart.com/deathsdoor
- https://blog.playstation.com/2022/09/16/genshin-impact-version-3-1-a-journey-through-the-desert/
