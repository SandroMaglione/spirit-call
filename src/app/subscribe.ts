/**
 * The email sign-up's sender: an address left on the Results screen (see
 * `ui/Signup.tsx`) goes to the Typeonce Games studio's sign-up, which sends
 * a confirmation email (the studio's homepage runs the same form). Nothing
 * is sent until the player submits, and nothing else is sent: no analytics.
 *
 * The endpoint only takes requests from a typeonce.games address, so the
 * sign-up shows only there (not in the phone apps). A dev build fakes the
 * answer and sends nothing: an address without "@" is refused as invalid,
 * one starting with "limit@" is rate limited, one starting with "down@"
 * fails; any other succeeds.
 */
import { inApp } from "./device.ts"

export const subscribeEndpoint = "https://typeonce.games/api/subscribe"

/** The game's name for the studio's list (the tag the address gets). */
export const subscribeGame = "spirit-call"

/** How a sign-up went: the endpoint's answer, anything unexpected being `unavailable`. */
export type SubscribeOutcome = "ok" | "invalid_email" | "rate_limited" | "unavailable"

const errors: ReadonlyArray<SubscribeOutcome> = ["invalid_email", "rate_limited", "unavailable"]

/** Whether `hostname` is typeonce.games or one of its subdomains: the addresses the endpoint takes requests from. */
export const typeonceHost = (hostname: string): boolean => hostname === "typeonce.games" || hostname.endsWith(".typeonce.games")

/** Whether the sign-up may show here: on a typeonce.games address, or in a dev build (which fakes it), never in the apps. */
export const signupReachable = (): boolean => !inApp && (import.meta.env.DEV || typeonceHost(window.location.hostname))

/** A dev build's answer, after a moment as the endpoint takes. */
const fake = async (email: string): Promise<SubscribeOutcome> => {
  await new Promise((resolve) => setTimeout(resolve, 600))
  if (!email.includes("@")) return "invalid_email"
  if (email.startsWith("limit@")) return "rate_limited"
  if (email.startsWith("down@")) return "unavailable"
  return "ok"
}

/** Signs `email` up for the next Typeonce game; never fails (a network failure is `unavailable`). */
export const subscribe = async (email: string): Promise<SubscribeOutcome> => {
  if (import.meta.env.DEV) return fake(email)
  try {
    const response = await fetch(subscribeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `website` is the endpoint's trap for bots: always empty.
      body: JSON.stringify({ email, game: subscribeGame, referrer: window.location.href, website: "" })
    })
    if (response.ok) return "ok"
    const answer: unknown = await response.json()
    const error = typeof answer === "object" && answer !== null && "error" in answer ? answer.error : undefined
    return errors.find((each) => each === error) ?? "unavailable"
  } catch {
    return "unavailable"
  }
}
