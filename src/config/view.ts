/**
 * Presentation constants: projection, sizes, and colors. Gameplay numbers
 * live in `tuning.ts`; the projection is also used to turn screen input
 * (movement keys, the cursor) into world directions.
 */
import type { Projection } from "../math/iso.ts"

export const projection: Projection = {
  squash: 0.5,
  zoom: 1
}

export const view = {
  /**
   * Small screens (phones) zoom out to show more of the arena: the zoom is the
   * screen's short side over `referenceShortSide`, clamped to [`minZoom`, 1].
   * Desktop windows are taller than the reference and keep zoom 1.
   */
  camera: { referenceShortSide: 760, minZoom: 0.45 },
  background: 0x0d1117,
  floor: 0x1b222c,
  floorGrid: 0x2a3441,
  floorGridSpacing: 100,
  /** Height of back walls and pillars, in screen pixels before zoom. */
  wallHeight: 64,
  /** Front walls are drawn low and translucent so they never hide the player. */
  frontWallHeight: 12,
  wallTop: 0x3a4658,
  wallSideLight: 0x2c3645,
  wallSideDark: 0x222a36,
  /** Pillars standing in front of the player are drawn this transparent. */
  occluderAlpha: 0.35,
  player: 0x4ecdc4,
  playerDashing: 0xd9fffb,
  shadow: 0x000000,
  /** Body height of actors relative to their radius. */
  bodyHeightFactor: 2.4,
  aim: 0x4ecdc4,
  reticle: 0xf7c948,
  hitFlash: 0xffffff,
  playerProjectile: 0xb8fff7,
  /** Player skill areas (grenade blast, ultimate). */
  playerArea: 0x4ecdc4,
  ultimate: 0xffd166,
  /** Faint ring at the ultimate's radius while it is ready. */
  ultimateReadyAlpha: 0.22,
  ultimateShake: 12,
  grenade: 0xd9fffb,
  /** Peak height of a grenade's arc, in screen pixels. */
  grenadeArc: 70,
  explosionShake: 5,
  enemyProjectile: 0xff6b6b,
  /** Projectiles fly this high above their ground shadow. */
  projectileHeight: 18,
  /** Projectile orb size relative to its collision radius. */
  projectileGlow: 1.6,
  wallSpark: 0x9fb3c8,
  spawnWarning: 0xf7a948,
  healthBack: 0x0d1117,
  healthFill: 0xff5d6c,
  damageNumber: 0xffe08a,
  enemies: {
    dummy: { color: 0xb86b77, widthFactor: 1.7, heightFactor: 2.1 },
    chaser: { color: 0xff7a45, widthFactor: 1.4, heightFactor: 2.2 },
    shooter: { color: 0xb07cff, widthFactor: 1.5, heightFactor: 1.8 },
    brute: { color: 0xc2413b, widthFactor: 1.8, heightFactor: 1.9 },
    swarmer: { color: 0xffb347, widthFactor: 1.5, heightFactor: 1.5 },
    charger: { color: 0xe0527a, widthFactor: 1.7, heightFactor: 1.7 },
    sniper: { color: 0x7cc4ff, widthFactor: 1.2, heightFactor: 2.6 },
    guardian: { color: 0x8fa3b8, widthFactor: 1.8, heightFactor: 2.0 }
  },
  /** Guardian shields. */
  shield: 0xd6e4f0,
  shieldBlock: 0xffffff,
  /** Enemy bodies pulse toward this color while winding up an attack. */
  windupTint: 0xfff1b8,
  telegraph: 0xff4d4d,
  telegraphLocked: 0xffd166,
  playerHurt: 0xff3b3b,
  /** Screen shake when the player is hit, in pixels, decaying over `shakeDecay` per second. */
  hurtShake: 10,
  shakeDecay: 12
}

/** The camera zoom for a screen size (see `view.camera`). */
export const viewZoom = (screen: { readonly width: number; readonly height: number }): number =>
  Math.min(1, Math.max(view.camera.minZoom, Math.min(screen.width, screen.height) / view.camera.referenceShortSide))
