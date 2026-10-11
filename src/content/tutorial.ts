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

/** A dummy a step stands up (it never falls), offset from the player when it first appears. */
export interface TutorialDummy {
  readonly kind: EnemyKind
  readonly offset: Spot
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

/** Above the player on screen, clear of the touch buttons, wherever the dashes ended. */
const dummy = (kind: EnemyKind): TutorialDummy => ({ kind, offset: { x: -0.08, y: -0.08 } })

/** The tutorial's steps, in order: moving, dashing, the attack, the special, the ultimate, and the perfect dodge. */
export const tutorialSteps: ReadonlyArray<TutorialStep> = [
  // Left of the spawn (the arena's middle) on screen, clear of the buttons on the right.
  { kind: "move", text: "Move here", to: { x: 0.355, y: 0.535 } },
  { kind: "dash", text: "Dash", times: 2 },
  { kind: "attack", text: "Attack", hits: 4, dummy: dummy("sparringDummy") },
  { kind: "special", text: "Special skill", dummy: dummy("sparringDummy") },
  { kind: "ultimate", text: "Ultimate", dummy: dummy("sparringDummy") },
  { kind: "perfectDodge", text: "Dash on gold", times: 1, dummy: dummy("sparringDummy") }
]
