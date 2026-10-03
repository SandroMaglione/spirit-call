# Beta arena art plan

Eight new settings supply the environment library for a first beta with quest
stages, dungeon rooms and hardcore encounters. They join the courtyard,
sanctuary, cistern, kilnworks and monastery. This delivery supplies art, editable
assemblies and placement metadata. Playable quests, dungeon sequencing, enemy
spawns, collisions and game modes are separate work.

The target is 70 models per setting, 560 new GLBs in total. Each setting has
four sample assemblies and a phone-scale review. All models have individual
PNGs, and the sources remain editable in Blender. The original libraries are
preserved.

## Settings and coverage

| Setting | Construction and palette | Themed props | Assembly roles |
| --- | --- | --- | --- |
| [Saltwind harbor](saltwind-harbor/README.md) | Salt-grey stone, exposed timber frames, wood decks, weathered brass | Boats, dock crane, capstan, nets, cargo, mooring gear, cliffs | Cargo skirmish court, quay crossing, customs enclosure, lighthouse terrace |
| [Ochre necropolis](ochre-necropolis/README.md) | Sandstone courses, tapered hexagonal supports, turquoise marks | Tombs, obelisks, offering tables, sun disc, palm, sand drifts | Processional court, tomb approach, burial chamber, sun altar |
| [Prism quarry](prism-quarry/README.md) | Slate outcrops, timber braces, mineral accents | Crystals, rails, carts, lift cage, drill, winch, shoring | Excavation court, haulage crossing, mineral gallery, winch terrace |
| [Mycelium hollow](mycelium-hollow/README.md) | Earthen rubble, irregular root supports, muted mauve caps | Giant mushrooms, pods, root ribs, hollow logs, reed beds, shelters | Open clearing, root crossing, nursery chamber, elder garden |
| [Tempest observatory](tempest-observatory/README.md) | Blue-grey octagonal columns, brass inlays, geometric wall marks | Orrery, armillary, telescope, coil, lens, dish, weather instruments | Star court, sky crossing, instrument room, zenith terrace |
| [Autumn estate](autumn-estate/README.md) | Pale plaster, warm timber, russet cloth and leaves | Maples, hedges, pergola, fountain, tea furniture, planters | Leaf court, garden crossing, tea enclosure, pergola terrace |
| [Drowned archive](drowned-archive/README.md) | Limestone, copper bands, sea-green accents | Shelves, desks, scrolls, vault, coral, diving bell, tablets | Catalogue court, record crossing, vault chamber, reading terrace |
| [Basalt citadel](basalt-citadel/README.md) | Hexagonal basalt, reinforced masonry, iron, rust-red banners | Battlements, watchtower, throne, weapons, cages, siege equipment | Muster court, keep crossing, audience chamber, watch terrace |

Every setting can dress several chapters or rotating challenges. The layouts
reuse four construction patterns so they remain comparable during review.
Themed construction, prop arrangements, floor treatments and clipped corners
give each area its own appearance. They are not 32 different gameplay rules.

The broad courts reserve space for pack combat, dodging and team combinations.
Crossings illustrate dungeon connectors over non-traversable gaps. Enclosures
leave a central space for elite or boss encounters with side cover. Terraces
show two stair approaches to a raised back section. The planar courts and
enclosures can inform the current arena renderer first; elevation needs the
separate traversal work described in the shared guide.

No layout requires an element, premium character, damage threshold or timed
kill. The suggested roles follow `docs/vision.md`: replay through tactical
choices and readable encounters. Survival is a possible duration-based use;
these assets define no survival timer or spawning rule.

## Complete inventory rule

Each kit's `kit.json` lists all 70 IDs before modeling, and its generated README
links every delivered GLB and PNG with actual dimensions and triangle counts.

The 44 construction pieces are:

- Thirteen floor treatments: plain, worn, cracked, inset, small, large, border,
  border corner, threshold, transition, radial, deck and rubble.
- Ten wall pieces: short, straight, long, low, tall, corner, end, broken,
  window and buttress.
- Three pillar sizes or states: small, large and broken.
- Four stair flights: short, full, wide and narrow, plus a separate stair rail.
- Landing, platform, platform edge and wide platform.
- Straight and corner railings, freestanding arch, hinged doorway, wide gate,
  floor grate, wall grille, bridge and wide bridge.

