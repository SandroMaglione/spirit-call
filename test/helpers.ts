import { Keyboard, Pointer, Touch } from "@typeonce/bevy-ts-browser"

import { keyBindings, touchButtons } from "../src/config/input.ts"
import type { Direction, TouchButton } from "../src/config/input.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { ShotMove } from "../src/content/attacks.ts"
import { Aim, Dash, Enemy, Game, Invulnerable, Player, Position, Velocity } from "../src/schema.ts"
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
 * The gun instead of the sword (the default attack), for tests about
 * shooting; `shot` overrides its opening shot.
 */
export const withGun = (tuning: Tuning, shot: Partial<Omit<ShotMove, "shape">> = {}): Tuning => {
  const gun = tuning.attacks.gun
  const [first, ...rest] = gun.combo
  return {
    ...tuning,
    player: { ...tuning.player, loadout: { ...tuning.player.loadout, attack: "gun" } },
    attacks: { ...tuning.attacks, gun: { ...gun, combo: [{ ...(first as ShotMove), ...shot }, ...rest] } }
  }
}

/** The grenade instead of the Blade Wave in the special slot, for tests about the grenade. */
export const withGrenade = (tuning: Tuning): Tuning => ({ ...tuning, player: { ...tuning.player, loadout: { ...tuning.player.loadout, special: "grenade" } } })

const withWaves = (tuning: Tuning, enabled: boolean): Tuning => ({ ...tuning, waves: { ...tuning.waves, enabled } })

export interface StartOptions {
  readonly keys?: Keyboard.Timeline<typeof keyBindings>
  readonly pointer?: Pointer.Timeline
  readonly touch?: Touch.Timeline<TouchButton>
  readonly tuning?: Tuning
  /** Run waves instead of training dummies. Defaults to false. */
  readonly waves?: boolean
}

/** A headless run after setup. Timeline frame `n` is read by fixed step `n + 1`. */
export const start = (options: StartOptions = {}) => {
  const sim = createSimulation({
    keyboard: Keyboard.scripted(keyBindings, options.keys ?? []),
    pointer: Pointer.scripted(options.pointer ?? [], { x: 640 + 200, y: 360 }),
    touch: Touch.scripted(touchButtons, options.touch ?? []),
    tuning: withWaves(options.tuning ?? defaultTuning, options.waves ?? false)
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
