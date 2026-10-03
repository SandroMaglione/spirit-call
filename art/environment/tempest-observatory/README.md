# Tempest observatory

Octagonal stonework, brass instruments and storm-blue details. An exposed observatory with radial courts, instrument bays and linked terraces.

![Quest arena composition](previews/star-court.png)

## Review and edit

- [Labeled contact sheet](previews/contact-sheet.png), [library top view](previews/top.png), and [phone-scale review](previews/phone-scale.png).
- [Editable model library](source/tempest-observatory.blend) and [four editable assemblies](source/examples.blend).
- [Manifest](manifest.json), [layout placements and reserved areas](layouts.json), and [full authoring inventory](kit.json).
- [Door open](previews/doorway-open.png), [gate open](previews/gate-wide-open.png), [open cache](previews/supply-cache-open.png), and [active beacon](previews/beacon-active.png).

| Intended use | Assembly | Plan |
| --- | --- | --- |
| quest skirmish | [star-court](previews/star-court.png) | [Top view](previews/star-court-top.png) |
| dungeon connector | [sky-crossing](previews/sky-crossing.png) | [Top view](previews/sky-crossing-top.png) |
| boss or elite room | [instrument-hall](previews/instrument-hall.png) | [Top view](previews/instrument-hall-top.png) |
| survival arena | [zenith-terrace](previews/zenith-terrace.png) | [Top view](previews/zenith-terrace-top.png) |

The assemblies propose spaces for future quests and dungeon rooms. They are
editable art scenes, not shipped gameplay levels. The crow is a read-only size
reference in PNGs and is excluded from the saved assemblies and model exports.
Tall props belong at boundaries; review occlusion under the actual game camera.

## Models

70 GLBs, 34,968 triangles combined, 2,414,076 bytes combined.
These totals describe the library, not one arena's draw cost. Every static asset
has one mesh and one opaque vertex-color material. Each hinged door has a frame
and two leaves. No textures, required glTF extensions, or animation clips.

