/**
 * The tutorial (see the `tutorial` objective): one thing asked at a time,
 * written on the arena's floor where it is to be done, each done before the
 * next shows. A step's `text` is what the floor says; how to do it on this
 * device (a key, a button) is the presentation's to add.
 */
import type { EnemyKind } from "./enemies.ts"

/** A place in the arena, as shares of its size. */
export interface Spot {
  readonly x: number
  readonly y: number
}

/** A dummy a step stands up (it never falls), at `at`. */
export interface TutorialDummy {
  readonly kind: EnemyKind
  readonly at: Spot
}

export type TutorialStep =
  /** Walk into the circle at `to`. */
  | { readonly kind: "move"; readonly text: string; readonly to: Spot }
  /** Dash `times` times. */
  | { readonly kind: "dash"; readonly text: string; readonly times: number }
  /** Land `hits` blows of the basic attack on the dummy. */
  | { readonly kind: "attack"; readonly text: string; readonly hits: number; readonly dummy: TutorialDummy }
  /** Use the special skill (it is ready). */
  | { readonly kind: "special"; readonly text: string; readonly dummy: TutorialDummy }
  /** Use the ultimate (its energy is filled for it). */
  | { readonly kind: "ultimate"; readonly text: string; readonly dummy: TutorialDummy }
  /** Dash through the dummy's blow as it lands, `times` times. */
  | { readonly kind: "perfectDodge"; readonly text: string; readonly times: number; readonly dummy: TutorialDummy }

export type TutorialStepKind = TutorialStep["kind"]

/** Where the dummies stand: ahead of the player's spawn (the arena's middle), right and up on screen. */
const dummy = (kind: EnemyKind): TutorialDummy => ({ kind, at: { x: 0.6, y: 0.4 } })

/** The tutorial's steps, in order: moving, dashing, the attack, the special, the ultimate, and the perfect dodge. */
export const tutorialSteps: ReadonlyArray<TutorialStep> = [
  { kind: "move", text: "Move here", to: { x: 0.5, y: 0.62 } },
  { kind: "dash", text: "Dash", times: 2 },
  { kind: "attack", text: "Attack", hits: 4, dummy: dummy("dummy") },
  { kind: "special", text: "Special skill", dummy: dummy("dummy") },
  { kind: "ultimate", text: "Ultimate", dummy: dummy("dummy") },
  { kind: "perfectDodge", text: "Dodge as it strikes", times: 1, dummy: dummy("sparringDummy") }
]
