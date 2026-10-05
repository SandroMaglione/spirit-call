/**
 * The seal (see docs/calls.md, "On screen"): what calls brought, revealed.
 * A stone seal, held (or swiped up) until it cracks; the light coming
 * through tells the best result, honestly (white, purple, gold), and a
 * gold light turns her element's colour as it bursts. Then each character
 * and aspect in turn, the best last (a character as her model arriving,
 * with what she does and a trial), and all of it in a row at the end. A
 * single call that brings a supply shows it alone.
 */
import { useSignal } from "@preact/signals"
import { useEffect, useRef } from "preact/hooks"
import type { CallResult } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import { elements } from "../../content/elements.ts"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { elementOf } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import { Model } from "../kit/art.tsx"
import { Card } from "../kit/Card.tsx"
import { Pill, RoundButton } from "../kit/controls.tsx"
import { Label } from "../kit/panel.tsx"
import type { CallReveal as Reveal, UiActions, UiStore } from "../store.ts"
import { CharacterCard, describeResult, KitLines, MaterialIcon, materialsIn } from "./parts.tsx"

/** How long holding the seal takes to break it, and how fast it heals when let go (shares per second). */
const holdSeconds = 1.1
const healRate = 0.7
/** How far up a swipe breaks it at once (units). */
const swipe = 60
/** How long the burst lasts before the first result, in milliseconds: a gold one turns her colour first. */
const burstMs = { white: 750, purple: 950, gold: 1500 } as const

type Light = keyof typeof burstMs

const lightOf = (result: CallResult): Light => (result.kind === "character" ? "gold" : result.kind === "aspect" ? "purple" : "white")
const rank = { white: 0, purple: 1, gold: 2 } as const

/** The seal's cracks: jagged lines from the middle out, in a 200-unit box around the centre. */
const cracks = [
  "M0 0 L8 -14 L4 -30 L14 -46 L10 -64 L22 -86",
  "M0 0 L16 4 L30 -4 L48 6 L66 0 L88 12",
  "M0 0 L10 14 L6 30 L20 44 L16 62 L28 84",
  "M0 0 L-12 12 L-26 8 L-38 24 L-58 22 L-80 38",
  "M0 0 L-14 -6 L-24 -20 L-42 -18 L-56 -34 L-78 -40",
  "M0 0 L-4 -16 L-18 -28 L-14 -48 L-30 -62 L-34 -84",
  "M0 0 L-6 16 L-20 30 L-16 50 L-34 66"
]
const runes = Array.from({ length: 16 }, (_, index) => {
  const angle = (index / 16) * Math.PI * 2, x = Math.cos(angle) * 84, y = Math.sin(angle) * 84
  return `${x},${y - 4} ${x + 3},${y} ${x},${y + 4} ${x - 3},${y}`
})
const triangle = (turn: number) => [0, 1, 2].map((corner) => {
  const angle = turn + (corner / 3) * Math.PI * 2 - Math.PI / 2
  return `${Math.cos(angle) * 58},${Math.sin(angle) * 58}`
}).join(" ")