| Model preview | Export | Dimensions in XYZ meters | Triangles |
| --- | --- | --- | ---: |
| [antenna-array](previews/antenna-array.png) | [GLB](models/antenna-array.glb) | 1.44 × 2.55 × 0.4 | 384 |
| [arch-free](previews/arch-free.png) | [GLB](models/arch-free.glb) | 2.8 × 3.23 × 0.4 | 468 |
| [armillary](previews/armillary.png) | [GLB](models/armillary.glb) | 1.24 × 1.97 × 1.07 | 376 |
| [astrolabe](previews/astrolabe.png) | [GLB](models/astrolabe.glb) | 1.04 × 1.67 × 0.9 | 212 |
| [banner-forked](previews/banner-forked.png) | [GLB](models/banner-forked.glb) | 1 × 1.94 × 0.4 | 292 |
| [beacon-active](previews/beacon-active.png) | [GLB](models/beacon-active.glb) | 1 × 1.67 × 1 | 232 |
| [beacon-idle](previews/beacon-idle.png) | [GLB](models/beacon-idle.glb) | 1 × 1.12 × 1 | 104 |
| [bridge](previews/bridge.png) | [GLB](models/bridge.glb) | 2 × 0.3 × 4 | 1080 |
| [bridge-wide](previews/bridge-wide.png) | [GLB](models/bridge-wide.glb) | 4 × 0.3 × 4 | 1080 |
| [broken-ring](previews/broken-ring.png) | [GLB](models/broken-ring.glb) | 1.41 × 1.505 × 0.5 | 260 |
| [cable-spool](previews/cable-spool.png) | [GLB](models/cable-spool.glb) | 1 × 0.83 × 1 | 780 |
| [capacitor](previews/capacitor.png) | [GLB](models/capacitor.glb) | 0.85 × 1.43 × 0.85 | 708 |
| [conductor-coil](previews/conductor-coil.png) | [GLB](models/conductor-coil.glb) | 0.85 × 1.43 × 0.85 | 708 |
| [console](previews/console.png) | [GLB](models/console.glb) | 1.35 × 1.05 × 0.8 | 492 |
| [crystal-prism](previews/crystal-prism.png) | [GLB](models/crystal-prism.glb) | 0.9 × 1.62 × 0.9 | 80 |
| [doorway](previews/doorway.png) | [GLB](models/doorway.glb) | 2.6 × 1.96 × 0.5 | 1260 |
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
| [instrument-crate](previews/instrument-crate.png) | [GLB](models/instrument-crate.glb) | 1.26 × 0.735 × 0.8 | 492 |
| [landing](previews/landing.png) | [GLB](models/landing.glb) | 2 × 0.14 × 2 | 300 |
| [lens-stand](previews/lens-stand.png) | [GLB](models/lens-stand.glb) | 1.04 × 1.67 × 0.9 | 156 |
| [lightning-rod](previews/lightning-rod.png) | [GLB](models/lightning-rod.glb) | 1.4 × 2.55 × 0.4 | 216 |
| [orrery](previews/orrery.png) | [GLB](models/orrery.glb) | 1.716 × 1.97 × 1.65 | 660 |
| [pillar-broken](previews/pillar-broken.png) | [GLB](models/pillar-broken.glb) | 1 × 1.08 × 1 | 172 |
| [pillar-large](previews/pillar-large.png) | [GLB](models/pillar-large.glb) | 1 × 1.9 × 1 | 180 |
| [pillar-small](previews/pillar-small.png) | [GLB](models/pillar-small.glb) | 0.72 × 1.45 × 0.72 | 180 |
| [platform](previews/platform.png) | [GLB](models/platform.glb) | 2 × 1.2 × 2.018 | 480 |
| [platform-edge](previews/platform-edge.png) | [GLB](models/platform-edge.glb) | 2 × 1.2 × 0.267 | 480 |
| [platform-wide](previews/platform-wide.png) | [GLB](models/platform-wide.glb) | 4 × 1.2 × 2.018 | 480 |
| [railing-corner](previews/railing-corner.png) | [GLB](models/railing-corner.glb) | 2.04 × 0.85 × 2.04 | 1500 |
| [railing-straight](previews/railing-straight.png) | [GLB](models/railing-straight.glb) | 2.04 × 0.85 × 0.24 | 780 |
| [ring-pedestal](previews/ring-pedestal.png) | [GLB](models/ring-pedestal.glb) | 1.26 × 0.85 × 1.26 | 188 |
| [seal-plinth](previews/seal-plinth.png) | [GLB](models/seal-plinth.glb) | 1.2 × 0.77 × 1.2 | 168 |
| [signal-dish](previews/signal-dish.png) | [GLB](models/signal-dish.glb) | 1.2 × 1.52 × 0.965 | 252 |
| [sky-rock](previews/sky-rock.png) | [GLB](models/sky-rock.glb) | 1.414 × 1.134 × 1.229 | 96 |
| [stair-full](previews/stair-full.png) | [GLB](models/stair-full.glb) | 2 × 1.2 × 2.4 | 720 |
| [stair-narrow](previews/stair-narrow.png) | [GLB](models/stair-narrow.glb) | 1 × 1.2 × 2.4 | 720 |
| [stair-rail](previews/stair-rail.png) | [GLB](models/stair-rail.glb) | 0.14 × 2.004 × 2.52 | 200 |
| [stair-short](previews/stair-short.png) | [GLB](models/stair-short.glb) | 2 × 0.4 × 0.8 | 240 |
| [stair-wide](previews/stair-wide.png) | [GLB](models/stair-wide.glb) | 4 × 1.2 × 2.4 | 720 |
| [star-chart](previews/star-chart.png) | [GLB](models/star-chart.glb) | 1.35 × 0.798 × 0.8 | 432 |
| [supply-cache](previews/supply-cache.png) | [GLB](models/supply-cache.glb) | 1.2 × 0.73 × 0.765 | 660 |
| [supply-cache-open](previews/supply-cache-open.png) | [GLB](models/supply-cache-open.glb) | 1.2 × 1.32 × 0.846 | 1092 |
| [telescope](previews/telescope.png) | [GLB](models/telescope.glb) | 1.228 × 1.742 × 0.9 | 200 |
| [wall-broken](previews/wall-broken.png) | [GLB](models/wall-broken.glb) | 2 × 0.79 × 0.518 | 404 |
| [wall-buttress](previews/wall-buttress.png) | [GLB](models/wall-buttress.glb) | 2 × 1.8 × 1.15 | 512 |
| [wall-corner](previews/wall-corner.png) | [GLB](models/wall-corner.glb) | 2 × 0.95 × 2.018 | 720 |
| [wall-end](previews/wall-end.png) | [GLB](models/wall-end.glb) | 0.674 × 1.05 × 0.518 | 360 |
| [wall-grille](previews/wall-grille.png) | [GLB](models/wall-grille.glb) | 1.5 × 1.2 × 0.14 | 720 |
| [wall-long](previews/wall-long.png) | [GLB](models/wall-long.glb) | 4 × 0.95 × 0.518 | 360 |
| [wall-low](previews/wall-low.png) | [GLB](models/wall-low.glb) | 2 × 0.38 × 0.5 | 240 |
| [wall-short](previews/wall-short.png) | [GLB](models/wall-short.glb) | 1 × 0.95 × 0.518 | 360 |
| [wall-straight](previews/wall-straight.png) | [GLB](models/wall-straight.glb) | 2 × 0.95 × 0.518 | 360 |
| [wall-tall](previews/wall-tall.png) | [GLB](models/wall-tall.glb) | 2 × 1.8 × 0.518 | 480 |
| [wall-window](previews/wall-window.png) | [GLB](models/wall-window.glb) | 2.154 × 2.3 × 0.518 | 1560 |
| [waymarker](previews/waymarker.png) | [GLB](models/waymarker.glb) | 0.8 × 1.4 × 0.4 | 208 |
| [wind-vane](previews/wind-vane.png) | [GLB](models/wind-vane.glb) | 1.3 × 2.269 × 0.4 | 176 |

## Handoff

Read the [beta arena plan](../BETA-ARENAS.md) for role coverage and reference
choices, and the [shared guide](../README.md) for origins, axes and runtime
integration. Use `tempest-observatory/<asset-id>` as the library key. These are art IDs,
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
python3 art/environment/scripts/run.py --kit tempest-observatory --render --crow art/characters/crow/crow.glb
python3 art/environment/scripts/beta_catalog.py --kit tempest-observatory
python3 art/environment/scripts/audit.py --kit tempest-observatory
```

Export uses the saved source, including manual edits. Rebuilding with
`--build --replace-generated` deliberately replaces those edits.

## Reference links

- https://braverobynart.com/deathsdoor
- https://blog.playstation.com/2021/07/09/genshin-impact-version-2-0-all-about-inazuma/
