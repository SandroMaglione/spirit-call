/**
 * The courtyard kit (`art/environment/courtyard/`, see its README): stone
 * paving, walls, pillars, and props, each one mesh with one vertex-colored
 * material. Sizes are copied from its `manifest.json` (meters, X × Z
 * footprints); do not edit them by hand. Unused pieces of the kit (corner
 * and end-cap walls, edge paving, currency tokens) are not registered yet.
 */
import type { ModelSpec } from "../models.ts"
import brazierUrl from "../../../art/environment/courtyard/models/brazier.glb?url"
import pavingCrackedUrl from "../../../art/environment/courtyard/models/paving-cracked.glb?url"
import pavingPlainUrl from "../../../art/environment/courtyard/models/paving-plain.glb?url"
import pillarLargeChippedUrl from "../../../art/environment/courtyard/models/pillar-large-chipped.glb?url"
import pillarLargeUrl from "../../../art/environment/courtyard/models/pillar-large.glb?url"
import pillarSmallChippedUrl from "../../../art/environment/courtyard/models/pillar-small-chipped.glb?url"
import pillarSmallUrl from "../../../art/environment/courtyard/models/pillar-small.glb?url"
import rocksLowUrl from "../../../art/environment/courtyard/models/rocks-low.glb?url"
import rocksTallUrl from "../../../art/environment/courtyard/models/rocks-tall.glb?url"
import rubbleStonesUrl from "../../../art/environment/courtyard/models/rubble-stones.glb?url"
import urnJadeUrl from "../../../art/environment/courtyard/models/urn-jade.glb?url"
import wallLowUrl from "../../../art/environment/courtyard/models/wall-low.glb?url"
import wallStraightUrl from "../../../art/environment/courtyard/models/wall-straight.glb?url"

const piece = (url: string, height: number, footprint: readonly [number, number]) => ({ url, height, footprint, clips: {} }) as const satisfies ModelSpec

export const courtyardModels = {
  /** 2 m modules, origin at the top center (the walking surface is y = 0). */
  pavingPlain: piece(pavingPlainUrl, 0.14, [2, 2]),
  pavingCracked: piece(pavingCrackedUrl, 0.14, [2, 2]),
  /** Wall runs extend along X. */
  wallStraight: piece(wallStraightUrl, 0.95, [2, 0.5]),
  /** A lower wall for the edges in front of the camera. */
  wallLow: piece(wallLowUrl, 0.38, [2, 0.5]),
  pillarLarge: piece(pillarLargeUrl, 1.899, [1, 1]),
  pillarLargeChipped: piece(pillarLargeChippedUrl, 1.899, [1, 1]),
  /** Exactly 5/7 of the large one's base: the arena's small pillars. */
  pillarSmall: piece(pillarSmallUrl, 1.48122, [5 / 7, 5 / 7]),
  pillarSmallChipped: piece(pillarSmallChippedUrl, 1.48122, [5 / 7, 5 / 7]),
  urnJade: piece(urnJadeUrl, 0.775, [0.769, 0.719]),
  /** Its flame belongs to the game, at 0.84 m over its center. */
  brazier: piece(brazierUrl, 0.92, [0.7, 0.7]),
  rocksLow: piece(rocksLowUrl, 0.3, [1.038, 0.639]),
  rocksTall: piece(rocksTallUrl, 0.73, [0.893, 0.787]),
  rubbleStones: piece(rubbleStonesUrl, 0.2, [0.944, 0.777])
} as const
