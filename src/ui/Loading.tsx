/**
 * The wait while the game loads (the models, mostly): the five elements in a
 * row, each a dim stone that fills with its colour, bottom up, as its fifth
 * of the load arrives, and lights up when full; the sky glows in the colour
 * filling; a tip about the elements under it. Plain DOM and CSS, light on a
 * phone that is busy loading.
 */
import type { ReadonlySignal } from "@preact/signals"
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"

import type { ElementId } from "../content/elements.ts"
import { motes } from "./Backdrop.tsx"
import { EmblemIcon } from "./EmblemIcon.tsx"

const order: ReadonlyArray<ElementId> = ["wind", "rock", "thunder", "water", "fire"]

/** What is worth knowing before a fight, one at a time. */
const tips = [
  "Burning spreads between enemies that touch: fire is the answer to a pack.",
  "Soaked enemies hit softer, so water tames the heavy hitters.",
  "Swept enemies glide further, and a swept enemy slammed into a wall is stunned.",
  "A blow on a charged enemy arcs on to the nearest one.",
  "A cracked enemy's break bar fills faster: rock is for the tough ones.",
  "A different element on an enemy's state sets off a burst: mix elements in your team."
]

/** How long a tip stays, in milliseconds. */
const tipMs = 5000

/** The loading screen; `progress` is the share loaded, 0 to 1. */
export const Loading = ({ progress }: { readonly progress: ReadonlySignal<number> }) => {
  const tip = useSignal(Math.floor(Math.random() * tips.length))
  useEffect(() => {
    const timer = setInterval(() => (tip.value = (tip.value + 1) % tips.length), tipMs)
    return () => clearInterval(timer)
  }, [])
  const share = progress.value
  const filling = Math.min(order.length - 1, Math.floor(share * order.length))
  return <>
    <div class="backdrop loading-sky" aria-hidden="true">
      <div class="backdrop__light" />
      <div class="backdrop__light" />
      {order.map((element, i) => <div key={element} class="loading-sky__aura" data-element={element} data-on={i === filling ? "" : undefined} />)}
      <div class="backdrop__motes">{motes.map((style, i) => <i key={i} style={style} />)}</div>
    </div>
    <div class="ui-screen loading" role="status" aria-label={`Loading, ${Math.round(share * 100)}%`}>
      <div class="loading__stones">
        {order.map((element, i) => {
          const fill = Math.max(0, Math.min(1, share * order.length - i))
          return <div key={element} class="loading__stone" data-element={element} data-full={fill >= 1 ? "" : undefined} data-filling={i === filling && fill < 1 ? "" : undefined}>
            <div class="loading__dim"><EmblemIcon kind={element} /></div>
            <div class="loading__lit" style={{ clipPath: fill >= 1 ? undefined : `inset(${(1 - fill) * 100}% 0 0 0)` }}><EmblemIcon kind={element} /></div>
          </div>
        })}
      </div>
      <p class="loading__tip" key={tip.value}><b>Tip</b>{tips[tip.value]}</p>
    </div>
  </>
}
