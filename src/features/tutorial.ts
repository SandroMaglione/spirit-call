/**
 * The tutorial (see the `tutorial` objective and `content/tutorial.ts`): one
 * step asked at a time. Each step is set up as it comes (its dummy stood up,
 * never falling; its skill readied), then counted from what the player did
 * this step (walking into the circle, dashes, blows landed, skills used,
 * perfect dodges); once it is done, the next comes. The last clears the run
 * (see `CheckObjective`), and the app lets the player choose a quest or the menu.
 */
import type { TutorialStep } from "../content/tutorial.ts"
import { distance } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Action, Cast, Challenge, Dash, Enemy, EnemyLevel, Energy, Game, Hit, Immortal, PendingSpawn, PerfectDodged, Player, Position, RunScope, Skills, SlowMotion, Time, Tuning, Tutorial, UltimateCalled } from "../schema.ts"
import type { SkillsValue } from "../schema.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { makeEnemy } from "./enemies.ts"

/** How close to a move step's spot counts as there (world units). */
export const tutorialSpotRadius = 70
/** A little time to enjoy the final dodge after its slow motion has finished. */
export const tutorialSuccessSeconds = 0.8

/** A share of the arena (`content/tutorial.ts`'s spots) in world units. */
export const tutorialSpot = (tuning: TuningValue, spot: { readonly x: number; readonly y: number }): Vec2 => ({ x: spot.x * tuning.arena.width, y: spot.y * tuning.arena.height })

/** How many of a step's actions it asks for (one for a place to reach or a skill to use). */
export const stepGoal = (step: TutorialStep): number => {
  switch (step.kind) {
    case "dash":
    case "perfectDodge":
      return step.times
    case "attack":
      return step.hits
    case "move":
    case "special":
    case "ultimate":
      return 1
  }
}

/** Sets the tutorial's steps going, and counts the one asked. */
export const RunTutorial = Game.System("Shooter/RunTutorial", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), dash: Game.Query.read(Dash), skills: Game.Query.write(Skills), energy: Game.Query.write(Energy) }, with: [Player] }),
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } })
  },
  resources: {
    tuning: Game.System.readResource(Tuning),
    challenge: Game.System.readResource(Challenge),
    level: Game.System.readResource(EnemyLevel),
    tutorial: Game.System.writeResource(Tutorial),
    slowMotion: Game.System.readResource(SlowMotion),
    time: Game.System.readResource(Time)
  },
  events: {
    action: Game.System.readEvent(Action),
    hit: Game.System.readEvent(Hit),
    cast: Game.System.readEvent(Cast),
    called: Game.System.readEvent(UltimateCalled),
    perfect: Game.System.readEvent(PerfectDodged)
  }
}, ({ queries, resources, events, commands }) => {
  const tuning = resources.tuning.get()
  const objective = tuning.challenges[resources.challenge.get()].objective
  if (objective.kind !== "tutorial") return
  const state = resources.tutorial.get()
  const step = objective.steps[state.step]
  const [player] = queries.player.each()
  if (step === undefined) {
    if (state.celebrate > 0 && resources.slowMotion.get().remaining <= 0) {
      resources.tutorial.set({ ...state, celebrate: Math.max(0, state.celebrate - resources.time.get().dt) })
    }
    return
  }
  if (player === undefined) return

  // A step coming in: the dummy it asks for (the one standing stays, when it is the same), and its skill ready.
  if (state.ready !== state.step) {
    // Let the last dash end before placing the next step's dummy beside the player.
    if (player.data.dash.get().remaining > 0) return
    const wanted = "dummy" in step ? step.dummy : null
    const standing = queries.enemies.each()
    const keep = wanted !== null && standing.length === 1 && standing[0]!.data.enemy.get().kind === wanted.kind
    if (!keep) {
      for (const { entity } of standing) commands.despawn(entity.id)
      for (const { entity } of queries.pending.each()) commands.despawn(entity.id)
      if (wanted !== null) {
        const offset = tutorialSpot(tuning, wanted.offset)
        const at = player.data.position.get()
        const radius = tuning.enemies[wanted.kind].radius
        const near = { x: Math.max(radius, Math.min(tuning.arena.width - radius, at.x + offset.x)), y: Math.max(radius, Math.min(tuning.arena.height - radius, at.y + offset.y)) }
        commands.spawnIn(RunScope, Game.Command.insert(makeEnemy(tuning, wanted.kind, near, 1, resources.level.get()), [Immortal, {}]))
      }
    }
    if (step.kind === "special" || step.kind === "ultimate") {
      const skills = player.data.skills.get()
      player.data.skills.set({ ...skills, [step.kind]: { ...skills[step.kind], cooldown: 0 } } as SkillsValue)
    }
    resources.tutorial.set({ ...state, ready: state.step })
  }
  // The ultimate's step keeps its energy full, until it is used.
  if (step.kind === "ultimate") player.data.energy.set({ current: tuning.energy.max })

  const skills = player.data.skills.get()
  const used = (slot: "special" | "ultimate") =>
    events.cast.all().filter((cast) => cast.faction === "player" && cast.skill === skills[slot].skill && cast.landing !== true && cast.called !== true).length
  const done = (() => {
    switch (step.kind) {
      case "move":
        return distance(player.data.position.get(), tutorialSpot(tuning, step.to)) <= tutorialSpotRadius ? 1 : 0
      case "dash":
        return events.action.all().filter((action) => action.kind === "dash").length
      case "attack":
        // Blows that landed on an enemy (a `Hit` carries the side of whom it hit).
        return events.hit.all().filter((hit) => hit.faction === "enemy" && hit.source?.move !== undefined && !hit.periodic).length
      case "special":
        return used("special")
      case "ultimate":
        return used("ultimate") + events.called.all().length
      case "perfectDodge":
        return events.perfect.all().length
    }
  })()
  if (done === 0) return
  const count = resources.tutorial.get().count + done
  const current = resources.tutorial.get()
  resources.tutorial.set(count >= stepGoal(step)
    ? { ...current, step: current.step + 1, count: 0, celebrate: current.step + 1 >= objective.steps.length ? tutorialSuccessSeconds : 0 }
    : { ...current, count })
})
