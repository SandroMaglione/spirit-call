/**
 * Entering the arena: for a moment the screen is dark, what is played
 * comes in, the team's faces slide in one after another, and it all fades
 * onto the run (which starts at once underneath; nothing waits for this,
 * and touches go through).
 */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"

import { describePlay } from "./describe.ts"
import { elementOf } from "./draft.ts"
import { Face } from "./kit/art.tsx"
import type { UiStore } from "./store.ts"

/** How long it shows, in milliseconds (its fade is the last part, see `.entrance` in screens.css). */
const entranceMs = 900

export const Entrance = ({ store }: { readonly store: UiStore }) => {
  const over = useSignal(false)
  useEffect(() => { const timer = setTimeout(() => (over.value = true), entranceMs); return () => clearTimeout(timer) }, [])
  if (over.value) return null
  const tuning = store.tuning.peek(), play = store.play.peek(), extra = store.extra.peek()
  const name = extra?.kind === "trial" ? `${tuning.characters[extra.character].name} · Trial` : extra?.kind === "tutorial" ? "Tutorial" : extra !== null ? "Practice" : play === null ? tuning.challenges[store.challenge.peek()].name : describePlay(tuning, play)
  return <div class="entrance" aria-hidden="true">
    <div class="entrance__card">
      <span class="entrance__faces">{store.team.peek().map((build, index) => <span key={build.character} style={{ animationDelay: `${0.08 + index * 0.08}s` }}><Face of={{ character: build.character }} tint={elementOf(tuning, build.character)} size={44} /></span>)}</span>
      <b>{name}</b>
    </div>
  </div>
}
