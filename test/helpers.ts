import type { Vec2 } from "@typeonce/ritmo-math/Vec2"
import type { ArenaId } from "../src/content/arena.ts"
import { Gamepad, Keyboard, Pointer, Touch } from "@typeonce/ritmo-browser"

import { keyBindings, padBindings, scriptedPartyTaps, touchButtons } from "../src/config/input.ts"
import type { Direction, PartyTap, TouchButton } from "../src/config/input.ts"
import { defaultTuning, engine } from "../src/config/tuning.ts"
import { projection, viewZoom } from "../src/config/view.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { BasicAttackSpec, ShotMove } from "../src/content/attacks.ts"
import type { AspectId, AspectSpec } from "../src/content/aspects.ts"
import type { ClassId } from "../src/content/classes.ts"
import type { CharacterId } from "../src/content/characters.ts"
import type { ElementId } from "../src/content/elements.ts"
import type { Passive } from "../src/content/passives.ts"
import type { RelicId, RelicSlot, RelicSpec } from "../src/content/relics.ts"
import { cut, lob, vortex, barrage } from "../src/content/skills.ts"
import type { ChallengeId } from "../src/content/challenges.ts"
import type { EnemyKind } from "../src/content/enemies.ts"
import { attackOf, damageDealt, damageTaken } from "../src/features/build.ts"
import { EnemyOptionalParts, makeEnemy } from "../src/features/enemies.ts"
import { toScreen } from "../src/math/iso.ts"
import { Aim, Dash, Enemy, Flow, Game, Invulnerable, Player, Position, RunScope, Velocity } from "../src/schema.ts"
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
/** A class's plain basic attack (its handling and moves together), as a character of it fights with no aspect equipped. */
export const plainAttack = (tuning: Tuning, cls: ClassId): BasicAttackSpec => attackOf(tuning, { class: cls, aspect: null })

/** `tuning` with one more aspect, `id`: tests of aspects use made-up ones, so they hold whatever ships. */
export const withAspect = (tuning: Tuning, id: string, spec: AspectSpec): Tuning =>
  ({ ...tuning, aspects: { ...tuning.aspects, [id]: spec } })

/** `id` as an aspect's id (one added by `withAspect`). */
export const aspectId = (id: string): AspectId => id as AspectId

/** A made-up aspect of `cls`: its plain aspect's moves, with `extra` over them. */
export const testAspect = (tuning: Tuning, cls: ClassId, extra: Partial<AspectSpec> = {}): AspectSpec =>
  ({ ...tuning.classes[cls].plain, name: "Test", description: "A test aspect.", against: "Tests.", class: cls, effects: [], infuse: null, ...extra })

/** `tuning` with one more relic, `id`: tests of relics use made-up ones, so they hold whatever ships. */
export const withRelic = (tuning: Tuning, id: string, spec: RelicSpec): Tuning =>
  ({ ...tuning, relics: { ...tuning.relics, [id]: spec } })

/** `id` as a relic's id (one added by `withRelic`). */
export const relicId = (id: string): RelicId => id as RelicId

/** A made-up relic of `slot` (`element`: an Element relic's) doing `passives` at every tier. */
export const testRelic = (passives: ReadonlyArray<Passive>, slot: RelicSlot = "strike", element: ElementId | null = null): RelicSpec => {
  const tier = { adds: "Test.", passives }
  return { name: "Test", slot, element, about: "Tests.", tiers: { 1: tier, 2: tier, 3: tier } }
}

export const gunShot = defaultTuning.classes.gun.plain.combo[0] as ShotMove

/**
 * A cut of wind (what the Swordsman's special was before it became the
 * Gale): a lane toward the aim that drives what it hits back in a glide.
 * No shipped skill is a cut now; tests of cuts use this one.
 */
export const windCut = cut({ length: 320, width: 120, power: 34, element: "wind", knockback: 900, active: 0.12, hitStop: 0.06, heavy: true, leaves: null })

/** `tuning` with the Swordsman's special swapped for `windCut`. */
export const withWindCut = (tuning: Tuning = defaultTuning): Tuning =>
  // The content types each skill by its effect; a test swaps one kind for another.
  ({ ...tuning, skills: { ...tuning.skills, bladeWave: { ...tuning.skills.bladeWave, name: "Wind Cut", effect: windCut } } })

/** The Barrage (the Gunner's ultimate before the Overdrive): fire shells lobbed one after the other around the cursor. */
export const volley = barrage({ maxRange: 380, shells: 7, spread: 110, interval: 0.08, flightTime: 0.45, fuse: 0.15, radius: 70, power: 45, element: "fire", knockback: 260, hitStop: 0, heavy: false, leaves: { element: "fire", radius: 55, seconds: 3 } })

