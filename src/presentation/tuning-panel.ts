/**
 * A developer panel for live tuning, toggled with the backquote key (`).
 *
 * It lists every number and switch in the tuning, sends changes to the
 * running game, and keeps them in localStorage so they survive reloads.
 * "Copy JSON" copies the full current tuning, ready to paste back into
 * `config/tuning.ts` once the numbers feel right.
 */
import { champion, elite } from "../content/challenges.ts"
import type { EliteElement } from "../content/challenges.ts"
import { defaultTuning } from "../config/tuning.ts"
import type { Tuning } from "../config/tuning.ts"
import { setAt } from "../dev/commands.ts"
import type { DevCommandsValue, TuningPath } from "../dev/commands.ts"
import type { EnemyKind } from "../schema.ts"

const storageKey = "shooter.tuning"

/** Tuning saved by a previous session, or the defaults. */
export const loadSavedTuning = (): Tuning => {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === null) return defaultTuning
    const overrides = JSON.parse(saved) as ReadonlyArray<{ readonly path: TuningPath; readonly value: number | boolean }>
    let tuning: Tuning = defaultTuning
    for (const { path, value } of overrides) {
      if (valueAt(defaultTuning, path) !== undefined) tuning = setAt(tuning, path, value)
    }
    return tuning
  } catch {
    return defaultTuning
  }
}

const valueAt = (node: unknown, path: TuningPath): unknown =>
  path.reduce<unknown>((current, key) => (typeof current === "object" && current !== null ? (current as Record<string, unknown>)[key] : undefined), node)

/** A list whose items are groups of values (a combo's moves), shown as numbered groups; other lists are not editable. */
const isListOfRecords = (list: ReadonlyArray<unknown>): boolean =>
  list.length > 0 && list.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))

/** Step size for a number input, from the default's magnitude. */
const stepFor = (value: number): number => {
  const magnitude = Math.abs(value)
  if (magnitude === 0) return 0.01
  if (Number.isInteger(value) && magnitude >= 10) return 1
  if (magnitude >= 100) return 1
  if (magnitude >= 10) return 0.5
  if (magnitude >= 1) return 0.05
  return 0.005
}

