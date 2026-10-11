/**
 * The screen a failure leaves: what happened in a line, one way on (restart,
 * or try again), and the details folded away. Plain DOM styled from
 * index.html, so it shows even when what failed is the UI itself, or the game
 * never got as far as loading it. It writes nothing: the save stays as it was
 * last saved.
 */

export interface Crash {
  readonly title: string
  readonly message: string
  /** The button's name. */
  readonly action: string
  /** What the button does (the page starts over, once what was being saved is saved). */
  readonly onAction: () => void | Promise<void>
  /** What went wrong, for a report. */
  readonly detail: string
}

/** Whether a crash screen is up (only the first failure shows). */
export const crashShowing = (): boolean => document.querySelector(".crash") !== null

/** Shows `crash` over `parent`, over everything else; a second failure while it shows changes nothing. */
export const showCrash = (parent: HTMLElement, crash: Crash): void => {
  if (crashShowing()) return
  const root = document.createElement("div")
  root.className = "crash"
  root.setAttribute("role", "alertdialog")
  root.setAttribute("aria-modal", "true")
  const box = document.createElement("div")
  box.className = "crash__box"
  const title = document.createElement("h1")
  title.textContent = crash.title
  const message = document.createElement("p")
  message.textContent = crash.message
  const button = document.createElement("button")
  button.type = "button"
  button.className = "crash__action"
  button.textContent = crash.action
  button.addEventListener("click", () => {
    if (button.disabled) return
    button.disabled = true
    void Promise.resolve(crash.onAction()).finally(() => (button.disabled = false))
  })
  const details = document.createElement("details")
  const summary = document.createElement("summary")
  summary.textContent = "Details"
  const detail = document.createElement("pre")
  detail.textContent = crash.detail
  details.append(summary, detail)
  box.append(title, message, button, details)
  root.append(box)
  parent.append(root)
  button.focus()
}

/** An error as a report: its message and stack, and the build it happened in. */
export const describeError = (error: unknown, build: string): string =>
  `Build ${build}\n\n${error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error)}`
