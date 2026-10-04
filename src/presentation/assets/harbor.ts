/**
 * The saltwind harbor kit (`art/environment/saltwind-harbor/`, see its README): the pieces the
 * harbor arena uses, each one mesh with one material. Sizes are copied from
 * its `manifest.json` (meters: height, then the X × Z footprint); do not
 * edit them by hand. Floor pieces have their origin at the top center; the
 * rest stand on the ground.
 */
import type { ModelSpec } from "../models.ts"
import anchorUrl from "../../../art/environment/saltwind-harbor/models/anchor.glb?url"
import barrelStackUrl from "../../../art/environment/saltwind-harbor/models/barrel-stack.glb?url"
import boatHullUrl from "../../../art/environment/saltwind-harbor/models/boat-hull.glb?url"
import bollardUrl from "../../../art/environment/saltwind-harbor/models/bollard.glb?url"
import buoyUrl from "../../../art/environment/saltwind-harbor/models/buoy.glb?url"
import capstanUrl from "../../../art/environment/saltwind-harbor/models/capstan.glb?url"
import cargoPalletUrl from "../../../art/environment/saltwind-harbor/models/cargo-pallet.glb?url"
import fishCrateUrl from "../../../art/environment/saltwind-harbor/models/fish-crate.glb?url"
import floorCrackedUrl from "../../../art/environment/saltwind-harbor/models/floor-cracked.glb?url"
import floorPlainUrl from "../../../art/environment/saltwind-harbor/models/floor-plain.glb?url"
import floorWornUrl from "../../../art/environment/saltwind-harbor/models/floor-worn.glb?url"
import jettyPostUrl from "../../../art/environment/saltwind-harbor/models/jetty-post.glb?url"
import lanternHookUrl from "../../../art/environment/saltwind-harbor/models/lantern-hook.glb?url"
import lifeRingUrl from "../../../art/environment/saltwind-harbor/models/life-ring.glb?url"
import netRackUrl from "../../../art/environment/saltwind-harbor/models/net-rack.glb?url"
import pillarLargeUrl from "../../../art/environment/saltwind-harbor/models/pillar-large.glb?url"
import pillarSmallUrl from "../../../art/environment/saltwind-harbor/models/pillar-small.glb?url"
import wallLowUrl from "../../../art/environment/saltwind-harbor/models/wall-low.glb?url"
import wallStraightUrl from "../../../art/environment/saltwind-harbor/models/wall-straight.glb?url"
import waveRockUrl from "../../../art/environment/saltwind-harbor/models/wave-rock.glb?url"
import floorInsetUrl from "../../../art/environment/saltwind-harbor/models/floor-inset.glb?url"
import floorSmallUrl from "../../../art/environment/saltwind-harbor/models/floor-small.glb?url"
import floorRadialUrl from "../../../art/environment/saltwind-harbor/models/floor-radial.glb?url"
import floorDeckUrl from "../../../art/environment/saltwind-harbor/models/floor-deck.glb?url"

const piece = (url: string, height: number, footprint: readonly [number, number]) => ({ url, height, footprint, clips: {} }) as const satisfies ModelSpec

export const harborModels = {
  harborFloorPlain: piece(floorPlainUrl, 0.14, [2, 2]),
  harborFloorWorn: piece(floorWornUrl, 0.14, [2, 2]),
  harborFloorCracked: piece(floorCrackedUrl, 0.14, [2, 2]),
  harborWallStraight: piece(wallStraightUrl, 0.95, [2, 0.5575]),
  harborWallLow: piece(wallLowUrl, 0.38, [2, 0.5375]),
  harborPillarLarge: piece(pillarLargeUrl, 1.9, [1, 1]),
  harborPillarSmall: piece(pillarSmallUrl, 1.45, [0.72, 0.72]),
  harborAnchor: piece(anchorUrl, 1.6828, [1.2787, 0.18]),
  harborBarrelStack: piece(barrelStackUrl, 1.69, [1.54, 0.92]),
  harborBollard: piece(bollardUrl, 0.62, [0.5, 0.5]),
  harborBuoy: piece(buoyUrl, 1.005, [0.84, 0.7989]),
  harborCapstan: piece(capstanUrl, 0.9, [1.5, 1.5]),
  harborCargoPallet: piece(cargoPalletUrl, 0.9, [1.47, 1]),
  harborFishCrate: piece(fishCrateUrl, 0.35, [1.1, 0.65]),
  harborJettyPost: piece(jettyPostUrl, 1.47, [0.5, 0.5]),
  harborLanternHook: piece(lanternHookUrl, 1.745, [0.93, 0.56]),
  harborLifeRing: piece(lifeRingUrl, 0.185, [1.03, 1.02]),
  harborNetRack: piece(netRackUrl, 1.66, [1.7, 0.13]),
  harborWaveRock: piece(waveRockUrl, 0.6, [1.4698, 1.036]),
  harborBoatHull: piece(boatHullUrl, 0.55, [3.1, 1.2]),
  harborFloorInset: piece(floorInsetUrl, 0.14, [2, 2]),
  harborFloorSmall: piece(floorSmallUrl, 0.14, [1, 1]),
  harborFloorRadial: piece(floorRadialUrl, 0.14, [2, 2]),
  harborFloorDeck: piece(floorDeckUrl, 0.3, [2, 2])
} as const
