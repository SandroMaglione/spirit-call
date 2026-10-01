/**
 * Mirrors game state into the UI store once per frame (see `ui/store.ts`).
 * Signals notify only on change, and resources keep their value object
 * until it is replaced, so an unchanged frame re-renders nothing.
 */
import { batch } from "@preact/signals"

import { Challenge, Controls, Flow, Game, RunResult, Team, Tuning } from "../schema.ts"
import { UiStoreService } from "./store.ts"

export const SyncUi = Game.System("Shooter/SyncUi", {
  resources: {
    tuning: Game.System.readResource(Tuning),
    team: Game.System.readResource(Team),
    challenge: Game.System.readResource(Challenge),
    controls: Game.System.readResource(Controls),
    result: Game.System.readResource(RunResult)
  },
  machines: { flow: Game.System.machine(Flow) },
  services: { store: Game.System.service(UiStoreService) }
}, ({ resources, machines, services }) => {
  const store = services.store
  const flow = machines.flow.get()
  batch(() => {
    store.flow.value = flow
    store.device.value = resources.controls.get().device
    store.tuning.value = resources.tuning.get()
    store.team.value = resources.team.get()
    store.challenge.value = resources.challenge.get()
    store.result.value = resources.result.get()
  })
})
