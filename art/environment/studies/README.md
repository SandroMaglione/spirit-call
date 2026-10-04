# Arena prop improvements

Eight art sets cover every arena currently registered in `arenaLooks`:
115 exported models including the approved 17-model harbor study and 98 models
across the other seven arenas. Each of those seven sets has five small details,
five working props and four large perimeter assemblies.

These are editable art deliveries for review. The playable arenas continue to use
their registered assets; choosing replacements and integrating placements is a
separate step. Each arena has its own commit, Blender source, GLBs and audit reports.

## Review

Run `pnpm dev --host --port 5200`, then open
`/art/environment/studies/index.html`. The gallery links to all eight sets.
Each set offers individual player comparisons, groups by size, original/study
comparisons and an arrangement outside the combat grid. Drag or touch to rotate.
The blue spirit uses the current game scale: **0.5804 m tall**. Original/study
pairs share the same camera scale. Large assemblies have a wider view to fit their
footprint, with the player shown alongside them.

| Arena | Changes and additions | Review sheets |
| --- | --- | --- |
| [Saltwind harbor](../saltwind-harbor-study/README.md) | Approved 17-model set: smaller supplies, connected nautical fittings and supported dockside assemblies. | [Props](../saltwind-harbor-study/previews/working.png) |
| [Courtyard](../courtyard-study/README.md) | Smaller urns and brazier; bowls, incense and carved tablets; pergola, gateway, fountain and offering alcove. | [All](../courtyard-study/previews/all.png), [comparison](../courtyard-study/previews/compare.png), [outside](../courtyard-study/previews/outside.png) |
| [Flooded cistern](../flooded-cistern-study/README.md) | Pumps, pipes and valves with visible bearings and supports; repair tools, fittings and gauges; pump bank, manifold, settling tank and service canopy. | [All](../flooded-cistern-study/previews/all.png), [comparison](../flooded-cistern-study/previews/compare.png), [outside](../flooded-cistern-study/previews/outside.png) |
| [Ember kilnworks](../ember-kilnworks-study/README.md) | Compact anvil and boiler; ingots, tongs, crucible and mould; brick furnace, forging bay, buttressed chimney and casting station. | [All](../ember-kilnworks-study/previews/all.png), [comparison](../ember-kilnworks-study/previews/compare.png), [outside](../ember-kilnworks-study/previews/outside.png) |
| [Overgrown sanctuary](../overgrown-sanctuary-study/README.md) | Connected roots, branches and foliage; ferns, fungi, leaves and seed pods; root gateway, shrine grove, rooted ruin and mushroom garden. | [All](../overgrown-sanctuary-study/previews/all.png), [comparison](../overgrown-sanctuary-study/previews/compare.png), [outside](../overgrown-sanctuary-study/previews/outside.png) |
| [Ochre necropolis](../ochre-necropolis-study/README.md) | Compact burial goods and fitted coffin; mirrored folded-wing guardian with attached feather relief; tomb gateway, burial dais, sun altar and offering awning. | [All](../ochre-necropolis-study/previews/all.png), [comparison](../ochre-necropolis-study/previews/compare.png), [outside](../ochre-necropolis-study/previews/outside.png) |
| [Basalt citadel](../basalt-citadel-study/README.md) | Smaller banner and racks with attached weapons and shields; pouches, bound torches and folded cloth; supported ram, guard shelter, symmetric throne dais and battlement bay. | [All](../basalt-citadel-study/previews/all.png), [comparison](../basalt-citadel-study/previews/compare.png), [outside](../basalt-citadel-study/previews/outside.png) |
| [Frostbound monastery](../frostbound-monastery-study/README.md) | Lower bench and lantern, bells attached to visible hangers; tea, books, mats and firewood; snow-roofed bell tower, shrine pavilion, cloister gateway and winter hearth. | [All](../frostbound-monastery-study/previews/all.png), [comparison](../frostbound-monastery-study/previews/compare.png), [outside](../frostbound-monastery-study/previews/outside.png) |

## Scale examples

| Prop | Original height | Study height |
| --- | ---: | ---: |
| Kilnworks anvil | 0.74 m | 0.38 m |
| Kilnworks boiler | 1.56 m | 0.79 m |
| Necropolis tall urn / handled amphora | 1.25 m | 0.50 m |
| Citadel banner | 2.30 m | 1.18 m |
| Monastery lantern | 1.93 m | 0.96 m |
| Monastery bench | 1.02 m | 0.30 m |

## Validation and limits

- All 115 GLBs passed closed-shell, positive-volume, origin, material and round-trip verification. Source and export hashes match the recorded reports.
- Every modeled component has geometric contact with ground or a connected chain of components. The support audit has zero unsupported pieces with a 2 mm tolerance. This checks contact, not structural load capacity; joined meshes retain intersecting closed shells rather than boolean-welded solids.
- New props use one mesh and one opaque vertex-color material per asset, without textures or animations.
- Desktop and phone-sized browser reviews used the network address and actual exports. The seven new exterior arrangements have no asset bounds overlapping the combat rectangle. Phone layouts have no horizontal overflow; touch rotation was exercised with synthetic pointer events, not on a physical phone.
- After rebasing the eight arena commits onto current main, `env VITEST_MAX_WORKERS=2 pnpm check` passed typecheck, lint and all 417 tests in 52 files. Default parallelism hit the existing replay-test timeout during earlier runs; limiting workers resolved the final check.
- `pnpm build` passed on the rebased branch. The review gallery is served by the dev server; study models are not imported into the production game yet.

Art readability, supported construction and scale are reviewed here. Gameplay
placement, collisions and physical-device performance need review during integration.
