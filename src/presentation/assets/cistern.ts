/**
 * The flooded cistern kit (`art/environment/flooded-cistern/`, see its README): the pieces the
 * cistern arena uses, each one mesh with one material. Sizes are copied from
 * its `manifest.json` (meters: height, then the X × Z footprint); do not
 * edit them by hand. Floor pieces have their origin at the top center; the
 * rest stand on the ground.
 */
import type { ModelSpec } from "../models.ts"
import basinUrl from "../../../art/environment/flooded-cistern/models/basin.glb?url"
import buttressUrl from "../../../art/environment/flooded-cistern/models/buttress.glb?url"
import floorCrackedUrl from "../../../art/environment/flooded-cistern/models/floor-cracked.glb?url"
import floorGrateUrl from "../../../art/environment/flooded-cistern/models/floor-grate.glb?url"
import floorPlainUrl from "../../../art/environment/flooded-cistern/models/floor-plain.glb?url"
import floorWornUrl from "../../../art/environment/flooded-cistern/models/floor-worn.glb?url"
import pillarLargeUrl from "../../../art/environment/flooded-cistern/models/pillar-large.glb?url"
import pillarSmallUrl from "../../../art/environment/flooded-cistern/models/pillar-small.glb?url"
import pipeOutletUrl from "../../../art/environment/flooded-cistern/models/pipe-outlet.glb?url"
import pipeStraightUrl from "../../../art/environment/flooded-cistern/models/pipe-straight.glb?url"
import pumpUrl from "../../../art/environment/flooded-cistern/models/pump.glb?url"
import urnUrl from "../../../art/environment/flooded-cistern/models/urn.glb?url"
import valveUrl from "../../../art/environment/flooded-cistern/models/valve.glb?url"
import wallLowUrl from "../../../art/environment/flooded-cistern/models/wall-low.glb?url"
import wallStraightUrl from "../../../art/environment/flooded-cistern/models/wall-straight.glb?url"

const piece = (url: string, height: number, footprint: readonly [number, number]) => ({ url, height, footprint, clips: {} }) as const satisfies ModelSpec

export const cisternModels = {
  cisternFloorPlain: piece(floorPlainUrl, 0.14, [2, 2]),
  cisternFloorWorn: piece(floorWornUrl, 0.14, [2, 2]),
  cisternFloorCracked: piece(floorCrackedUrl, 0.14, [2, 2]),
  cisternFloorGrate: piece(floorGrateUrl, 0.14, [2, 2]),
  cisternWallStraight: piece(wallStraightUrl, 0.95, [2, 0.5]),
  cisternWallLow: piece(wallLowUrl, 0.38, [2, 0.5]),
  cisternPillarLarge: piece(pillarLargeUrl, 1.9, [1, 1]),
  cisternPillarSmall: piece(pillarSmallUrl, 1.45, [0.72, 0.72]),
  cisternPump: piece(pumpUrl, 1.84, [1.57, 1.155]),
  cisternPipeOutlet: piece(pipeOutletUrl, 0.9004, [1.675, 0.75]),
  cisternPipeStraight: piece(pipeStraightUrl, 0.4608, [1.6, 0.4608]),
  cisternValve: piece(valveUrl, 1.17, [0.64, 0.4]),
  cisternUrn: piece(urnUrl, 1.15, [0.876, 0.68]),
  cisternButtress: piece(buttressUrl, 1.74, [0.9, 1]),
  cisternBasin: piece(basinUrl, 0.4, [1.6, 1.6])
} as const
