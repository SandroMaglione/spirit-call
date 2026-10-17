import * as Scalar from "@typeonce/ritmo-math/Scalar"

/**
 * A constant size the physics needs positive (a grid's cell size). Only
 * literals and default tuning come here, so a failure is a typo found the
 * moment the module loads.
 */
export const positive = (value: number): Scalar.Positive => {
  const size = Scalar.Positive.result(value)
  if (!size.ok) throw new Error(`Not a positive size: ${value}`)
  return size.value
}
