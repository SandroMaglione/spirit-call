// Lint fixture: every line breaks a project rule (see test/lint.test.ts).
import * as Effect from "effect"
import { Fx } from "../presentation/fx.ts"
import { render } from "preact"
export const probe = [Effect, Fx, render, Math.random(), Date.now(), new Date(), setTimeout(() => {}, 1)]
export const math = [Math.sin(1), 3 ** 1.5, { since: Infinity }]
