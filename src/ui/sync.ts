/**
 * Mirrors game state into the UI store once per frame (see `ui/store.ts`).
 * Signals notify only on change, and resources keep their value object
 * until it is replaced, so an unchanged frame re-renders nothing.
 */
import { batch } from "@preact/signals"

import { Challenge, Controls, Flow, Game, Paused, RunLog, RunResult, Team, Tuning, Tutorial } from "../schema.ts"
import { UiStoreService } from "./store.ts"

export const SyncUi = Game.System("Shooter/SyncUi", {
  resources: {
    tuning: Game.System.readResource(Tuning),
    team: Game.System.readResource(Team),
    challenge: Game.System.readResource(Challenge),
    controls: Game.System.readResource(Controls),
    result: Game.System.readResource(RunResult),
    log: Game.System.readResource(RunLog),
    paused: Game.System.readResource(Paused),
    tutorial: Game.System.readResource(Tutorial)
  },
  machines: { flow: Game.System.machine(Flow) },
  services: { store: Game.System.service(UiStoreService) }
}, ({ resources, machines, services }) => {
  const store = services.store
  const flow = machines.flow.get()
  batch(() => {
    store.flow.value = flow
    store.paused.value = flow === "Playing" && resources.paused.get().paused
    store.device.value = resources.controls.get().device
    store.tuning.value = resources.tuning.get()
    store.team.value = resources.team.get()
    store.challenge.value = resources.challenge.get()
    store.result.value = resources.result.get()
    const objective = resources.tuning.get().challenges[resources.challenge.get()].objective
    store.tutorialDone.value = objective.kind === "tutorial" && resources.tutorial.get().step >= objective.steps.length
    // The log goes with the result, once the run ended (not every frame of it).
    if (resources.result.get() !== null) store.runLog.value = resources.log.get()
  })
})
