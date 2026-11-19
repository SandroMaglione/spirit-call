/**
 * The email sign-up for the next Typeonce game, in the Results screen's top
 * right corner (when it shows: see `account/signup.ts`). At rest, a chip:
 * the studio's mark and "Next game from Typeonce", and a × that closes it
 * for a day. Tapping it opens a panel in the same corner, the field focused:
 * what the studio offers, an email field, and the button (dark: the
 * screen's one cream button is "Play next"). The panel's × goes back to the
 * chip. It never takes focus by itself, and taps on it never reach the
 * results behind (a tap there shows them all at once).
 */
import { useSignal } from "@preact/signals"
import { useEffect, useRef } from "preact/hooks"

import type { SubscribeOutcome } from "../app/subscribe.ts"
import { Icon } from "./Icon.tsx"
import type { UiActions } from "./store.ts"
import { TypeonceMark } from "./TypeonceMark.tsx"

const offer = "Spirit Call is made by Typeonce Games. Leave your email and the next free game reaches you the day it ships."

/** What each answer says, in place of the offer's line. */
const answers: Record<SubscribeOutcome, string> = {
  ok: "Check your inbox to confirm.",
  invalid_email: "That address does not look right.",
  rate_limited: "Too many tries. Wait a minute and try again.",
  unavailable: "That did not go through. Try again."
}

type Status = "idle" | "sending" | SubscribeOutcome

export const Signup = ({ actions, enabled }: { readonly actions: Pick<UiActions, "subscribe" | "closeSignup">; readonly enabled: boolean }) => {
  const view = useSignal<"chip" | "panel" | "gone">("chip")
  const status = useSignal<Status>("idle")
  const email = useSignal("")
  const field = useRef<HTMLInputElement>(null)
  // The field takes focus only once the player opened the panel.
  useEffect(() => {
    if (view.value === "panel") field.current?.focus({ preventScroll: true })
  }, [view.value])
  if (view.value === "gone") return null
  const failed = status.value !== "idle" && status.value !== "sending" && status.value !== "ok"
  const submit = (event: Event) => {
    event.preventDefault()
    if (status.value === "sending") return
    status.value = "sending"
    void actions.subscribe(email.value.trim()).then((outcome) => {
      status.value = outcome
      if (outcome !== "ok") field.current?.focus({ preventScroll: true })
    })
  }
  return <div class={`signup${failed ? " is-error" : ""}`} onClick={(event) => event.stopPropagation()}>
    {view.value === "chip"
      ? <div class="signup__chip">
        <button type="button" class="signup__open" disabled={!enabled} aria-haspopup="dialog" onClick={() => (view.value = "panel")}>
          <span class="signup__dot"><TypeonceMark /></span><span>Next game from <b>Typeonce</b></span>
        </button>
        <button type="button" class="signup__close" disabled={!enabled} aria-label="Not now" onClick={() => { actions.closeSignup(); view.value = "gone" }}><Icon name="close" /></button>
      </div>
      : <form class="panel signup__panel" noValidate aria-label="Typeonce Games" onSubmit={submit}>
        <header class="panel__head">
          <TypeonceMark /><span class="panel__title">Typeonce Games</span>
          {/* Signed up, closing it is for good (the chip is not offered again); otherwise it goes back to the chip. */}
          <button type="button" class="signup__back" aria-label="Close" onClick={() => (view.value = status.value === "ok" ? "gone" : "chip")}><Icon name="close" /></button>
        </header>
        <div class="panel__body">
          <h2 class="signup__headline">Play the next Typeonce game first</h2>
          <p class={`signup__note${status.value === "ok" ? " is-done" : ""}`} role="status">
            {status.value === "ok" && <Icon name="check" />}
            {status.value === "idle" || status.value === "sending" ? offer : answers[status.value]}
          </p>
          {status.value !== "ok" && <>
            <input ref={field} class="text-input signup__field" type="email" name="email" placeholder="Your email" aria-label="Your email"
              autocomplete="email" autocapitalize="off" spellcheck={false} enterkeyhint="send" aria-invalid={status.value === "invalid_email"}
              value={email.value} onInput={(event) => {
                email.value = event.currentTarget.value
                // An error clears as soon as the address is edited.
                if (failed) status.value = "idle"
              }} />
            <button type="submit" class="pill signup__send" data-tone="dark" disabled={status.value === "sending"} aria-busy={status.value === "sending"}><span class="pill__label">Get new games</span></button>
            <p class="signup__fine">One email per new game. Unsubscribe anytime.</p>
          </>}
        </div>
      </form>}
  </div>
}
