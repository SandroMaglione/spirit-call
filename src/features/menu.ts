/**
 * The screens around the arena: the menu (pick what to play and the team),
 * the run (and its in-game menu, `Paused`), and the results. The game owns
 * this state (the `Flow` machine, the `Team`, `Challenge`, and `Paused`
 * resources); the UI (src/ui) only shows it and asks
 * for changes by queueing requests in the `UiRequests` service, which
 * `ApplyUiRequests` applies at the start of the next step. Tests queue the
 * same requests, so menus are testable without a browser.
 */
import { Descriptor } from "@typeonce/bevy-ts"

import type { ChallengeId } from "../content/challenges.ts"
import { Challenge, EnemyLevel, Flow, Game, Paused, Practice, RunResult, Team } from "../schema.ts"
import type { BuildValue, PracticeValue } from "../schema.ts"

export type UiRequest =
  /** Enter the arena with this team (in order) to face this challenge. */
  | {
    readonly kind: "start"
    readonly team: ReadonlyArray<BuildValue>
    readonly challenge: ChallengeId
    readonly enemyLevel: number
    /** Enemy Practice's picks (see `Practice`); none for anything else. */
    readonly practice?: PracticeValue
  }
  /** From the results or the in-game menu: the same challenge again, with the same team, from the start. */
  | { readonly kind: "retry" }
  /** From the results or the in-game menu: back to the menu (a run left this way is not recorded). */
  | { readonly kind: "menu" }
  /** During a run: open the in-game menu; the world stands still. */
  | { readonly kind: "pause" }
  /** From the in-game menu: back to the run. */
  | { readonly kind: "resume" }

export interface UiRequestsValue {
  readonly pending: Array<UiRequest>
}

export const UiRequests = Descriptor.Service<UiRequestsValue>()("Shooter/UiRequests")

export const emptyUiRequests = (): UiRequestsValue => ({ pending: [] })

/** Applies queued UI requests; a request that does not fit the current screen is dropped. */
export const ApplyUiRequests = Game.System("Shooter/ApplyUiRequests", {
  resources: {
    team: Game.System.writeResource(Team),
    challenge: Game.System.writeResource(Challenge),
    enemyLevel: Game.System.writeResource(EnemyLevel),
    paused: Game.System.writeResource(Paused),
    result: Game.System.readResource(RunResult),
    practice: Game.System.writeResource(Practice)
  },
  machines: { flow: Game.System.machine(Flow) },
  nextMachines: { flow: Game.System.nextState(Flow) },
  services: { requests: Game.System.service(UiRequests) }
}, ({ resources, machines, nextMachines, services }) => {
  const pending = services.requests.pending.splice(0)
  const flow = machines.flow.get()
  const onResults = flow === "GameOver" || flow === "Cleared"
  // A run that just ended (its result is in, the results screen comes with this step's transitions) is no longer paused.
  const live = flow === "Playing" && resources.result.get() === null
  for (const request of pending) {
    switch (request.kind) {
      case "start":
        if (flow !== "Menu" && !onResults) break
        resources.team.set(request.team)
        resources.challenge.set(request.challenge)
        resources.enemyLevel.set(request.enemyLevel)
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
    }
  }
})
