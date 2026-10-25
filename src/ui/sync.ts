/**
 * Mirrors game state into the UI store (see `ui/store.ts`): each resource is
 * copied only when it changed since the last run, so an unchanged frame
 * writes nothing.
 */
import { batch } from "@preact/signals"

import { Challenge, Controls, Flow, Game, Paused, RunLog, RunResult, Team, Tuning, Tutorial } from "../schema.ts"
import { UiStoreService } from "./store.ts"

export const SyncUi = Game.System("Shooter/SyncUi", {
  resources: {
    tuning: Game.System.changedResource(Tuning),
    team: Game.System.changedResource(Team),
    challenge: Game.System.changedResource(Challenge),
    controls: Game.System.changedResource(Controls),
    result: Game.System.changedResource(RunResult),
    log: Game.System.changedResource(RunLog),
    paused: Game.System.readResource(Paused),
    tutorial: Game.System.changedResource(Tutorial)
  },
  machines: { flow: Game.System.machine(Flow) },
  services: { store: Game.System.service(UiStoreService) }
}, ({ resources, machines, services }) => {
  const store = services.store
  const flow = machines.flow.get()._tag
  batch(() => {
    store.flow.value = flow
    store.paused.value = flow === "Playing" && resources.paused.get().paused
    if (resources.controls.changed()) store.device.value = resources.controls.get().device
    if (resources.tuning.changed()) store.tuning.value = resources.tuning.get()
    if (resources.team.changed()) store.team.value = resources.team.get()
    if (resources.challenge.changed()) store.challenge.value = resources.challenge.get()
    if (resources.result.changed()) store.result.value = resources.result.get()
    if (resources.tuning.changed() || resources.challenge.changed() || resources.tutorial.changed()) {
      const objective = resources.tuning.get().challenges[resources.challenge.get()].objective
      store.tutorialDone.value = objective.kind === "tutorial" && resources.tutorial.get().step >= objective.steps.length
    }
    // The log goes with the result, once the run ended (not every frame of it).
    if (resources.result.get() !== null && (resources.result.changed() || resources.log.changed())) store.runLog.value = resources.log.get()
  })
})
