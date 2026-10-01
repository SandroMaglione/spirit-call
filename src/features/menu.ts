/**
 * The screens around the arena: the menu (pick what to play and the team),
 * the run, and the results. The game owns this state (the `Flow` machine,
 * the `Team` and `Challenge` resources); the UI (src/ui) only shows it and asks
 * for changes by queueing requests in the `UiRequests` service, which
 * `ApplyUiRequests` applies at the start of the next step. Tests queue the
 * same requests, so menus are testable without a browser.
 */
import { Descriptor } from "@typeonce/bevy-ts"

import type { ChallengeId } from "../content/challenges.ts"
import { Challenge, EnemyLevel, Flow, Game, Team } from "../schema.ts"
import type { BuildValue } from "../schema.ts"

export type UiRequest =
  /** Enter the arena with this team (in order) to face this challenge. */
  | { readonly kind: "start"; readonly team: ReadonlyArray<BuildValue>; readonly challenge: ChallengeId; readonly enemyLevel: number }
  /** From the results: the same challenge again, with the same team. */
  | { readonly kind: "retry" }
  /** From the results: back to the menu. */
  | { readonly kind: "menu" }

export interface UiRequestsValue {
  readonly pending: Array<UiRequest>
}

export const UiRequests = Descriptor.Service<UiRequestsValue>()("Shooter/UiRequests")

export const emptyUiRequests = (): UiRequestsValue => ({ pending: [] })

/** Applies queued UI requests; a request that does not fit the current screen is dropped. */
export const ApplyUiRequests = Game.System("Shooter/ApplyUiRequests", {
  resources: { team: Game.System.writeResource(Team), challenge: Game.System.writeResource(Challenge), enemyLevel: Game.System.writeResource(EnemyLevel) },
  machines: { flow: Game.System.machine(Flow) },
  nextMachines: { flow: Game.System.nextState(Flow) },
  services: { requests: Game.System.service(UiRequests) }
}, ({ resources, machines, nextMachines, services }) => {
  const pending = services.requests.pending.splice(0)
  const flow = machines.flow.get()
  const onResults = flow === "GameOver" || flow === "Cleared"
  for (const request of pending) {
    switch (request.kind) {
      case "start":
        if (flow !== "Menu" && !onResults) break
        resources.team.set(request.team)
        resources.challenge.set(request.challenge)
        resources.enemyLevel.set(request.enemyLevel)
        // Entering `Playing` restarts the run with the new team (see `restart`).
        nextMachines.flow.set("Playing")
        break
      case "retry":
        if (onResults) nextMachines.flow.set("Playing")
        break
      case "menu":
        if (onResults) nextMachines.flow.set("Menu")
        break
    }
  }
})
