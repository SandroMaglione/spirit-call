import type { ArenaId } from "../src/content/arena.ts"
import { Keyboard, Pointer, Touch } from "@typeonce/bevy-ts-browser"

import { keyBindings, touchButtons } from "../src/config/input.ts"
import type { Direction, TouchButton } from "../src/config/input.ts"
import { defaultTuning, engine } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { ShotMove } from "../src/content/attacks.ts"
import { cut, lob, vortex } from "../src/content/skills.ts"
import type { ChallengeId } from "../src/content/challenges.ts"
import type { EnemyKind } from "../src/content/enemies.ts"
import { damageDealt, damageTaken } from "../src/features/build.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { toScreen } from "../src/math/iso.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Aim, Dash, Enemy, Game, Invulnerable, Player, Position, RunScope, Velocity } from "../src/schema.ts"
import type { BuildValue } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"

export const PlayerState = Game.Inspector("Test/PlayerState", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        velocity: Game.Query.read(Velocity),
        aim: Game.Query.read(Aim),
        dash: Game.Query.read(Dash),
        invulnerable: Game.Query.read(Invulnerable)
      },
      with: [Player]
    })
  }
}, ({ queries }) => {
  const [player] = queries.player.each()
  if (player === undefined) throw new Error("no player")
  return {
    position: player.data.position.get(),
    velocity: player.data.velocity.get(),
    aim: player.data.aim.get(),
    dash: player.data.dash.get(),
    invulnerable: player.data.invulnerable.get().remaining
  }
})

/**
 * A double tap of a movement key, which dashes: taps on `frame` and
 * `frame + 2`, so the dash starts on step `frame + 3`. With `hold` the key
 * stays down from the second tap (dashing while moving); otherwise both taps
 * are instant, the player does not move, and the dash goes toward the cursor.
 */
export const doubleTap = (direction: Direction, frame: number, options: { readonly hold?: boolean } = {}): Keyboard.Timeline<typeof keyBindings> =>
  options.hold === true
    ? [{ frame, press: [direction] }, { frame: frame + 1, release: [direction] }, { frame: frame + 2, press: [direction] }]
    : [{ frame, press: [direction], release: [direction] }, { frame: frame + 2, press: [direction], release: [direction] }]

/** The gun's opening shot: what a single press fires. */
export const gunShot = defaultTuning.attacks.gun.combo[0] as ShotMove

/**
 * A cut of wind (what the Swordsman's special was before it became the
 * Gale): a lane toward the aim that drives what it hits back in a glide.
 * No shipped skill is a cut now; tests of cuts use this one.
 */
export const windCut = cut({ length: 320, width: 120, power: 34, element: "wind", knockback: 900, active: 0.12, hitStop: 0.06, heavy: true, leaves: null })

/** `tuning` with the Swordsman's special swapped for `windCut`. */
export const withWindCut = (tuning: Tuning = defaultTuning): Tuning =>
  // The content types each skill by its effect; a test swaps one kind for another.
  ({ ...tuning, skills: { ...tuning.skills, bladeWave: { ...tuning.skills.bladeWave, name: "Wind Cut", effect: windCut } } }) as unknown as Tuning

/**
 * The Gale (the Swordsman's special before it became the Gust): a whirl at
 * her feet pulling enemies in. The Cyclone, her ultimate, is one too;
 * tests of whirls at her feet use this one on Space.
 */
export const gale = vortex({ maxRange: 0, radius: 270, seconds: 2.4, tick: 0.4, pull: 0.3, power: 3, element: "wind", knockback: 0, hitStop: 0, heavy: false })

/** `tuning` with the Swordsman's special swapped for `gale`. */
export const withGale = (tuning: Tuning = defaultTuning): Tuning =>
  ({ ...tuning, skills: { ...tuning.skills, bladeWave: { ...tuning.skills.bladeWave, name: "Gale", effect: gale } } }) as unknown as Tuning

/** The Grenade (the Gunner's special before the Flare Jump): lobbed to the cursor, bursting in fire and leaving a fire pool. */
export const grenadeSkill = {
  name: "Grenade",
  label: "GRENADE",
  cooldown: 2.5,
  energy: 0,
  invulnerability: 0,
  effect: lob({ maxRange: 360, flightTime: 0.35, fuse: 0.45, radius: 95, power: 38, element: "fire", knockback: 380, hitStop: 0, heavy: false, leaves: { element: "fire", radius: 80, seconds: 3 } })
} as const

/** The Splash (the Tidecaller's special before the Tidal Wave): water lobbed to the cursor, soaking and leaving a puddle. */
export const splashSkill = {
  name: "Splash",
  label: "SPLASH",
  cooldown: 2.5,
  energy: 0,
  invulnerability: 0,
  effect: lob({ maxRange: 340, flightTime: 0.25, fuse: 0.08, radius: 100, power: 24, element: "water", knockback: 260, hitStop: 0, heavy: false, leaves: { element: "water", radius: 115, seconds: 5 } })
} as const

/**
 * `tuning` with the Gunner's and the Tidecaller's specials swapped back for
 * the Grenade and the Splash: tests of lobbed skills, elements, and touch
 * throws were written with those on Space (see `StartOptions.kits`).
 */
export const withLobbedSpecials = (tuning: Tuning = defaultTuning): Tuning => {
  // Only the shipped ones are swapped: a test that set its own lob keeps it.
  const skills = tuning.skills as Record<string, { readonly effect: { readonly kind: string } }>
  return ({
    ...tuning,
    skills: {
      ...tuning.skills,
      flareJump: skills.flareJump!.effect.kind === "leap" ? grenadeSkill : skills.flareJump,
      tidalWave: skills.tidalWave!.effect.kind === "cut" ? splashSkill : skills.tidalWave
    }
  }) as unknown as Tuning
}

