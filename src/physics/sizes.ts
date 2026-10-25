import type * as Result from "@typeonce/ritmo/Result"

/**
 * The value of a constructor that checks a size (a grid's cell size). Only
 * literals and default tuning come here, so a failure is a typo found the
 * moment the module loads.
 */
export const made = <A, E extends { readonly _tag: string; readonly value: number }>(result: Result.Result<A, E>): A => {
  if (!result.ok) throw new Error(`Not a positive size: ${result.error.value}`)
  return result.value
}
