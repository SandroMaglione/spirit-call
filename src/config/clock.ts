import { Clock } from "@typeonce/ritmo"

/**
 * The simulation step: 60 fixed steps a second. The host loop
 * (`FixedLoop.start({ step })`) and the `Time` clock share it, so gameplay is
 * identical at any display refresh rate.
 */
export const step = Clock.hz(60)