/** `tuning` (with the lobbed specials) whose Grenade is changed by `patch`. */
export const withGrenade = (patch: Partial<typeof grenadeSkill.effect>, tuning: Tuning = defaultTuning): Tuning =>
  ({ ...tuning, skills: { ...tuning.skills, flareJump: { ...grenadeSkill, effect: { ...grenadeSkill.effect, ...patch } } } }) as unknown as Tuning

/** The gunner: the gun, the grenade as her special, and the Barrage as her ultimate. */
export const gunner: BuildValue = { character: "gunner" }

/** The Tidecaller: the disc, the Splash as her special, and the Tide as her ultimate. */
export const tidecaller: BuildValue = { character: "tidecaller" }

/** The swordsman's stats: the default player's. */
export const swordsman = defaultTuning.characters.swordsman.stats

/** What the default player loses to an enemy attack of `power` (enemies' ATK and the swordsman's DEF applied). */
export const playerLoss = (tuning: Tuning, kind: EnemyKind, power: number): number =>
  damageTaken(tuning, damageDealt(tuning.enemies[kind].atk, power), tuning.characters.swordsman.stats.def)

/** The gun with `shot` overriding its opening shot, for tests about shooting (with `gunner`). */
export const withGun = (tuning: Tuning, shot: Partial<Omit<ShotMove, "shape">> = {}): Tuning => {
  const gun = tuning.attacks.gun
  const [first, ...rest] = gun.combo
  return { ...tuning, attacks: { ...tuning.attacks, gun: { ...gun, combo: [{ ...(first as ShotMove), ...shot }, ...rest] } } }
}

const withWaves = (tuning: Tuning, enabled: boolean): Tuning => ({ ...tuning, waves: { ...tuning.waves, enabled } })

/** Every challenge fought in `arena` (tests stand in the open courtyard unless they name another). */
export const inArena = (tuning: Tuning, arena: ArenaId): Tuning => ({
  ...tuning,
  challenges: Object.fromEntries(Object.entries(tuning.challenges).map(([id, challenge]) => [id, { ...challenge, arena }])) as Tuning["challenges"]
})

export interface StartOptions {
  readonly keys?: Keyboard.Timeline<typeof keyBindings>
  readonly pointer?: Pointer.Timeline
  readonly touch?: Touch.Timeline<TouchButton>
  readonly tuning?: Tuning
  /** Who enters the arena. Defaults to the swordsman. */
  readonly build?: BuildValue
  /** A whole team instead (`build` is ignored). */
  readonly team?: ReadonlyArray<BuildValue>
  /** What they face (with `waves`). Defaults to the default challenge. */
  readonly challenge?: ChallengeId
  /** Start on the menu instead of playing. */
  readonly flow?: "Menu" | "Playing"
  /** Run waves instead of training dummies. Defaults to false. */
  readonly waves?: boolean
  /** The arena every challenge is fought in. Defaults to the courtyard (no hazards). */
  readonly arena?: ArenaId
  /** The specials as shipped; by default the Gunner and the Tidecaller lob the Grenade and the Splash (see `withLobbedSpecials`). */
  readonly kits?: "shipped" | "lobbed"
}

/** A headless run after setup. Timeline frame `n` is read by fixed step `n + 1`. */
export const start = (options: StartOptions = {}) => {
  const sim = createSimulation({
    keyboard: Keyboard.scripted(keyBindings, options.keys ?? []),
    pointer: Pointer.scripted(options.pointer ?? [], { x: 640 + 200, y: 360 }),
    touch: Touch.scripted(touchButtons, options.touch ?? []),
    tuning: inArena(withWaves(options.kits === "shipped" ? options.tuning ?? defaultTuning : withLobbedSpecials(options.tuning ?? defaultTuning), options.waves ?? false), options.arena ?? "courtyard"),
    ...(options.build === undefined ? {} : { build: options.build }),
    ...(options.team === undefined ? {} : { team: options.team }),
    ...(options.challenge === undefined ? {} : { challenge: options.challenge }),
    ...(options.flow === undefined ? {} : { flow: options.flow })
  })
  const setup = sim.runtime.tick(sim.setup)
  if (!setup.ok) throw new Error("setup failed")
  const step = (count = 1) => {
    for (let index = 0; index < count; index++) {
      const result = sim.runtime.tick(sim.fixedUpdate)
      if (!result.ok) throw new Error("step failed")
    }
  }
  return { ...sim, step, player: () => sim.runtime.inspect(PlayerState) }
}

/** Despawns every enemy (training dummies included). */
export const ClearEnemies = Game.System("Test/ClearEnemies", {
  queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) }
}, ({ queries, commands }) => {
  for (const { entity } of queries.enemies.each()) commands.despawn(entity.id)
})

/** The center of the default arena, where the player spawns. */
export const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }

/** Fixed steps covering `seconds` (rounded up). */
export const steps = (seconds: number): number => Math.ceil(seconds / engine.stepSeconds)

/** The cursor (screen) pointing at a world offset from the player at spawn, in the default viewport. */
export const cursorAt = (offset: Vec2): Vec2 => {
  const screen = toScreen(projection, offset)
  return { x: 640 + screen.x, y: 360 + screen.y }
}

/** A schedule that replaces every enemy with training dummies (of `tuning`) at offsets from the player's spawn. */
export const placeDummies = (offsets: ReadonlyArray<Vec2>, tuning: Tuning = defaultTuning) => {
  const Spawn = Game.System("Test/SpawnDummies", {}, ({ commands }) => {
    for (const offset of offsets) commands.spawnIn(RunScope, makeEnemy(tuning, "dummy", { x: center.x + offset.x, y: center.y + offset.y }))
  })
  return Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred())
}