export const CallReveal = ({ store, actions, reveal, done }: { readonly store: UiStore; readonly actions: UiActions; readonly reveal: Reveal; readonly done: () => void }) => {
  const tuning = store.tuning.value
  // The best last; a ten-call reveals its characters and aspects one by one, its supplies in the row at the end.
  const ordered = reveal.results.map((result, index) => ({ result, index })).sort((a, b) => rank[lightOf(a.result)] - rank[lightOf(b.result)] || a.index - b.index).map((each) => each.result)
  const shown = ordered.length === 1 ? ordered : ordered.filter((result) => result.kind !== "supply")
  const light = lightOf(ordered[ordered.length - 1]!)
  const best = ordered[ordered.length - 1]!
  const phase = useSignal<"seal" | "burst" | "show" | "summary">("seal")
  const index = useSignal(0)
  const progress = useSignal(0)
  const holding = useRef(false), start = useRef<number | null>(null), cracked = useRef(0)

  const breakSeal = () => {
    if (phase.peek() !== "seal") return
    progress.value = 1
    phase.value = "burst"
    actions.cue("burst")
    setTimeout(() => (phase.value = shown.length === 0 ? "summary" : "show"), burstMs[light])
  }
  // Holding fills the seal's cracks; letting go heals them.
  useEffect(() => {
    if (phase.value !== "seal") return
    let frame = 0, last = performance.now()
    const step = (time: number) => {
      const seconds = Math.min(0.1, (time - last) / 1000)
      last = time
      const next = Math.max(0, Math.min(1, progress.peek() + (holding.current ? seconds / holdSeconds : -seconds * healRate)))
      progress.value = next
      // A crack sounds at each quarter it passes.
      const quarter = Math.floor(next * 4)
      if (quarter > cracked.current && quarter < 4) actions.cue("crack")
      cracked.current = Math.max(cracked.current, quarter)
      if (next >= 1) { breakSeal(); return }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [phase.value])
  // What comes out sounds as it shows.
  useEffect(() => {
    if (phase.value !== "show") return
    const result = shown[index.value]
    if (result?.kind === "character") actions.cue("character")
    else if (result?.kind === "aspect") actions.cue("aspect")
  }, [phase.value, index.value])

  const next = () => {
    if (index.value + 1 < shown.length) index.value += 1
    else phase.value = "summary"
  }
  const element = best.kind === "character" ? elementOf(tuning, best.id) : undefined
  const current = phase.value === "show" ? shown[index.value] : undefined
  // The sky is plain stone around the seal; a character arriving brings hers.
  const sky = current?.kind === "character" ? elementOf(tuning, current.id) : phase.value === "burst" && element !== undefined ? element : "plain"
  useEffect(() => { store.sky.value = sky }, [sky])
  useEffect(() => () => { store.sky.value = null }, [])

  if (phase.value === "seal" || phase.value === "burst") {
    const p = progress.value
    return <div class="reveal" data-phase={phase.value} data-light={light} data-element={element} style={{ "--p": p }}>
      <div class="reveal__light" aria-hidden="true" />
      <button type="button" class="reveal__seal" aria-label="Break the seal (hold, or swipe up)"
        onPointerDown={(event) => { holding.current = true; start.current = event.clientY; if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={(event) => { if (holding.current && start.current !== null && start.current - event.clientY > swipe * (event.currentTarget.getBoundingClientRect().height / (event.currentTarget.offsetHeight || 1))) breakSeal() }}
        onPointerUp={() => { holding.current = false; start.current = null }}
        onPointerCancel={() => { holding.current = false; start.current = null }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); breakSeal() } }}>
        <svg viewBox="-100 -100 200 200" aria-hidden="true">
          <defs>
            <radialGradient id="seal-stone" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#5a5f78" /><stop offset=".6" stop-color="#30344a" /><stop offset="1" stop-color="#1c1f2e" /></radialGradient>
          </defs>
          <circle r="94" fill="url(#seal-stone)" class="reveal__stone" />
          <circle r="94" class="reveal__rim" />
          <circle r="76" class="reveal__ring" />
          <circle r="28" class="reveal__ring" />
          {runes.map((points, at) => <polygon key={at} points={points} class="reveal__rune" />)}
          <polygon points={triangle(0)} class="reveal__ring" />
          <polygon points={triangle(Math.PI)} class="reveal__ring" />
          <g class="reveal__cracks">{cracks.map((path, at) => <path key={at} d={path} pathLength={1} style={{ strokeDashoffset: Math.min(1, Math.max(0, 1 - p * 1.25 + at * 0.04)) }} />)}</g>
        </svg>
      </button>
      <div class="reveal__flash" aria-hidden="true" />
      <div class="reveal__flash reveal__flash--element" aria-hidden="true" />
      <p class="reveal__hint">{phase.value === "seal" ? (store.device.value === "touch" ? "Hold the seal, or swipe up" : "Hold the seal to break it") : ""}</p>
      {phase.value === "seal" && <span class="reveal__skip"><RoundButton icon="next" tone="dark" label="Break it now" onClick={breakSeal} /></span>}
    </div>
  }

  if (current !== undefined) {
    const counter = shown.length > 1 ? <span class="reveal__count">{index.value + 1} / {shown.length}</span> : null
    if (current.kind === "character") {
      const spec = tuning.characters[current.id], own = elementOf(tuning, current.id)
      return <div class="reveal reveal--character" data-element={own} key={`c-${index.value}`}>
        <div class="reveal__rays" aria-hidden="true" />
        <div class="reveal__stage"><Model character={current.id} reveal /></div>
        <section class="reveal__about">
          {counter}
          <Label>New spirit</Label>
          <h1>{spec.name}</h1>
          <p class="reveal__kind"><Icon name={own} />{elements[own].name} · {tuning.classes[spec.class].name}</p>
          <KitLines store={store} character={current.id} />
          <div class="reveal__actions">
            <Pill size="small" tone="dark" onClick={() => { done(); actions.enterExtra([current.id], {}, { kind: "trial", character: current.id }) }}>Try her</Pill>
            <Pill icon="next" onClick={next}>Next</Pill>
          </div>
        </section>
      </div>
    }
    if (current.kind === "aspect") {
      const aspect = aspectOf(tuning.aspects, current.id)
      return <div class="reveal reveal--aspect" key={`a-${index.value}`}>
        <div class="reveal__rays" aria-hidden="true" />
        <section class="reveal__prize">
          {counter}
          <span class="reveal__orb"><AbilityIcon kind={aspect.class} /></span>
          <Label>New aspect · {tuning.classes[aspect.class].name}</Label>
          <h1>{aspect.name}</h1>
          <p>{aspect.description}</p>
          <Pill icon="next" onClick={next}>Next</Pill>
        </section>
      </div>
    }
    return <div class="reveal reveal--supply" key={`s-${index.value}`}>
      <section class="reveal__prize">
        <Label>Supply</Label>
        <SupplyAmounts store={store} result={current} />
        <Pill icon="next" onClick={next}>Next</Pill>
      </section>
    </div>
  }

  return <div class="reveal reveal--summary">
    <section class="reveal__summary">
      <h1>{ordered.length === 1 ? "Your call" : `Your ${ordered.length} calls`}</h1>
      <div class="reveal__row">{ordered.map((result, at) => <div key={at} class="reveal__item" data-light={lightOf(result)} style={{ animationDelay: `${at * 0.06}s` }}>
        {result.kind === "character"
          ? <CharacterCard store={store} character={result.id} foot="NEW" fresh />
          : result.kind === "aspect"
            ? <Card fresh tint="thunder" art={<AbilityIcon kind={aspectOf(tuning.aspects, result.id).class} />} foot="NEW" label={describeResult(store, result)} />
            : <Card art={<Icon name="gold" />} foot={`+${(result.amounts.gold ?? 0).toLocaleString("en-US")}`} label={describeResult(store, result)} />}
        <small>{result.kind === "supply" ? "Supply" : describeResult(store, result).replace(/ \(.*\)$/, "")}</small>
      </div>)}</div>
      <Pill icon="check" onClick={done}>Done</Pill>
    </section>
  </div>
}

/** A supply's gold and materials, large. */
const SupplyAmounts = ({ store, result }: { readonly store: UiStore; readonly result: Extract<CallResult, { kind: "supply" }> }) => (
  <div class="reveal__supply">
    <span><Icon name="gold" />{(result.amounts.gold ?? 0).toLocaleString("en-US")}</span>
    {materialsIn(store, result.amounts).map((id) => <span key={id}><MaterialIcon store={store} material={id} />{result.amounts[id]}</span>)}
  </div>
)