/** `tuning` with the Gunner's ultimate swapped for `volley`. */
export const withVolley = (tuning: Tuning = defaultTuning): Tuning =>
  ({ ...tuning, skills: { ...tuning.skills, barrage: { ...tuning.skills.barrage, name: "Barrage", effect: volley } } })

/**
 * The Gale (the Swordsman's special before it became the Gust): a whirl at
 * her feet pulling enemies in. The Cyclone, her ultimate, is one too;
 * tests of whirls at her feet use this one on Space.
 */
export const gale = vortex({ maxRange: 0, radius: 270, seconds: 2.4, tick: 0.4, pull: 0.3, power: 3, element: "wind", knockback: 0, hitStop: 0, heavy: false })

/** `tuning` with the Swordsman's special swapped for `gale`. */
export const withGale = (tuning: Tuning = defaultTuning): Tuning =>
  ({ ...tuning, skills: { ...tuning.skills, bladeWave: { ...tuning.skills.bladeWave, name: "Gale", effect: gale } } })

/** The Grenade (the Gunner's special before the Flare Jump): lobbed to the cursor, bursting in fire and leaving a fire pool. */
export const grenadeSkill = {
  name: "Grenade",
  label: "GRENADE",
  cooldown: 2.5,
  energy: 0,
  invulnerability: 0,
  effect: lob({ maxRange: 360, flightTime: 0.35, fuse: 0.45, radius: 95, power: 38, element: "fire", knockback: 380, hitStop: 0, heavy: false, leaves: { element: "fire", radius: 80, seconds: 3 } })
} as const

/** The Splash (the Tidecaller's special before the Tidal Wave and the Tidefall): water lobbed to the cursor, soaking and leaving a puddle. */
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
  return {
    ...tuning,
    skills: {
      ...tuning.skills,
      flareJump: tuning.skills.flareJump.effect.kind === "leap" ? grenadeSkill : tuning.skills.flareJump,
      tidalWave: tuning.skills.tidalWave.effect.kind === "plunge" ? splashSkill : tuning.skills.tidalWave
    }
  }
}

/** `tuning` (with the lobbed specials) whose Grenade is changed by `patch`. */
export const withGrenade = (patch: Partial<typeof grenadeSkill.effect>, tuning: Tuning = defaultTuning): Tuning =>
  ({ ...tuning, skills: { ...tuning.skills, flareJump: { ...grenadeSkill, effect: { ...grenadeSkill.effect, ...patch } } } })

/** The gunner: the gun, the grenade as her special, and the Barrage as her ultimate. */
export const gunner: BuildValue = { character: "gunner" }

/** The Tidecaller: the disc, the Splash as her special, and the Tide as her ultimate. */
export const tidecaller: BuildValue = { character: "tidecaller" }

/** The swordsman's stats: the default player's. */
export const swordsman = defaultTuning.characters.swordsman.stats

/** What the default player loses to an enemy attack of `power` (enemies' ATK and the swordsman's DEF applied). */
export const playerLoss = (tuning: Tuning, kind: EnemyKind, power: number): number =>
  damageTaken(tuning, damageDealt(tuning.enemies[kind].atk, power), tuning.characters.swordsman.stats.def)

/** The gun's plain aspect with `shot` overriding its opening shot, for tests about shooting (with `gunner`). */
export const withGun = (tuning: Tuning, shot: Partial<Omit<ShotMove, "shape">> = {}): Tuning => {
  const gun = tuning.classes.gun
  const [first, ...rest] = gun.plain.combo
  return { ...tuning, classes: { ...tuning.classes, gun: { ...gun, plain: { ...gun.plain, combo: [{ ...(first as ShotMove), ...shot }, ...rest] } } } }
}

const withWaves = (tuning: Tuning, enabled: boolean): Tuning => ({ ...tuning, waves: { ...tuning.waves, enabled } })

/** Every challenge fought in `arena` (tests stand in the open courtyard unless they name another). */
export const inArena = (tuning: Tuning, arena: ArenaId): Tuning => ({
  ...tuning,
  challenges: Object.fromEntries(Object.entries(tuning.challenges).map(([id, challenge]) => [id, { ...challenge, arena }])) as Tuning["challenges"]
})

export interface StartOptions {
  /** What the controls start as (see `SimulationOptions.device`). */
  readonly device?: "desktop" | "touch"
  readonly keys?: Keyboard.Timeline<typeof keyBindings>
  readonly pointer?: Pointer.Timeline
  readonly touch?: Touch.Timeline<TouchButton>
  /** A gamepad's timeline (buttons by the standard mapping, the sticks). */
  readonly pad?: Gamepad.Timeline
  /** Taps on the party list. */
  readonly party?: ReadonlyArray<PartyTap & { readonly frame: number }>
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
  /** Enemies as tough as shipped (see `progression.enemies`); by default their kind's own health and ATK, so a mechanic's test counts its kind's numbers. */
  readonly toughness?: boolean
  /** Ultimates with their moment (the world standing still before they go off, see `UltimateMoment`); by default they go off at once, so tests of what they do need not wait it out. */
  readonly moments?: boolean
}