There are 20 themed props per kit. Those lists include different functions and
selected small, large, damaged or open versions. A larger version changes its
construction or details where useful, such as a guard around the larger brazier.
The scale differences are authored in the mesh, not object transforms.

Six shared utility designs complete each kit: inactive beacon, active beacon,
closed supply cache, open cache, waymarker and seal plinth. A beacon changes
silhouette and a cache exposes its interior; their states remain legible without
an emissive material or transparency. Presentation may swap the two static
models. Their colors are not elemental states, and they grant no rewards.

## Reference choices

Reference images are linked and are not included in exports or source files.
The models are original constructions using the approved low-poly proportions,
wide bevels, subdued materials and orthographic readability.

- [Sarah Morris, Death's Door](https://braverobynart.com/deathsdoor): the Stranded
  Sailor exterior gives the harbor its mix of decks, cargo, ropes and rock
  boundaries. The door callouts, garden arena and bell-tower sheets inform
  simple thresholds, readable room edges and restrained landmark placement.
- [Frits Olsen, Death's Door environments](https://folsen.artstation.com/projects/PeVneo):
  broad faceted forms and clean separation of fighting floors from scenery
  guide the quarry, hollow and citadel.
- [HoYoverse, Sumeru desert](https://blog.playstation.com/2022/09/16/genshin-impact-version-3-1-a-journey-through-the-desert/):
  sandstone ruins, tomb chambers and desert landforms inform the necropolis.
- [HoYoverse, the Chasm](https://blog.playstation.com/2022/03/18/genshin-impact-version-2-6-lets-dig-into-the-chasm/):
  excavation layers and underground growth inform the quarry and hollow.
- [HoYoverse, Inazuma](https://blog.playstation.com/2021/07/09/genshin-impact-version-2-0-all-about-inazuma/):
  contrasting island settings inform the exposed observatory and enclosed estate.
- [HoYoverse, Fontaine](https://blog.playstation.com/2023/08/04/genshin-impact-version-4-0-launches-august-16-first-details/):
  water-adjacent architecture and instruments inform the harbor and archive.
  The archive's walkable floor is dry; underwater controls are not proposed.

## Delivery and integration

Each folder contains `source/<kit>.blend`, `source/examples.blend`, individual
`models/*.glb`, previews, a manifest, assembly placements and validation reports.
There is no custom viewer. Open the PNG galleries or the Blender sources.

Models use meters, Y up and Z forward in GLB. Static assets have one mesh and
one opaque vertex-color material. Door frames and leaves retain separate nodes
and pivots. Normal export preserves the saved source, including hand edits.
The generator replaces a source only with `--build --replace-generated`.

The wide bridge is 4 × 4 m, the narrow stair is 1 m wide, and the wide raised
platform is 4 × 2 m. Stair rises and connection points follow the earlier kits.
Each layout records its art role, entry markers, placements, a crow review
position and an area reserved for combat. These markers are integration notes,
not runtime spawn points or navigation data.

Clear-area checks use model bounds for props and suggested solid bounds for
architecture. The stair checks confirm that both endpoints meet supporting
planes. They do not prove a complete collision map or enemy pathfinding.
Before gameplay integration, review obstacles, decorative overhangs, camera
fading, telegraph contrast and touch performance in the actual game.

## Production checks

Build and validate each source, inspect the contact sheet and assembled scenes,
then render every individual model. Each set gets a focused commit after
`pnpm check`. The PR includes all eight commits and galleries.

Blender verifies finite geometry, nondegenerate faces, closed shells, positive
shell volume, normals, GLB round trips, bounds, mesh counts, pivots and open-door
clearance. Khronos validates each GLB. The delivery audit checks matching file
hashes, preview coverage, four layouts, two connected stair flights and four
clear combat areas per set. The final audit uses the committed files.

```sh
python3 art/environment/scripts/run.py --kit saltwind-harbor --render --crow art/characters/crow/crow.glb
python3 art/environment/scripts/beta_catalog.py --kit saltwind-harbor
python3 art/environment/scripts/audit.py --kit saltwind-harbor
```

For full Khronos validation, pass the external validator location with
`--validator /path/to/node_modules/gltf-validator`. Metal rendering is optional
on compatible Macs. Saved Blender scenes use CPU rendering for portability.
