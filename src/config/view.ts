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
  /** Faint aim line beyond the chevron (0 alpha hides it). */
  aimLineLength: 240,
  aimLineAlpha: 0.22,
  reticle: 0xf7c948,
  hitFlash: 0xffffff,
  playerProjectile: 0xb8fff7,
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
    brute: { color: 0xc2413b, widthFactor: 1.8, heightFactor: 1.9 }
  },
  /** Enemy bodies pulse toward this color while winding up an attack. */
  windupTint: 0xfff1b8,
  telegraph: 0xff4d4d,
  telegraphLocked: 0xffd166,
  playerHurt: 0xff3b3b,
  /** Screen shake when the player is hit, in pixels, decaying over `shakeDecay` per second. */
  hurtShake: 10,
  shakeDecay: 12
}