/** `tuning` whose ultimates go off at once, with no moment first. */
export const withoutMoments = (tuning: Tuning): Tuning => ({ ...tuning, ultimate: { ...tuning.ultimate, moment: 0 } })

/**
 * `tuning` whose enemies have their kind's own health, ATK, and windups (no
 * `progression.enemies` toughness, no slower windups at the first levels),
 * so a mechanic's test counts its kind's numbers.
 */
export const plainEnemies = (tuning: Tuning): Tuning => ({
  ...tuning,
  progression: { ...tuning.progression, enemies: { ...tuning.progression.enemies, health: 1, healthAtFirst: 1, atk: 1, atkAtFirst: 1 } },
  pacing: { ...tuning.pacing, windupAtFirst: 1 }
})

/** What a blow of `power` from `character` deals a body with no DEF, at level 1: her ATK's share. */
export const hitBy = (character: CharacterId, power: number, tuning: Tuning = defaultTuning): number => damageDealt(tuning.characters[character].stats.atk, power)

/** A headless run after setup. Timeline frame `n` is read by fixed step `n + 1`. */
export const start = (options: StartOptions = {}) => {
  const gamepad = Gamepad.scripted(padBindings, options.pad ?? [])
  const sim = createSimulation({
    keyboard: Keyboard.scripted(keyBindings, options.keys ?? []),
    pointer: Pointer.scripted(options.pointer ?? [], { x: 640 + 200, y: 360 }),
    touch: Touch.scripted(touchButtons, options.touch ?? []),
    gamepad,
    party: scriptedPartyTaps(options.party ?? []),
    tuning: inArena(withWaves((options.toughness === true ? (tuning: Tuning) => tuning : plainEnemies)((options.moments === true ? (tuning: Tuning) => tuning : withoutMoments)(options.kits === "shipped" ? options.tuning ?? defaultTuning : withLobbedSpecials(options.tuning ?? defaultTuning))), options.waves ?? false), options.arena ?? "courtyard"),
    ...(options.build === undefined ? {} : { build: options.build }),
    ...(options.team === undefined ? {} : { team: options.team }),
    ...(options.challenge === undefined ? {} : { challenge: options.challenge }),
    ...(options.flow === undefined ? {} : { flow: options.flow }),
    ...(options.device === undefined ? {} : { device: options.device })
  })
  const setup = sim.runtime.tick(sim.setup)
  if (!setup.ok) throw new Error("setup failed")
  const step = (count = 1) => {
    for (let index = 0; index < count; index++) {
      const result = sim.runtime.tick(sim.fixedUpdate)
      if (!result.ok) throw new Error("step failed")
    }
  }
  return { ...sim, gamepad, step, player: () => sim.runtime.inspect(PlayerState) }
}

/** Despawns every enemy (training dummies included). */
export const ClearEnemies = Game.System("Test/ClearEnemies", {
  queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) },
  commands: Game.System.commands(Game.System.despawns(Enemy))
}, ({ queries, commands }) => {
  for (const { entity } of queries.enemies.each()) commands.despawn(entity)
})

/** The center of the default arena, where the player spawns. */
export const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }

/** Fixed steps covering `seconds` (rounded up). */
export const steps = (seconds: number): number => Math.ceil(seconds / engine.step.dt)

/** The cursor (screen) pointing at a world offset from the player at spawn, in the default viewport. */
export const cursorAt = (offset: Vec2): Vec2 => {
  const screen = toScreen(projection, offset)
  const zoom = viewZoom({ width: 1280, height: 720 })
  return { x: 640 + screen.x * zoom, y: 360 + screen.y * zoom }
}

/** A schedule that replaces every enemy with training dummies (of `tuning`) at offsets from the player's spawn. */
export const placeDummies = (offsets: ReadonlyArray<Vec2>, tuning: Tuning = defaultTuning) => {
  const Spawn = Game.System("Test/SpawnDummies", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
    for (const offset of offsets) commands.spawnIn(RunScope, makeEnemy(plainEnemies(tuning), "dummy", { x: center.x + offset.x, y: center.y + offset.y }))
  })
  return Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred())
}

/** Current mode read through the public inspector API. */
export const ReadFlow = Game.Inspector("Test/Flow", { machines: { flow: Game.System.machine(Flow) } }, ({ machines }) => machines.flow.get())

/**
 * Fails the test when a tick (or a restore) fails, naming the failure:
 * dropping the Result would let the test go on against a half-run world.
 */
export const expectOk = (result: { readonly ok: true } | { readonly ok: false; readonly error: unknown }): void => {
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.error)}`)
}
