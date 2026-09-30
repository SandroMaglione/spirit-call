/**
 * Mirrors game state into the UI store once per frame (see `ui/store.ts`).
 * Signals notify only on change, and resources keep their value object
 * until it is replaced, so an unchanged frame re-renders nothing.
 */
import { batch } from "@preact/signals"

import { Build, Challenge, Controls, Flow, Game, Run, Stats, Tuning, Waves } from "../schema.ts"
import { UiStoreService } from "./store.ts"

export const SyncUi = Game.System("Shooter/SyncUi", {
  resources: {
    tuning: Game.System.readResource(Tuning),
    build: Game.System.readResource(Build),
    challenge: Game.System.readResource(Challenge),
    controls: Game.System.readResource(Controls),
    run: Game.System.readResource(Run),
    stats: Game.System.readResource(Stats),
    waves: Game.System.readResource(Waves)
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
    store.build.value = resources.build.get()
    store.challenge.value = resources.challenge.get()
    const over = flow === "GameOver" || flow === "Cleared"
    if (!over) {
      store.result.value = null
    } else if (store.result.value === null) {
      // Taken once as the results screen opens: the run is frozen from then on.
      store.result.value = {
        cleared: flow === "Cleared",
        challenge: resources.challenge.get(),
        wave: resources.waves.get().number,
        kills: resources.stats.get().kills,
        time: resources.run.get().time
      }
    }
  })
})
