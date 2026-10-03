/**
 * The frostbound monastery kit (`art/environment/frostbound-monastery/`, see its README): the pieces the
 * monastery arena uses, each one mesh with one material. Sizes are copied from
 * its `manifest.json` (meters: height, then the X × Z footprint); do not
 * edit them by hand. Floor pieces have their origin at the top center; the
 * rest stand on the ground.
 */
import type { ModelSpec } from "../models.ts"
import bannerUrl from "../../../art/environment/frostbound-monastery/models/banner.glb?url"
import bellUrl from "../../../art/environment/frostbound-monastery/models/bell.glb?url"
import benchUrl from "../../../art/environment/frostbound-monastery/models/bench.glb?url"
import brazierUrl from "../../../art/environment/frostbound-monastery/models/brazier.glb?url"
import floorCrackedUrl from "../../../art/environment/frostbound-monastery/models/floor-cracked.glb?url"
import floorPlainUrl from "../../../art/environment/frostbound-monastery/models/floor-plain.glb?url"
import floorWornUrl from "../../../art/environment/frostbound-monastery/models/floor-worn.glb?url"
import iceClusterUrl from "../../../art/environment/frostbound-monastery/models/ice-cluster.glb?url"
import lanternPostUrl from "../../../art/environment/frostbound-monastery/models/lantern-post.glb?url"
import pillarLargeUrl from "../../../art/environment/frostbound-monastery/models/pillar-large.glb?url"
import pillarSmallUrl from "../../../art/environment/frostbound-monastery/models/pillar-small.glb?url"
import shrineUrl from "../../../art/environment/frostbound-monastery/models/shrine.glb?url"
import snowRocksUrl from "../../../art/environment/frostbound-monastery/models/snow-rocks.glb?url"
import snowdriftUrl from "../../../art/environment/frostbound-monastery/models/snowdrift.glb?url"
import wallLowUrl from "../../../art/environment/frostbound-monastery/models/wall-low.glb?url"
import wallStraightUrl from "../../../art/environment/frostbound-monastery/models/wall-straight.glb?url"

const piece = (url: string, height: number, footprint: readonly [number, number]) => ({ url, height, footprint, clips: {} }) as const satisfies ModelSpec

export const monasteryModels = {
  monasteryFloorPlain: piece(floorPlainUrl, 0.14, [2, 2]),
  monasteryFloorWorn: piece(floorWornUrl, 0.14, [2, 2]),
  monasteryFloorCracked: piece(floorCrackedUrl, 0.14, [2, 2]),
  monasteryWallStraight: piece(wallStraightUrl, 1.005, [2, 0.5]),
  monasteryWallLow: piece(wallLowUrl, 0.435, [2, 0.5]),
  monasteryPillarLarge: piece(pillarLargeUrl, 1.97, [1, 1]),
  monasteryPillarSmall: piece(pillarSmallUrl, 1.52, [0.72, 0.72]),
  monasteryBanner: piece(bannerUrl, 1.8, [0.86, 0.48]),
  monasteryBell: piece(bellUrl, 0.86, [0.92, 0.92]),
  monasteryBench: piece(benchUrl, 1.02, [1.65, 0.58]),
  monasteryBrazier: piece(brazierUrl, 0.87, [0.68, 0.68]),
  monasteryIceCluster: piece(iceClusterUrl, 0.9, [0.7437, 0.6814]),
  monasteryLanternPost: piece(lanternPostUrl, 1.93, [0.56, 0.56]),
  monasteryShrine: piece(shrineUrl, 1.5, [1.2, 0.85]),
  monasterySnowRocks: piece(snowRocksUrl, 0.62, [1.4285, 0.9879]),
  monasterySnowdrift: piece(snowdriftUrl, 0.248, [1.4285, 0.9879])
} as const
