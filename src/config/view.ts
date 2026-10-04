/**
 * Presentation constants: projection, sizes, and colors. Gameplay numbers
 * live in `tuning.ts`; the projection is also used to turn screen input
 * (movement keys, the cursor) into world directions.
 */
import type { CharacterId } from "../content/characters.ts"
import type { Projection } from "../math/iso.ts"

export const projection: Projection = {
  squash: 0.5,
  zoom: 1
}

export const view = {
  /**
   * Small screens (phones) zoom out a little to show more of the arena: the
   * zoom is the screen's short side over `referenceShortSide`, clamped to
   * [`minZoom`, 1]. A landscape phone (390 px) is at 0.8: close enough that
   * the characters read well, far enough to see what is coming. Desktop
   * windows are taller than the reference and keep zoom 1. Everything is
   * then drawn `magnify` times larger (the spirits read better closer).
   */
  camera: { referenceShortSide: 490, minZoom: 0.45, magnify: 1.25 },
  /**
   * The slash area shows while an enemy is in attack-assist range or a slash
   * recharges, fades in over `fadeInSeconds`, and after `lingerSeconds`
   * without either fades out over `fadeOutSeconds`.
   */
  slashCue: { fadeInSeconds: 0.12, lingerSeconds: 0.6, fadeOutSeconds: 0.4 },
  /**
   * The facing ring around the player: at a melee attack's reach (with
   * projectiles, `gap` beyond the body), with an arrow of length `arrow` on it.
   */
  facingRing: { gap: 20, alpha: 0.2, arrow: 12, arrowAlpha: 0.75 },
  /**
   * Slash trails (see presentation/trails.ts), drawn `height` screen pixels
   * above the floor. Arcs sweep over `sweepSeconds` then fade over
   * `fadeSeconds`; the finisher's spin and the thrust have their own timing.
   */
  /**
   * Charging a power attack: its area on the floor fills up with the charge
   * (like an enemy telegraph), a ring fills around the feet, and the body
   * glows (`glow` of the way to `full`), pulsing `pulseHz` times a second once
   * full. A shot's area is a lane `shotPreview` long.
   */
  charge: { gap: 12, width: 4, fullWidth: 6, filling: 0x7fe6de, full: 0xfff4d6, glow: 0.55, pulseHz: 6, shotPreview: 420 },
  /** A magazine's rounds: segments on an arc `spread` radians wide in front of her feet, `gap` out from her body. */
  ammo: { gap: 20, width: 4, spread: 2.1, space: 0.06, round: 0xffd166, empty: 0x3b4655, reloading: 0x7fe6de },
  slashTrail: {
    height: 22,
    core: 0xf2fffd,
    edge: 0x7fe6de,
    alpha: 0.55,
    sweepSeconds: 0.075,
    fadeSeconds: 0.16,
    spinSweepSeconds: 0.14,
    spinFadeSeconds: 0.2,
    thrustSeconds: 0.05
  },
  /**
   * Landing a blow. Every hit shakes the screen a little (`shake`, more for
   * `heavyShake`/`killShake`) and flashes and throws sparks along the push;
   * heavy blows also kick the camera along the blow (`kick` pixels) and
   * punch the zoom in by `zoomPunch`. Hit enemies squash, lean away, and
   * shift back (`recoil`), and kick up dust while sliding faster than
   * `dustSpeed` (world units per second).
   */
  impact: {
    shake: 2.5,
    heavyShake: 7,
    killShake: 4,
    kick: 10,
    kickDecay: 16,
    zoomPunch: 0.045,
    punchDecay: 9,
    /** Impact height above the target's feet, in screen pixels before zoom. */
    height: 20,
    spark: 0xfff4d6,
    recoil: { seconds: 0.16, heavySeconds: 0.26, squash: 0.22, lean: 0.2, shift: 7 },
    dustSpeed: 220,
    dust: 0x8a94a3,
    heavyNumber: 0xffb347
  },
  background: 0x0d1117,
  floor: 0x1b222c,
  floorGrid: 0x2a3441,
  floorGridSpacing: 100,
  /** Height of back walls and pillars, in screen pixels before zoom. */
  wallHeight: 64,
  /** Front walls are drawn low and translucent so they never hide the player. */
  frontWallHeight: 12,
  /** Walls and pillars: their top shows this color; their sides are shaded by the light. */
  wall: 0x3a4658,
  /** Pillars standing in front of the player are drawn this transparent. */
  occluderAlpha: 0.35,
  /**
   * Light on the 3D scene: light from the sky (`sky` from above, `ground`
   * from below, blended by which way a face points) and the sun from the
   * north-east (`sun` points toward it). A face lying flat shows exactly its
   * own color (sky and sun add up to 1 on it); east faces are dimmer, south
   * faces darker still.
   */
  light: { sky: 0xffffff, ground: 0x8c8c8c, skyIntensity: 0.62, sun: { x: 0.6, y: 1.6, z: -0.3 }, sunIntensity: 0.41 },
  player: 0x4ecdc4,
  /** Each character's body color, so a switch is seen at once (and her switch button matches). */
  characters: { swordsman: 0x4ecdc4, gunner: 0xa8e05f, tidecaller: 0x4a7dff, stormcaller: 0xffd84a } satisfies Record<CharacterId, number>,
  playerDashing: 0xd9fffb,
  shadow: 0x000000,
  /** Body height of actors relative to their radius. */
  bodyHeightFactor: 2.4,
  aim: 0x4ecdc4,
  reticle: 0xf7c948,
  hitFlash: 0xffffff,
  playerProjectile: 0xb8fff7,
  /** Player skill areas (lobbed blasts, novas). */
  playerArea: 0x4ecdc4,
  ultimate: 0xffd166,
  /** Whirls (the Cyclone): arms spiraling in, turning this fast. */
  vortex: { arms: 3, turnsPerSecond: 1.6 },
  /**
   * Totems (the Spark Totem): a pylon `height` pixels tall with a glowing
   * orb on top, its reach on the floor tinted `heal`, the color of its
   * healing zaps.
   */
  totem: { height: 46, radius: 8, orb: 9, heal: 0x7ee08a },
  /** Faint ring at a nova's radius while it is ready. */
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
  /**
   * Bolts (shots, enemy bullets): a hot core inside their colored orb, a
   * see-through halo (`glowOpacity`), and a tracer streaking behind them
   * along their flight (a bright streak in a fainter trail), as long as the
   * distance they cover in `streakSeconds` (between `minStreak` and
   * `maxStreak` times their radius). Sizes are relative to their radius.
   */
  bolt: { core: 0.6, coreWhite: 0.8, orb: 1, halo: 1.8, streak: 0.42, streakWhite: 0.45, trail: 0.85, glowOpacity: 0.4, streakSeconds: 0.05, minStreak: 2, maxStreak: 9 },
  wallSpark: 0x9fb3c8,
  spawnWarning: 0xf7a948,
  /** Breaking enemies: the bar under their health, and how a broken one glows (and its burst, see `effects.ts`). */
  /**
   * A character coming in after a fall: a column of light rising where she
   * stands (`beam` streaks), two rings, a white flash, a shake, and her
   * name in the banner; then a ring of her color around her feet while she
   * is protected, pulsing at `pulseHz`.
   */
  fallEntry: { beam: 26, ring: 150, flash: 120, shake: 8, pulseHz: 3 },
  /** A perfect dodge's flash, ring, and streaks. */
  perfectDodge: { color: 0xc8fff9, flash: 140, ring: 180, shake: 7 },
  breaking: { bar: 0xffc857, full: 0xfff4d6, glow: 0xffc857, pulseHz: 5, ring: 90, flash: 70, shake: 9 },
  healthBack: 0x0d1117,
  healthFill: 0xff5d6c,
  damageNumber: 0xffe08a,
  /** Health restored by a passive (Bloodthirst). */
  healNumber: 0x7ee08a,
  /**
   * A killed enemy bursts apart: chunks in its color (more for wider
   * bodies), a white flash at its heart, a ring, and a little shake.
   */
  death: { chunks: 22, speed: 460, size: 7, life: 0.75, flash: 46, ring: 34, shake: 3 },
  enemies: {
    dummy: { color: 0xb86b77, widthFactor: 1.7, heightFactor: 2.1 },
    chaser: { color: 0xff7a45, widthFactor: 1.4, heightFactor: 2.2 },
    shooter: { color: 0x7b96c8, widthFactor: 1.5, heightFactor: 1.8 },
    brute: { color: 0x8b8078, widthFactor: 1.8, heightFactor: 1.9 },
    swarmer: { color: 0xb74943, widthFactor: 1.5, heightFactor: 1.5 },
    charger: { color: 0xe0527a, widthFactor: 1.7, heightFactor: 1.7 },
    sniper: { color: 0x7cc4ff, widthFactor: 1.2, heightFactor: 2.6 },
    guardian: { color: 0x8fa3b8, widthFactor: 1.8, heightFactor: 2.0 },
    warden: { color: 0x5fe0d0, widthFactor: 1.4, heightFactor: 2.3 },
    stalker: { color: 0x6b5cff, widthFactor: 1.5, heightFactor: 2.2 },
    volatile: { color: 0xffa020, widthFactor: 1.7, heightFactor: 1.6 },
    galeCaster: { color: 0xa8f0d8, widthFactor: 1.4, heightFactor: 2.4 },
    juggernaut: { color: 0x7d8794, widthFactor: 1.9, heightFactor: 2.0 },
    sparringDummy: { color: 0xd49a6a, widthFactor: 1.7, heightFactor: 2.1 },
    heavyDummy: { color: 0x9a7b5c, widthFactor: 1.9, heightFactor: 2.0 }
  },
  /**
   * Elements and states: each element's color (hits, pools, numbers); bodies
   * in a state are tinted `tint` of the way toward its color and shed motes
   * (embers rising, drops falling) about `motes` times a second.
   */
  elements: { fire: 0xff7b2e, water: 0x4aa8ff, wind: 0xc9fff1, thunder: 0xb48cff },
  states: { burning: 0xff7b2e, soaked: 0x4aa8ff, tint: 0.5, motes: 14 },
  /** Pools of elements on the floor: their fill and outline, a fire's hot core, and the fade as they run out. */
  pools: { fill: 0.24, outline: 0.55, fireCore: 0xffd166, fadeSeconds: 0.6, ash: 0x3a3330 },
  /**
   * Arena hazards as part of the floor (see `presentation/hazards.ts`): a
   * pool level with the floor's top (`level` world units over it), its flat
   * `surface` with a `band` along its edges and marks on it (one per
   * `markArea` square units: water's `streak`s of light, fire's hot `spot`s),
   * all in few flat tones; a fire trench put out shows its `ash` tones.
   */
  hazards: {
    level: 0.3,
    band: 7,
    markArea: 9000,
    streak: { length: 26, width: 4 },
    spot: 7,
    water: { surface: 0x2b86bf, band: 0x7fcbea, mark: 0xc6ecfb },
    fire: { surface: 0xe8561c, band: 0x7c2410, mark: 0xffc04a },
    ash: { surface: 0x4b4542, band: 0x2f2a28, mark: 0x625b57 }
  },
  /**
   * Thrown discs: drawn flat, `size` times their radius, `height` pixels over
   * the floor, with a spinning ring around them (out to where they hit while
   * they hover).
   */
  disc: { color: 0x9fe8ff, ring: 0x4aa8ff, turnsPerSecond: 3, size: 1, height: 8 },
  /** Flames in an arena's scenery (see `ArenaLook.fires`): their two colors, flame motes and embers per second each, and how near the camera (world units) one must be to burn. */
  arenaFires: { flame: 0xffc04a, ember: 0xff7a2e, flames: 14, embers: 2.5, reach: 1100 },
  /** The puff of water putting fire out. */
  steam: 0xe6edf3,
  /** A body slammed into a wall by wind, and stunned: its color, and the stars circling over its head. */
  stun: 0xffe066,
  stunStars: { radius: 12, turnsPerSecond: 1.2 },
  /** Guardian shields. */
  shield: 0xd6e4f0,
  /** A warder's tether and the ring under the ally it wards (see `features/wards.ts`). */
  ward: 0x7ff0e0,
  /** An armored enemy's plates, a ring under it until it breaks. */
  armor: 0xc9d3dd,
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
  view.camera.magnify * Math.min(1, Math.max(view.camera.minZoom, Math.min(screen.width, screen.height) / view.camera.referenceShortSide))
