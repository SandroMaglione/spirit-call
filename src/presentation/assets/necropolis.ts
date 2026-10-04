/**
 * The ochre necropolis kit (`art/environment/ochre-necropolis/`, see its README): the pieces the
 * necropolis arena uses, each one mesh with one material. Sizes are copied from
 * its `manifest.json` (meters: height, then the X × Z footprint); do not
 * edit them by hand. Floor pieces have their origin at the top center; the
 * rest stand on the ground.
 */
import type { ModelSpec } from "../models.ts"
import canopicJarsUrl from "../../../art/environment/ochre-necropolis/models/canopic-jars.glb?url"
import deadShrubUrl from "../../../art/environment/ochre-necropolis/models/dead-shrub.glb?url"
import floorCrackedUrl from "../../../art/environment/ochre-necropolis/models/floor-cracked.glb?url"
import floorPlainUrl from "../../../art/environment/ochre-necropolis/models/floor-plain.glb?url"
import floorWornUrl from "../../../art/environment/ochre-necropolis/models/floor-worn.glb?url"
import obeliskBrokenUrl from "../../../art/environment/ochre-necropolis/models/obelisk-broken.glb?url"
import obeliskUrl from "../../../art/environment/ochre-necropolis/models/obelisk.glb?url"
import offeringTableUrl from "../../../art/environment/ochre-necropolis/models/offering-table.glb?url"
import pillarLargeUrl from "../../../art/environment/ochre-necropolis/models/pillar-large.glb?url"
import pillarSmallUrl from "../../../art/environment/ochre-necropolis/models/pillar-small.glb?url"
import sandDriftUrl from "../../../art/environment/ochre-necropolis/models/sand-drift.glb?url"
import sandRockLargeUrl from "../../../art/environment/ochre-necropolis/models/sand-rock-large.glb?url"
import sandRockSmallUrl from "../../../art/environment/ochre-necropolis/models/sand-rock-small.glb?url"
import sarcophagusUrl from "../../../art/environment/ochre-necropolis/models/sarcophagus.glb?url"
import torchStandUrl from "../../../art/environment/ochre-necropolis/models/torch-stand.glb?url"
import urnBrokenUrl from "../../../art/environment/ochre-necropolis/models/urn-broken.glb?url"
import urnTallUrl from "../../../art/environment/ochre-necropolis/models/urn-tall.glb?url"
import wallLowUrl from "../../../art/environment/ochre-necropolis/models/wall-low.glb?url"
import wallStraightUrl from "../../../art/environment/ochre-necropolis/models/wall-straight.glb?url"
import wingStatueUrl from "../../../art/environment/ochre-necropolis/models/wing-statue.glb?url"
import floorInsetUrl from "../../../art/environment/ochre-necropolis/models/floor-inset.glb?url"
import floorSmallUrl from "../../../art/environment/ochre-necropolis/models/floor-small.glb?url"
import floorRadialUrl from "../../../art/environment/ochre-necropolis/models/floor-radial.glb?url"

const piece = (url: string, height: number, footprint: readonly [number, number]) => ({ url, height, footprint, clips: {} }) as const satisfies ModelSpec

export const necropolisModels = {
  necropolisFloorPlain: piece(floorPlainUrl, 0.14, [2, 2]),
  necropolisFloorWorn: piece(floorWornUrl, 0.14, [2, 2]),
  necropolisFloorCracked: piece(floorCrackedUrl, 0.14, [2, 2]),
  necropolisWallStraight: piece(wallStraightUrl, 0.95, [2, 0.513]),
  necropolisWallLow: piece(wallLowUrl, 0.38, [2, 0.5]),
  necropolisPillarLarge: piece(pillarLargeUrl, 1.9, [1, 1]),
  necropolisPillarSmall: piece(pillarSmallUrl, 1.45, [0.72, 0.72]),
  necropolisObelisk: piece(obeliskUrl, 2.4, [1, 1]),
  necropolisObeliskBroken: piece(obeliskBrokenUrl, 1.15, [1, 1]),
  necropolisCanopicJars: piece(canopicJarsUrl, 0.84, [1.09, 0.84]),
  necropolisDeadShrub: piece(deadShrubUrl, 0.6531, [0.7078, 0.742]),
  necropolisSandRockLarge: piece(sandRockLargeUrl, 1.4, [2.0771, 1.3329]),
  necropolisSandRockSmall: piece(sandRockSmallUrl, 0.55, [1.0385, 1.3329]),
  necropolisSandDrift: piece(sandDriftUrl, 0.3, [2.1854, 1.3311]),
  necropolisSarcophagus: piece(sarcophagusUrl, 0.74, [1, 2]),
  necropolisTorchStand: piece(torchStandUrl, 1.3, [0.48, 0.48]),
  necropolisUrnTall: piece(urnTallUrl, 1.25, [0.8, 0.8]),
  necropolisUrnBroken: piece(urnBrokenUrl, 0.45, [1.1015, 0.9]),
  necropolisOfferingTable: piece(offeringTableUrl, 0.95, [1.7, 0.85]),
  necropolisWingStatue: piece(wingStatueUrl, 1.5562, [2.0049, 0.65]),
  necropolisFloorInset: piece(floorInsetUrl, 0.14, [2, 2]),
  necropolisFloorSmall: piece(floorSmallUrl, 0.14, [1, 1]),
  necropolisFloorRadial: piece(floorRadialUrl, 0.14, [2, 2])
} as const
