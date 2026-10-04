/**
 * The basalt citadel kit (`art/environment/basalt-citadel/`, see its README): the pieces the
 * citadel arena uses, each one mesh with one material. Sizes are copied from
 * its `manifest.json` (meters: height, then the X × Z footprint); do not
 * edit them by hand. Floor pieces have their origin at the top center; the
 * rest stand on the ground.
 */
import type { ModelSpec } from "../models.ts"
import bannerTallUrl from "../../../art/environment/basalt-citadel/models/banner-tall.glb?url"
import basaltRubbleUrl from "../../../art/environment/basalt-citadel/models/basalt-rubble.glb?url"
import basaltSpiresUrl from "../../../art/environment/basalt-citadel/models/basalt-spires.glb?url"
import brazierLargeUrl from "../../../art/environment/basalt-citadel/models/brazier-large.glb?url"
import brazierSmallUrl from "../../../art/environment/basalt-citadel/models/brazier-small.glb?url"
import drumUrl from "../../../art/environment/basalt-citadel/models/drum.glb?url"
import floorCrackedUrl from "../../../art/environment/basalt-citadel/models/floor-cracked.glb?url"
import floorPlainUrl from "../../../art/environment/basalt-citadel/models/floor-plain.glb?url"
import floorWornUrl from "../../../art/environment/basalt-citadel/models/floor-worn.glb?url"
import gargoyleUrl from "../../../art/environment/basalt-citadel/models/gargoyle.glb?url"
import pillarLargeUrl from "../../../art/environment/basalt-citadel/models/pillar-large.glb?url"
import pillarSmallUrl from "../../../art/environment/basalt-citadel/models/pillar-small.glb?url"
import shieldRackUrl from "../../../art/environment/basalt-citadel/models/shield-rack.glb?url"
import siegeCrateUrl from "../../../art/environment/basalt-citadel/models/siege-crate.glb?url"
import supplyCacheUrl from "../../../art/environment/basalt-citadel/models/supply-cache.glb?url"
import throneBrokenUrl from "../../../art/environment/basalt-citadel/models/throne-broken.glb?url"
import wallLowUrl from "../../../art/environment/basalt-citadel/models/wall-low.glb?url"
import wallStraightUrl from "../../../art/environment/basalt-citadel/models/wall-straight.glb?url"
import warTableUrl from "../../../art/environment/basalt-citadel/models/war-table.glb?url"
import weaponRackUrl from "../../../art/environment/basalt-citadel/models/weapon-rack.glb?url"
import archFreeUrl from "../../../art/environment/basalt-citadel/models/arch-free.glb?url"
import batteringRamUrl from "../../../art/environment/basalt-citadel/models/battering-ram.glb?url"
import chainAnchorUrl from "../../../art/environment/basalt-citadel/models/chain-anchor.glb?url"
import floorInsetUrl from "../../../art/environment/basalt-citadel/models/floor-inset.glb?url"
import floorRadialUrl from "../../../art/environment/basalt-citadel/models/floor-radial.glb?url"
import floorSmallUrl from "../../../art/environment/basalt-citadel/models/floor-small.glb?url"
import pillarBrokenUrl from "../../../art/environment/basalt-citadel/models/pillar-broken.glb?url"
import victoryStandardUrl from "../../../art/environment/basalt-citadel/models/victory-standard.glb?url"
import wallTallUrl from "../../../art/environment/basalt-citadel/models/wall-tall.glb?url"
import wallWindowUrl from "../../../art/environment/basalt-citadel/models/wall-window.glb?url"
import watchtowerUrl from "../../../art/environment/basalt-citadel/models/watchtower.glb?url"

const piece = (url: string, height: number, footprint: readonly [number, number]) => ({ url, height, footprint, clips: {} }) as const satisfies ModelSpec

export const citadelModels = {
  citadelFloorPlain: piece(floorPlainUrl, 0.14, [2, 2]),
  citadelFloorWorn: piece(floorWornUrl, 0.14, [2, 2]),
  citadelFloorCracked: piece(floorCrackedUrl, 0.14, [2, 2]),
  citadelWallStraight: piece(wallStraightUrl, 0.95, [2, 0.5275]),
  citadelWallLow: piece(wallLowUrl, 0.38, [2, 0.5275]),
  citadelPillarLarge: piece(pillarLargeUrl, 1.9, [1, 1]),
  citadelPillarSmall: piece(pillarSmallUrl, 1.45, [0.72, 0.72]),
  citadelBannerTall: piece(bannerTallUrl, 2.3, [1.1, 0.4]),
  citadelBasaltRubble: piece(basaltRubbleUrl, 0.44, [1.4531, 1.2904]),
  citadelBasaltSpires: piece(basaltSpiresUrl, 1.84, [1.4531, 1.2904]),
  citadelBrazierLarge: piece(brazierLargeUrl, 1.2615, [1.02, 1.02]),
  citadelBrazierSmall: piece(brazierSmallUrl, 0.87, [0.68, 0.68]),
  citadelDrum: piece(drumUrl, 0.842, [0.96, 0.96]),
  citadelGargoyle: piece(gargoyleUrl, 1.15, [1.7, 0.729]),
  citadelSiegeCrate: piece(siegeCrateUrl, 0.82, [0.85, 0.94]),
  citadelSupplyCache: piece(supplyCacheUrl, 0.73, [1.2, 0.765]),
  citadelWarTable: piece(warTableUrl, 0.98, [1.8, 1]),
  citadelWeaponRack: piece(weaponRackUrl, 1.59, [1.4, 0.4]),
  citadelShieldRack: piece(shieldRackUrl, 1.45, [1.4, 0.42]),
  citadelThroneBroken: piece(throneBrokenUrl, 1.1, [1.5659, 1.1149]),
  citadelArchFree: piece(archFreeUrl, 3.2304, [2.8, 0.4]),
  citadelBatteringRam: piece(batteringRamUrl, 1.24, [2.4, 1]),
  citadelChainAnchor: piece(chainAnchorUrl, 0.925, [1.292, 0.8202]),
  citadelFloorInset: piece(floorInsetUrl, 0.14, [2, 2]),
  citadelFloorRadial: piece(floorRadialUrl, 0.14, [2, 2]),
  citadelFloorSmall: piece(floorSmallUrl, 0.14, [1, 1]),
  citadelPillarBroken: piece(pillarBrokenUrl, 1.08, [1, 1]),
  citadelVictoryStandard: piece(victoryStandardUrl, 2.6, [1.15, 0.4]),
  citadelWallTall: piece(wallTallUrl, 1.8, [2, 0.5275]),
  citadelWallWindow: piece(wallWindowUrl, 2.3, [2, 0.5275]),
  citadelWatchtower: piece(watchtowerUrl, 2.97, [1.7, 1.7])
} as const
