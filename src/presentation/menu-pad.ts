/**
 * A gamepad in the menus (and the pause menu, the results, the list of
 * accounts): the d-pad or the left stick moves the focus to the nearest
 * button that way, south presses it, and east goes back (as Esc and
 * Android's back button do). Left and right change a focused slider.
 * Holding a direction repeats it.
 *
 * It reads its own `Gamepad.actions`, so it neither takes nor leaves presses
 * the arena's would see. While a settings screen waits for the button to
 * bind (`listen`), the next button pressed goes there instead.
 */
import { Gamepad } from "@typeonce/ritmo-browser"

/** Fixed: the way through the menus never moves, whatever the player bound for fights. */
const navBindings = {
  up: ["dpadUp"],
  down: ["dpadDown"],
  left: ["dpadLeft"],
  right: ["dpadRight"],
  confirm: ["south"],
  back: ["east"]
} as const

type Direction = "up" | "down" | "left" | "right"
const directions: ReadonlyArray<Direction> = ["up", "down", "left", "right"]
const unit: { readonly [D in Direction]: { readonly x: number; readonly y: number } } = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
}

/** How long a direction is held before it repeats, then how often, in milliseconds. */
const repeat = { first: 380, every: 130 }
/** How far the left stick tilts before it counts as a direction. */
const stickThreshold = 0.55

const focusable = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"

const visible = (element: Element): boolean => element.getClientRects().length > 0 && element.closest("[hidden], [inert]") === null

export interface MenuPadOptions {
  /** Where the pads are read. */
  readonly host: Gamepad.GamepadHost
  /** Where the buttons are: the UI's root. */
  readonly root: HTMLElement
  /** Whether the menus have the gamepad now (not while a fight takes it). */
  readonly active: () => boolean
  /** Goes back: what Esc does where the focus is. */
  readonly back: () => void
  /** A pad was used here, with its `id` (for the labels its buttons carry). */
  readonly used?: (id: string | null) => void
}

export interface MenuPad {
  /** Sends the next button pressed to `pick` instead of moving through the menus; the returned function stops waiting. */
  listen(pick: (button: Gamepad.Button) => void): () => void
  dispose(): void
}

/**
 * The buttons the focus moves between: those of the dialog on top, if one
 * is open, else the screen's (the menus, the pause menu, the results: not
 * the HUD's beneath them), else anything in the root.
 */
const candidates = (root: HTMLElement): ReadonlyArray<HTMLElement> => {
  const within = (scope: Element) => [...scope.querySelectorAll<HTMLElement>(focusable)].filter(visible)
  const dialog = [...document.querySelectorAll<HTMLElement>("[role=\"dialog\"], [aria-modal=\"true\"]")].findLast(visible)
  if (dialog !== undefined) return within(dialog)
  const screens = [...root.querySelectorAll(".ui-screen")].flatMap(within)
  return screens.length > 0 ? screens : within(root)
}

const centerOf = (element: Element) => {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/** The candidate nearest `from` in `direction`: ahead of it, sideways distance counting twice. */
export const nearest = <T>(from: { readonly x: number; readonly y: number }, direction: { readonly x: number; readonly y: number }, others: ReadonlyArray<{ readonly item: T; readonly at: { readonly x: number; readonly y: number } }>): T | undefined => {
  let best: T | undefined
  let bestScore = Number.POSITIVE_INFINITY
  for (const { item, at } of others) {
    const dx = at.x - from.x
    const dy = at.y - from.y
    const ahead = dx * direction.x + dy * direction.y
    if (ahead <= 1) continue
    const side = Math.abs(dx * direction.y - dy * direction.x)
    const score = ahead + side * 2
    if (score < bestScore) {
      best = item
      bestScore = score
    }
  }
  return best
}

const focus = (element: HTMLElement): void => {
  // `focusVisible` draws the focus ring as for the keyboard (a programmatic focus may not otherwise).
  element.focus({ focusVisible: true } as FocusOptions)
  element.scrollIntoView({ block: "nearest", inline: "nearest" })
}

export const createMenuPad = (options: MenuPadOptions): MenuPad => {
  const pad = Gamepad.actions(options.host, navBindings)
  let waiting: ((button: Gamepad.Button) => void) | null = null
  let held: { direction: Direction; next: number } | null = null
  let frame = 0

  const current = (): HTMLElement | undefined => {
    const active = document.activeElement
    return active instanceof HTMLElement && candidates(options.root).includes(active) ? active : undefined
  }

  const move = (direction: Direction): void => {
    const all = candidates(options.root)
    const from = current()
    if (from === undefined) {
      if (all[0] !== undefined) focus(all[0])
      return
    }
    if (from instanceof HTMLInputElement && from.type === "range" && (direction === "left" || direction === "right")) {
      if (direction === "left") from.stepDown()
      else from.stepUp()
      from.dispatchEvent(new Event("input", { bubbles: true }))
      from.dispatchEvent(new Event("change", { bubbles: true }))
      return
    }
    const next = nearest(centerOf(from), unit[direction], all.filter((element) => element !== from).map((item) => ({ item, at: centerOf(item) })))
    if (next !== undefined) focus(next)
  }

  const step = (now: number): void => {
    frame = requestAnimationFrame(step)
    const snapshot = pad.snapshot()
    const pressed = Gamepad.buttonNames.find((name) => snapshot.buttons[name].pressed)
    if (pressed !== undefined) options.used?.(snapshot.id)
    if (waiting !== null) {
      if (pressed === undefined) return
      const pick = waiting
      waiting = null
      held = null
      pick(pressed)
      return
    }
    if (!options.active()) {
      held = null
      return
    }
    const { actions, left } = snapshot
    if (actions.confirm.pressed) {
      const target = current()
      if (target === undefined) move("down")
      else target.click()
    }
    if (actions.back.pressed) options.back()
    // The d-pad, else the stick's stronger axis past the threshold.
    const stick: Direction | null = Math.max(Math.abs(left.x), Math.abs(left.y)) < stickThreshold
      ? null
      : Math.abs(left.x) > Math.abs(left.y) ? (left.x > 0 ? "right" : "left") : (left.y > 0 ? "down" : "up")
    const direction = directions.find((name) => actions[name].held) ?? stick
    if (direction === null) {
      held = null
      return
    }
    if (held === null || held.direction !== direction) {
      move(direction)
      held = { direction, next: now + repeat.first }
    } else if (now >= held.next) {
      move(direction)
      held.next = now + repeat.every
    }
  }
  frame = requestAnimationFrame(step)

  return {
    listen(pick) {
      waiting = pick
      return () => {
        if (waiting === pick) waiting = null
      }
    },
    dispose() {
      cancelAnimationFrame(frame)
      pad.dispose()
    }
  }
}
