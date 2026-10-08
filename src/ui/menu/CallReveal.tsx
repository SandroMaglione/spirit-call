/**
 * The seal (see docs/calls.md, "On screen"): what calls brought, revealed.
 * It shows as the call is made, while the server works out what it
 * brought. A stone seal, held (or swiped up) until it cracks: the light
 * coming through starts white; once cracked (and the answer is in: the
 * seal holds, nearly broken, until it is), it rises to tell the best
 * result, honestly: blue for a relic, rose for a look, purple for an
 * aspect, then gold (the room dims, a pulse, a sting), and a gold light
 * turns her element's colour as it bursts. Then each character, aspect,
 * look, and relic in turn, the best last (a character as her model
 * arriving, with what she does and a trial), and all of it in a row at the
 * end. A single call that brings a supply shows it alone. A call that
 * could not be made crumbles back to stone.
 */
import { useSignal } from "@preact/signals"
import { useEffect, useRef } from "preact/hooks"
import type { CallResult } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import { cosmeticOf } from "../../content/cosmetics.ts"
import { elements } from "../../content/elements.ts"
import { relicOf } from "../../content/relics.ts"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { LookIcon, RelicIcon } from "../RelicIcon.tsx"
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
const burstMs = { white: 750, blue: 800, rose: 900, purple: 950, gold: 1500 } as const
/** How far the seal cracks before the server's answer is in: it holds there, nearly broken. */
const waitingCrack = 0.9
/** The least time from the seal showing to its light rising, in milliseconds (the build-up, however fast the answer). */
const buildUpMs = 1500
/** The light rising once the seal broke, in milliseconds: the white holds, then turns to the best result's (a gold one through purple, the room dimmed), before the burst. */
const riseMs = { white: 250, blue: 500, rose: 550, purple: 600, gold: 750 } as const
/** How long a call that could not be made takes to crumble, in milliseconds. */
const crumbleMs = 900

type Light = keyof typeof burstMs

