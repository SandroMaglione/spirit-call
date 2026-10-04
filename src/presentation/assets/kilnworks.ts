/**
 * The ember kilnworks kit (`art/environment/ember-kilnworks/`, see its README): the pieces the
 * kilnworks arena uses, each one mesh with one material. Sizes are copied from
 * its `manifest.json` (meters: height, then the X × Z footprint); do not
 * edit them by hand. Floor pieces have their origin at the top center; the
 * rest stand on the ground.
 */
import type { ModelSpec } from "../models.ts"
import anvilUrl from "../../../art/environment/ember-kilnworks/models/anvil.glb?url"
import barrelUrl from "../../../art/environment/ember-kilnworks/models/barrel.glb?url"
import boilerUrl from "../../../art/environment/ember-kilnworks/models/boiler.glb?url"
import chimneyUrl from "../../../art/environment/ember-kilnworks/models/chimney.glb?url"
import coalBinUrl from "../../../art/environment/ember-kilnworks/models/coal-bin.glb?url"
import crateUrl from "../../../art/environment/ember-kilnworks/models/crate.glb?url"
import crucibleUrl from "../../../art/environment/ember-kilnworks/models/crucible.glb?url"
import floorCrackedUrl from "../../../art/environment/ember-kilnworks/models/floor-cracked.glb?url"
import floorGrateUrl from "../../../art/environment/ember-kilnworks/models/floor-grate.glb?url"
import floorPlainUrl from "../../../art/environment/ember-kilnworks/models/floor-plain.glb?url"
import floorWornUrl from "../../../art/environment/ember-kilnworks/models/floor-worn.glb?url"
import furnaceUrl from "../../../art/environment/ember-kilnworks/models/furnace.glb?url"
import pillarLargeUrl from "../../../art/environment/ember-kilnworks/models/pillar-large.glb?url"
import pillarSmallUrl from "../../../art/environment/ember-kilnworks/models/pillar-small.glb?url"
import toolRackUrl from "../../../art/environment/ember-kilnworks/models/tool-rack.glb?url"
import ventUrl from "../../../art/environment/ember-kilnworks/models/vent.glb?url"
import wallLowUrl from "../../../art/environment/ember-kilnworks/models/wall-low.glb?url"
import wallStraightUrl from "../../../art/environment/ember-kilnworks/models/wall-straight.glb?url"
import floorInsetUrl from "../../../art/environment/ember-kilnworks/models/floor-inset.glb?url"
import floorSmallUrl from "../../../art/environment/ember-kilnworks/models/floor-small.glb?url"

const piece = (url: string, height: number, footprint: readonly [number, number]) => ({ url, height, footprint, clips: {} }) as const satisfies ModelSpec

export const kilnworksModels = {
  kilnworksFloorPlain: piece(floorPlainUrl, 0.14, [2, 2]),
  kilnworksFloorWorn: piece(floorWornUrl, 0.14, [2, 2]),
  kilnworksFloorCracked: piece(floorCrackedUrl, 0.14, [2, 2]),
  kilnworksFloorGrate: piece(floorGrateUrl, 0.14, [2, 2]),
  kilnworksWallStraight: piece(wallStraightUrl, 0.95, [2, 0.5175]),
  kilnworksWallLow: piece(wallLowUrl, 0.38, [2, 0.5175]),
  kilnworksPillarLarge: piece(pillarLargeUrl, 1.9, [1, 1]),
  kilnworksPillarSmall: piece(pillarSmallUrl, 1.45, [0.72, 0.72]),
  kilnworksFurnace: piece(furnaceUrl, 2.5, [1.95, 1.41]),
  kilnworksChimney: piece(chimneyUrl, 2.3, [0.94, 0.94]),
  kilnworksAnvil: piece(anvilUrl, 0.74, [1.26, 0.55]),
  kilnworksBarrel: piece(barrelUrl, 0.91, [0.82, 0.82]),
  kilnworksCrate: piece(crateUrl, 0.7, [0.85, 0.86]),
  kilnworksCoalBin: piece(coalBinUrl, 0.62, [1.3, 0.86]),
  kilnworksCrucible: piece(crucibleUrl, 0.72, [1.2, 1.1]),
  kilnworksBoiler: piece(boilerUrl, 1.55, [1.57, 1.155]),
  kilnworksVent: piece(ventUrl, 0.24, [1, 0.6]),
  kilnworksToolRack: piece(toolRackUrl, 1.45, [1.4, 0.4]),
  kilnworksFloorInset: piece(floorInsetUrl, 0.14, [2, 2]),
  kilnworksFloorSmall: piece(floorSmallUrl, 0.14, [1, 1])
} as const
