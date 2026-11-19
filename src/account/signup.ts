/**
 * When the Results screen offers the email sign-up for the next Typeonce
 * game (the chip in its corner, see `ui/Signup.tsx`): pure rules over what
 * this device remembers of it. It belongs to the device, not to an account
 * (one device can hold several accounts), and is kept under `shooter.signup`
 * (see `signup-store.ts` and docs/saves.md).
 *
 * It shows after a cleared quest, from the device's second one on: never
 * after a defeat (the player wants Retry), after the tutorial, a trial or
 * practice (none of them is a quest), or when a new character is revealed
 * (her model takes the side of the screen). Signing up hides it for good;
 * closing it hides it for a day.
 */

/** What this device remembers of the sign-up. */
export interface Signup {
  /** Whether the player signed up from this device: it never shows again. */
  readonly signedUp: boolean
  /** When the player last closed the chip (milliseconds since the epoch), `null` for never. */
  readonly closedAt: number | null
  /** How many quests were cleared on this device (counted from when the game first kept it). */
  readonly clears: number
}

/** A device that never saw the sign-up. */
export const noSignup: Signup = { signedUp: false, closedAt: null, clears: 0 }

/** How long closing the chip hides it, in milliseconds. */
export const closedFor = 24 * 60 * 60 * 1000

/** The cleared quest that shows it first: the device's second, so the first clear is the game's alone. */
export const firstOfferAt = 2

/** How a run ended, as far as the sign-up cares. */
export interface SignupRun {
  /** Whether the run was a quest recorded on the account (not the tutorial, a trial, practice, or a dev quick start). */
  readonly quest: boolean
  readonly cleared: boolean
  /** Whether it revealed a new character (her model takes the left of the screen). */
  readonly newcomer: boolean
}

/** The device after a run ended: a cleared quest counts. */
export const afterRun = (signup: Signup, run: SignupRun): Signup =>
  run.quest && run.cleared ? { ...signup, clears: signup.clears + 1 } : signup

/** Whether the Results screen of `run` offers the sign-up, at `now` (with `signup` already counting the run, see `afterRun`). */
export const offersSignup = (signup: Signup, run: SignupRun, now: number): boolean =>
  run.quest && run.cleared && !run.newcomer && !signup.signedUp && signup.clears >= firstOfferAt &&
  (signup.closedAt === null || now - signup.closedAt >= closedFor)

/** The device after the player closed the chip at `now`. */
export const closeSignup = (signup: Signup, now: number): Signup => ({ ...signup, closedAt: now })

/** The device after the player signed up. */
export const signUp = (signup: Signup): Signup => ({ ...signup, signedUp: true })