/** Each result's light, rarest brightest: gold a character, purple an aspect, rose a look, blue a relic, white a supply. */
const lightOf = (result: CallResult): Light => {
  switch (result.kind) {
    case "character":
      return "gold"
    case "aspect":
      return "purple"
    case "cosmetic":
      return "rose"
    case "relic":
      return "blue"
    case "supply":
      return "white"
  }
}
const rank = { white: 0, blue: 1, rose: 2, purple: 3, gold: 4 } as const

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
  const results = reveal.results ?? []
  // The best last; a ten-call reveals what is not a supply one by one, its supplies in the row at the end.
  const ordered = results.map((result, index) => ({ result, index })).sort((a, b) => rank[lightOf(a.result)] - rank[lightOf(b.result)] || a.index - b.index).map((each) => each.result)
  const shown = ordered.length === 1 ? ordered : ordered.filter((result) => result.kind !== "supply")
  const best = ordered[ordered.length - 1]
  const light: Light = best === undefined ? "white" : lightOf(best)
  const phase = useSignal<"seal" | "rise" | "burst" | "show" | "summary" | "crumble">("seal")
  /** The light showing through the seal: white until it rises. */
  const glow = useSignal<Light>("white")
  /** Whether the player broke the seal (held it through, swiped, or skipped): it opens once the answer is in. */
  const broken = useSignal(false)
  const index = useSignal(0)
  const progress = useSignal(0)
  const holding = useRef(false), start = useRef<number | null>(null), cracked = useRef(0), opened = useRef(performance.now())

  const breakSeal = () => {
    if (phase.peek() !== "seal") return
    broken.value = true
  }
  // Holding fills the seal's cracks; letting go heals them. Before the answer, it cracks no further than nearly broken.
  useEffect(() => {
    if (phase.value !== "seal") return
    let frame = 0, last = performance.now()
    const step = (time: number) => {
      const seconds = Math.min(0.1, (time - last) / 1000)
      last = time
      const most = store.callReveal.peek()?.results === null ? waitingCrack : 1
      const pushing = holding.current || broken.peek()
      const next = Math.max(0, Math.min(most, progress.peek() + (pushing ? seconds / holdSeconds : -seconds * healRate)))
      progress.value = next
      // A crack sounds at each quarter it passes.
      const quarter = Math.floor(next * 4)
      if (quarter > cracked.current && quarter < 4) actions.cue("crack")
      cracked.current = Math.max(cracked.current, quarter)
      if (next >= most && holding.current) broken.value = true
      if (next < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [phase.value])
  // Broken, with the answer in and the build-up done: the light rises to what came, then the seal bursts (once; its timers go with the screen).
  const rising = useRef<Array<ReturnType<typeof setTimeout>> | null>(null)
  useEffect(() => () => rising.current?.forEach(clearTimeout), [])
  const ready = !reveal.failed && reveal.results !== null && broken.value && progress.value >= 1
  useEffect(() => {
    if (!ready || rising.current !== null) return
    const wait = Math.max(0, opened.current + buildUpMs - performance.now())
    const steps: Array<[number, () => void]> = [[wait, () => (phase.value = "rise")]]
    let elapsed = wait + riseMs.white
    // A gold light rises through purple; any other straight to its own.
    const through: Light | null = light === "gold" ? "purple" : light === "white" ? null : light
    if (through !== null) {
      steps.push([elapsed, () => { glow.value = through; actions.cue("rise") }])
      elapsed += riseMs[through]
    }
    if (light === "gold") {
      steps.push([elapsed, () => { glow.value = "gold"; actions.cue("gold") }])
      elapsed += riseMs.gold
    }
    steps.push([elapsed, () => {
      phase.value = "burst"
      actions.cue("burst")
    }], [elapsed + burstMs[light], () => (phase.value = shown.length === 0 ? "summary" : "show")])
    rising.current = steps.map(([ms, run]) => setTimeout(run, ms))
  }, [ready])
  // A call not made: the seal crumbles, and the screen goes back to the banner.
  useEffect(() => {
    if (!reveal.failed) return
    phase.value = "crumble"
    actions.cue("crumble")
    const timer = setTimeout(done, crumbleMs)
    return () => clearTimeout(timer)
  }, [reveal.failed])
  // What comes out sounds as it shows.
  useEffect(() => {
    if (phase.value !== "show") return
    const result = shown[index.value]
    if (result?.kind === "character") actions.cue("character")
    else if (result?.kind === "aspect" || result?.kind === "cosmetic" || result?.kind === "relic") actions.cue("aspect")
  }, [phase.value, index.value])

  const next = () => {
    if (index.value + 1 < shown.length) index.value += 1
    else phase.value = "summary"
  }
  const element = best?.kind === "character" ? elementOf(tuning, best.id) : undefined
  const current = phase.value === "show" ? shown[index.value] : undefined
  // The sky is plain stone around the seal; a character arriving brings hers.
  const sky = current?.kind === "character" ? elementOf(tuning, current.id) : phase.value === "burst" && element !== undefined ? element : "plain"
  useEffect(() => { store.sky.value = sky }, [sky])
  useEffect(() => { store.rays.value = current?.kind === "character" }, [current?.kind])
  useEffect(() => () => { store.sky.value = null; store.rays.value = false }, [])

  if (phase.value === "seal" || phase.value === "rise" || phase.value === "burst" || phase.value === "crumble") {
    const p = progress.value
    const waiting = phase.value === "seal" && broken.value && p < 1
    return <div class="reveal" data-phase={phase.value} data-light={phase.value === "burst" ? light : glow.value} data-element={element} data-waiting={waiting ? "" : undefined} style={{ "--p": p }}>
      <div class="reveal__dim" aria-hidden="true" />
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
      <p class="reveal__hint">{phase.value === "seal" && !broken.value ? (store.device.value === "touch" ? "Hold the seal, or swipe up" : "Hold the seal to break it") : ""}</p>
      {phase.value === "seal" && !broken.value && <span class="reveal__skip"><RoundButton icon="next" tone="dark" label="Break it now" onClick={breakSeal} /></span>}
    </div>
  }

  if (current !== undefined) {
    const counter = shown.length > 1 ? <span class="reveal__count">{index.value + 1} / {shown.length}</span> : null
    if (current.kind === "character") {
      const spec = tuning.characters[current.id], own = elementOf(tuning, current.id)
      return <div class="reveal reveal--character" data-element={own} key={`c-${index.value}`}>
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
          <p class="dim">Good against · {aspect.against}</p>
          <Pill icon="next" onClick={next}>Next</Pill>
        </section>
      </div>
    }
    if (current.kind === "cosmetic") {
      const look = cosmeticOf(tuning.cosmetics, current.id)
      return <div class="reveal reveal--look" key={`l-${index.value}`}>
        <div class="reveal__rays" aria-hidden="true" />
        <section class="reveal__prize">
          {counter}
          <span class="reveal__orb"><LookIcon kind={look.kind} /></span>
          <Label>New look · {look.kind === "tint" ? `${tuning.characters[look.character!].name}'s tint` : "A trail for any spirit"}</Label>
          <h1>{look.name}</h1>
          <p>{look.about}</p>
          <p class="dim">Only the Spirit Call gives it. Wear it from her page.</p>
          <Pill icon="next" onClick={next}>Next</Pill>
        </section>
      </div>
    }
    if (current.kind === "relic") {
      const relic = relicOf(tuning.relics, current.id)
      const tiers = ["I", "II", "III"] as const
      return <div class="reveal reveal--relic" key={`r-${index.value}`}>
        <section class="reveal__prize">
          {counter}
          <span class="reveal__orb"><RelicIcon slot={relic.slot} element={relic.element} /></span>
          <Label>{current.dust > 0 ? "Relic · already at its last tier" : current.tier === 1 ? `New relic · ${slotName(relic.slot)}` : `Relic · tier ${tiers[current.tier - 1]}`}</Label>
          <h1>{relic.name}</h1>
          {current.dust > 0
            ? <p class="reveal__supply"><span><Icon name="dust" />+{current.dust}</span></p>
            : <p>{current.tier === 1 ? relic.tiers[1].adds : `Tier ${tiers[current.tier - 1]}: ${relic.tiers[current.tier].adds}`}</p>}
          <p class="dim">{current.dust > 0 ? "It turned into dust: spend it in the shop." : relic.about}</p>
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
            : result.kind === "cosmetic"
              ? <Card fresh art={<LookIcon kind={cosmeticOf(tuning.cosmetics, result.id).kind} />} foot="NEW" label={describeResult(store, result)} />
              : result.kind === "relic"
                ? <Card fresh={result.tier === 1 && result.dust === 0} tint={relicOf(tuning.relics, result.id).element ?? undefined} art={<RelicIcon slot={relicOf(tuning.relics, result.id).slot} element={relicOf(tuning.relics, result.id).element} />} foot={result.dust > 0 ? `+${result.dust}` : result.tier === 1 ? "NEW" : `TIER ${["I", "II", "III"][result.tier - 1]}`} label={describeResult(store, result)} />
                : <Card art={<Icon name="gold" />} foot={`+${(result.amounts.gold ?? 0).toLocaleString("en-US")}`} label={describeResult(store, result)} />}
        <small>{result.kind === "supply" ? "Supply" : describeResult(store, result).replace(/ \(.*\)$/, "")}</small>
      </div>)}</div>
      <Pill icon="check" onClick={done}>Done</Pill>
    </section>
  </div>
}

/** How a relic's slot is called. */
const slotName = (slot: "strike" | "dash" | "element" | "survival"): string => slot === "strike" ? "Strike" : slot === "dash" ? "Dash" : slot === "element" ? "Element" : "Survival"

/** A supply's gold and materials, large. */
const SupplyAmounts = ({ store, result }: { readonly store: UiStore; readonly result: Extract<CallResult, { kind: "supply" }> }) => (
  <div class="reveal__supply">
    <span><Icon name="gold" />{(result.amounts.gold ?? 0).toLocaleString("en-US")}</span>
    {materialsIn(store, result.amounts).map((id) => <span key={id}><MaterialIcon store={store} material={id} />{result.amounts[id]}</span>)}
  </div>
)