export const createTuningPanel = (mount: HTMLElement, initial: Tuning, queue: DevCommandsValue) => {
  let current = initial
  const overrides = new Map<string, { path: TuningPath; value: number | boolean }>()
  for (const saved of (() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as Array<{ path: TuningPath; value: number | boolean }>
    } catch {
      return []
    }
  })()) overrides.set(saved.path.join("."), saved)

  const root = document.createElement("aside")
  root.className = "tuning"
  root.hidden = true
  root.innerHTML = `
    <header class="tuning__header">
      <strong>Tuning</strong>
      <span class="tuning__hint">\` to toggle · spawn-time values apply after restart</span>
      <div class="tuning__actions">
        <button data-copy>Copy JSON</button>
        <button data-reset>Reset</button>
        <button data-crash title="Fail the next step, to see the crash screen">Crash</button>
      </div>
    </header>
    <section class="tuning__spawn">
      <strong>Spawn</strong>
      <div class="tuning__spawn-buttons" data-spawn></div>
    </section>
    <div class="tuning__body" data-body></div>
  `
  const body = root.querySelector<HTMLElement>("[data-body]")!
  root.querySelector("[data-crash]")!.addEventListener("click", () => (queue.crash = true))

  // One button per enemy type, plus clear; waves.enabled below toggles waves for a quiet sandbox.
  const spawnButtons = root.querySelector<HTMLElement>("[data-spawn]")!
  // What the buttons spawn: plain enemies, elites of an element, or champions of one (the toggle cycles).
  const eliteChoices: ReadonlyArray<{ readonly element: EliteElement; readonly champion: boolean } | null> = [
    null,
    ...(["fire", "water", "thunder"] as const).map((element) => ({ element, champion: false })),
    ...(["fire", "water", "thunder"] as const).map((element) => ({ element, champion: true }))
  ]
  let eliteChoice = 0
  const eliteToggle = document.createElement("button")
  const showElite = () => {
    const choice = eliteChoices[eliteChoice] ?? null
    eliteToggle.textContent = choice === null ? "elite: off" : `${choice.champion ? "champion" : "elite"}: ${choice.element}`
  }
  showElite()
  eliteToggle.addEventListener("click", () => {
    eliteChoice = (eliteChoice + 1) % eliteChoices.length
    showElite()
  })
  spawnButtons.append(eliteToggle)
  for (const kind of Object.keys(initial.enemies) as Array<EnemyKind>) {
    const button = document.createElement("button")
    button.textContent = kind
    button.addEventListener("click", () => {
      const choice = eliteChoices[eliteChoice] ?? null
      queue.spawns.push(choice === null ? kind : choice.champion ? champion(kind, choice.element) : elite(kind, choice.element))
    })
    spawnButtons.append(button)
  }
  const clear = document.createElement("button")
  clear.textContent = "clear"
  clear.className = "is-clear"
  clear.addEventListener("click", () => {
    queue.clear = true
  })
  spawnButtons.append(clear)
  const inputs = new Map<string, HTMLInputElement>()

  const persist = () => localStorage.setItem(storageKey, JSON.stringify([...overrides.values()]))

  const render = (node: unknown, path: Array<string>, container: HTMLElement): void => {
    if (typeof node !== "object" || node === null || (Array.isArray(node) && !isListOfRecords(node))) return
    for (const [key, value] of Object.entries(node)) {
      const at = [...path, key]
      if (typeof value === "number" || typeof value === "boolean") {
        const row = document.createElement("label")
        row.className = "tuning__row"
        const name = document.createElement("span")
        name.textContent = key
        const input = document.createElement("input")
        if (typeof value === "boolean") {
          input.type = "checkbox"
          input.checked = value
        } else {
          input.type = "number"
          input.step = String(stepFor(valueAt(defaultTuning, at) as number))
          input.value = String(value)
        }
        const id = at.join(".")
        if (valueAt(defaultTuning, at) !== value) row.classList.add("is-changed")
        input.addEventListener("input", () => {
          const next = input.type === "checkbox" ? input.checked : Number(input.value)
          if (typeof next === "number" && !Number.isFinite(next)) return
          current = setAt(current, at, next)
          queue.edits.push({ path: at, value: next })
          overrides.set(id, { path: at, value: next })
          row.classList.toggle("is-changed", valueAt(defaultTuning, at) !== next)
          persist()
        })
        // Keep typing in the panel from moving the player.
        input.addEventListener("keydown", (event) => event.stopPropagation())
        inputs.set(id, input)
        row.append(name, input)
        container.append(row)
      } else if (typeof value === "object" && value !== null && (Array.isArray(value) ? isListOfRecords(value) : !("kind" in value && Object.keys(value).length === 1))) {
        const group = document.createElement("details")
        group.className = "tuning__group"
        group.open = path.length === 0 && ["player", "dash", "perfectDodge", "breaking", "elements", "feedback"].includes(key)
        const summary = document.createElement("summary")
        summary.textContent = key
        group.append(summary)
        render(value, at, group)
        container.append(group)
      }
    }
  }
  render(current, [], body)

  root.querySelector("[data-copy]")!.addEventListener("click", () => {
    void navigator.clipboard?.writeText(JSON.stringify(current, null, 2))
  })
  root.querySelector("[data-reset]")!.addEventListener("click", () => {
    overrides.clear()
    localStorage.removeItem(storageKey)
    current = defaultTuning
    queue.replace = defaultTuning
    queue.edits.length = 0
    body.replaceChildren()
    render(current, [], body)
  })

  const onKey = (event: KeyboardEvent) => {
    // The backquote, or the key where it sits on other layouts (left of 1 or of Z: an Italian keyboard has no backquote key).
    if (event.key === "`" || event.code === "Backquote" || event.code === "IntlBackslash") root.hidden = !root.hidden
  }
  window.addEventListener("keydown", onKey)
  mount.append(root)

  return {
    dispose() {
      window.removeEventListener("keydown", onKey)
      root.remove()
    }
  }
}
