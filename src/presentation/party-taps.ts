/**
 * The party list as input (see `PartyTap`): a tap anywhere on a member's
 * row switches to her, a tap on her ultimate's icon switches and uses it.
 * The rows are HUD elements over the canvas, so the touch controls never
 * see these touches (no stick starts under them).
 */
import type { PartyTap, PartyTaps } from "../config/input.ts"
import type { TeamRefs } from "./host-types.ts"

export const trackPartyTaps = (team: TeamRefs): PartyTaps & { dispose(): void } => {
  let pending: Array<PartyTap> = []
  const removals = team.members.map((refs, slot) => {
    const onDown = (event: PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      pending.push({ slot, ultimate: event.target instanceof Node && refs.burst.contains(event.target) })
    }
    refs.root.addEventListener("pointerdown", onDown)
    return () => refs.root.removeEventListener("pointerdown", onDown)
  })
  return {
    snapshot: () => {
      const taps = pending
      pending = []
      return taps
    },
    dispose: () => {
      for (const remove of removals) remove()
    }
  }
}
