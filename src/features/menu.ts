/**
 * The screens around the arena: the menu (pick what to play and the team),
 * the run (and its in-game menu, `Paused`), and the results. The game owns
 * this state (the `Flow` machine, the `Team`, `Challenge`, and `Paused`
 * resources); the UI (src/ui) only shows it and asks
 * for changes by sending `UiRequest` events, which
 * `ApplyUiRequests` applies at the end of the next step. Tests queue the
 * same requests, so menus are testable without a browser.
 */
import { UiRequest, Challenge, ControlOptions, EnemyLevel, Flow, Game, noTwist, Paused, Practice, RunResult, Team, Tuning, Twist } from "../schema.ts"
import { withValidAspects, withValidRelics } from "./build.ts"

/** Applies queued UI requests; a request that does not fit the current screen is dropped. */
export const ApplyUiRequests = Game.System("Shooter/ApplyUiRequests", {
  resources: {
    team: Game.System.writeResource(Team),
    challenge: Game.System.writeResource(Challenge),
    enemyLevel: Game.System.writeResource(EnemyLevel),
    twist: Game.System.writeResource(Twist),
    paused: Game.System.writeResource(Paused),
    result: Game.System.readResource(RunResult),
    practice: Game.System.writeResource(Practice),
    tuning: Game.System.readResource(Tuning),
    controlOptions: Game.System.writeResource(ControlOptions)
  },
  machines: { flow: Game.System.machine(Flow) },
  nextMachines: { flow: Game.System.nextState(Flow) },
  events: { requests: Game.System.readEvent(UiRequest) }
}, ({ resources, machines, nextMachines, events }) => {
  const pending = events.requests.all()
  const flow = machines.flow.get()
  const onResults = flow === "GameOver" || flow === "Cleared"
  // A run that just ended (its result is in, the results screen comes with this step's transitions) is no longer paused.
  const live = flow === "Playing" && resources.result.get() === null
  for (const request of pending) {
    switch (request.kind) {
      case "start":
        if (flow !== "Menu" && !onResults) break
        // One aspect and one of each relic on one member at most, each fitting her (see `withValidAspects`, `withValidRelics`).
        resources.team.set(withValidRelics(resources.tuning.get(), withValidAspects(resources.tuning.get(), request.team)))
        resources.challenge.set(request.challenge)
        resources.enemyLevel.set(request.enemyLevel)
        resources.twist.set(request.twist ?? noTwist)
        resources.practice.set(request.practice ?? { kinds: [], elites: false })
        // Entering `Playing` restarts the run with the new team (see `restart`).
        nextMachines.flow.set("Playing")
        break
      case "retry":
        // From a paused run, entering `Playing` again restarts it all the same.
        if (onResults || resources.paused.get().paused) nextMachines.flow.set("Playing")
        break
      case "menu":
        if (onResults || resources.paused.get().paused) {
          resources.paused.set({ paused: false })
          nextMachines.flow.set("Menu")
        }
        break
      case "pause":
        if (live) resources.paused.set({ paused: true })
        break
      case "resume":
        resources.paused.set({ paused: false })
        break
      case "leave":
        if (flow === "Playing" && resources.tuning.get().challenges[resources.challenge.get()].objective.kind === "tutorial") {
          resources.paused.set({ paused: false })
          nextMachines.flow.set("Menu")
        }
        break
      case "controlOptions":
        resources.controlOptions.set(request.options)
        break
    }
  }
})
