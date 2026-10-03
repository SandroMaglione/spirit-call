/**
 * The overgrown sanctuary kit (`art/environment/overgrown-sanctuary/`, see its README): the pieces the
 * sanctuary arena uses, each one mesh with one material. Sizes are copied from
 * its `manifest.json` (meters: height, then the X × Z footprint); do not
 * edit them by hand. Floor pieces have their origin at the top center; the
 * rest stand on the ground.
 */
import type { ModelSpec } from "../models.ts"
import bushUrl from "../../../art/environment/overgrown-sanctuary/models/bush.glb?url"
import fallenLogUrl from "../../../art/environment/overgrown-sanctuary/models/fallen-log.glb?url"
import fernUrl from "../../../art/environment/overgrown-sanctuary/models/fern.glb?url"
import floorCrackedUrl from "../../../art/environment/overgrown-sanctuary/models/floor-cracked.glb?url"
import floorPlainUrl from "../../../art/environment/overgrown-sanctuary/models/floor-plain.glb?url"
import floorWornUrl from "../../../art/environment/overgrown-sanctuary/models/floor-worn.glb?url"
import mushroomsUrl from "../../../art/environment/overgrown-sanctuary/models/mushrooms.glb?url"
import pillarLargeUrl from "../../../art/environment/overgrown-sanctuary/models/pillar-large.glb?url"
import pillarSmallUrl from "../../../art/environment/overgrown-sanctuary/models/pillar-small.glb?url"
import rootClumpUrl from "../../../art/environment/overgrown-sanctuary/models/root-clump.glb?url"
import saplingUrl from "../../../art/environment/overgrown-sanctuary/models/sapling.glb?url"
import shrineBrokenUrl from "../../../art/environment/overgrown-sanctuary/models/shrine-broken.glb?url"
import shrineUrl from "../../../art/environment/overgrown-sanctuary/models/shrine.glb?url"
import stumpUrl from "../../../art/environment/overgrown-sanctuary/models/stump.glb?url"
import timberPostUrl from "../../../art/environment/overgrown-sanctuary/models/timber-post.glb?url"
import wallLowUrl from "../../../art/environment/overgrown-sanctuary/models/wall-low.glb?url"
import wallStraightUrl from "../../../art/environment/overgrown-sanctuary/models/wall-straight.glb?url"

const piece = (url: string, height: number, footprint: readonly [number, number]) => ({ url, height, footprint, clips: {} }) as const satisfies ModelSpec

export const sanctuaryModels = {
  sanctuaryFloorPlain: piece(floorPlainUrl, 0.14, [2, 2]),
  sanctuaryFloorWorn: piece(floorWornUrl, 0.14, [2, 2]),
  sanctuaryFloorCracked: piece(floorCrackedUrl, 0.14, [2, 2]),
  sanctuaryWallStraight: piece(wallStraightUrl, 0.9946, [2, 0.545]),
  sanctuaryWallLow: piece(wallLowUrl, 0.4293, [2, 0.545]),
  sanctuaryPillarLarge: piece(pillarLargeUrl, 1.9583, [1.0353, 1]),
  sanctuaryPillarSmall: piece(pillarSmallUrl, 1.5044, [0.7964, 0.7799]),
  sanctuaryBush: piece(bushUrl, 0.6, [1.2288, 0.7689]),
  sanctuaryFern: piece(fernUrl, 0.3081, [0.8264, 0.8436]),
  sanctuaryFallenLog: piece(fallenLogUrl, 0.6062, [1.915, 0.6155]),
  sanctuaryMushrooms: piece(mushroomsUrl, 0.6, [0.88, 0.626]),
  sanctuaryStump: piece(stumpUrl, 0.635, [1.3815, 1.4498]),
  sanctuaryRootClump: piece(rootClumpUrl, 0.5516, [1.5814, 1.1506]),
  sanctuaryShrine: piece(shrineUrl, 1.5, [1.2, 0.85]),
  sanctuaryShrineBroken: piece(shrineBrokenUrl, 0.86, [1.3119, 0.9014]),
  sanctuarySapling: piece(saplingUrl, 2.2548, [1.2297, 0.6689]),
  sanctuaryTimberPost: piece(timberPostUrl, 1.715, [0.4364, 0.4432])
} as const
